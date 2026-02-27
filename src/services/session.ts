/**
 * セッション管理サービス
 * PTYセッションのライフサイクル管理
 */

import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import WebSocket from 'ws';
import * as pty from 'node-pty';
import { nanoid } from 'nanoid';

import { Client as SSHClient, ClientChannel } from 'ssh2';

import { SessionMode, SessionConfig, SessionLogMeta } from '../types/index.js';
import {
  ROOT_DIR,
  ENABLE_SESSION_LOGS,
  LOG_DIR,
  LOG_MAX_AGE_DAYS,
  LOG_MAX_SIZE_MB,
  MAX_SESSIONS,
} from '../config.js';
import logger from './logger.js';
import { resolvePath } from '../utils/path.js';
import { stripAnsi } from '../utils/text.js';
import { send } from '../utils/ws.js';
import { spawnForMode } from './pty.js';
import { createSSHSession, resizeSSHChannel, closeSSHConnection, isSSHEnabled } from './ssh.js';
import {
  detectError,
  sendErrorNotification,
  sendExitNotification,
  clearNotificationState,
} from './notifier.js';

// ============================================================
// 型定義（サーバー内部用）
// ============================================================

/** セッションログメタデータ（内部用） */
export interface SessionLogMetaInternal extends SessionLogMeta {
  size?: number;
}

/** セッション（内部用） */
export interface SessionInternal {
  id: string;
  mode: SessionMode;
  cwd: string;
  label: string;
  /** PTYプロセス（PTYモード時） */
  pty: pty.IPty | null;
  /** SSHクライアント（SSHモード時） */
  sshClient: SSHClient | null;
  /** SSHチャンネル（SSHモード時） */
  sshChannel: ClientChannel | null;
  ws: WebSocket;
  logStream: fsSync.WriteStream | null;
  logFileName: string | null;
}

// ============================================================
// セッションストア
// ============================================================

/** アクティブセッションのマップ */
export const sessions = new Map<string, SessionInternal>();

/** セッションログのメタデータマップ */
export const sessionLogs = new Map<string, SessionLogMetaInternal>();

// ============================================================
// ログ管理
// ============================================================

/**
 * ログディレクトリの初期化
 */
export async function initLogDir(): Promise<void> {
  if (!ENABLE_SESSION_LOGS) return;
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    // ログローテーション: 古いログを削除
    await rotateOldLogs();
  } catch (error) {
    const err = error as Error;
    logger.error({ err }, 'ログディレクトリの作成に失敗しました');
  }
}

/**
 * 古いセッションログを削除
 * LOG_MAX_AGE_DAYSより古いログファイルを削除
 * LOG_MAX_SIZE_MBを超過した場合も古い順に削除
 */
async function rotateOldLogs(): Promise<void> {
  try {
    const files = await fs.readdir(LOG_DIR);
    const now = Date.now();
    const maxAgeMs = LOG_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    let totalSize = 0;

    // ファイル情報を取得してソート（古い順）
    const fileInfos: Array<{ name: string; mtime: number; size: number }> = [];
    for (const file of files) {
      if (!file.startsWith('session-')) continue;
      const filePath = path.join(LOG_DIR, file);
      const stat = await fs.stat(filePath);
      fileInfos.push({ name: file, mtime: stat.mtimeMs, size: stat.size });
      totalSize += stat.size;
    }
    fileInfos.sort((a, b) => a.mtime - b.mtime);

    const maxSizeBytes = LOG_MAX_SIZE_MB * 1024 * 1024;
    let deletedCount = 0;

    for (const info of fileInfos) {
      const isOld = now - info.mtime > maxAgeMs;
      const isOverSize = totalSize > maxSizeBytes;

      if (isOld || isOverSize) {
        await fs.unlink(path.join(LOG_DIR, info.name));
        totalSize -= info.size;
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logger.info({ deletedCount }, 'ログローテーション: 古いログを削除しました');
    }
  } catch (error) {
    const err = error as Error;
    logger.error({ err }, 'ログローテーションに失敗しました');
  }
}

/**
 * ログファイル名を生成
 * @param sessionId セッションID
 * @param mode セッションモード
 * @returns ログファイル名
 */
function generateLogFileName(sessionId: string, mode: SessionMode): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `session-${timestamp}-${mode}-${sessionId}.log`;
}

// stripAnsi は utils/text.ts からインポート
// send は utils/ws.ts からインポート（循環依存の解消）

// ============================================================
// PTY環境変数フィルタ
// ============================================================

/** PTYに渡す環境変数の許可リスト */
const ENV_ALLOWLIST: ReadonlySet<string> = new Set([
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'PATH',
  'TERM',
  'COLORTERM',
  'EDITOR',
  'VISUAL',
  'PAGER',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'XDG_RUNTIME_DIR',
  'TMPDIR',
  'TMP',
  'TEMP',
  'HOSTNAME',
  'PWD',
  'OLDPWD',
  'SHLVL',
  'SSH_AUTH_SOCK',
  'GPG_AGENT_INFO',
  // Node.js関連
  // NODE_OPTIONS は --require で任意コード実行可能なため除外
  'NODE_ENV',
  'NODE_PATH',
  // Git関連
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
]);

/**
 * PTYに渡す安全な環境変数を構築
 * 許可リストに含まれる変数のみを渡し、機密情報の漏洩を防止する
 */
function buildSafeEnv(): Record<string, string> {
  const env: Record<string, string> = { TERM: 'xterm-256color' };
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key]) {
      env[key] = process.env[key] as string;
    }
  }
  return env;
}

// ============================================================
// セッション操作
// ============================================================

/**
 * 作業ディレクトリを解決
 * @param requested リクエストされたパス
 * @returns 作業ディレクトリの絶対パス
 */
function resolveCwd(requested: string | undefined): string {
  if (!requested) return ROOT_DIR;
  return resolvePath(requested);
}

/**
 * セッションを開始
 * @param config セッション設定
 * @param ws WebSocket
 * @returns セッション情報
 */
export async function startSession(config: SessionConfig, ws: WebSocket): Promise<SessionInternal> {
  // セッション数の上限チェック
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error('max-sessions-reached');
  }

  const { mode, cwd, customCommand } = config;
  const spawnConfig = spawnForMode(mode, customCommand);
  const sessionId = nanoid(10);
  const startDir = resolveCwd(cwd || '.');

  // 安全な環境変数のみPTYに渡す（機密情報の漏洩防止）
  const safeEnv = buildSafeEnv();

  const ptyProcess = pty.spawn(spawnConfig.command, spawnConfig.args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: startDir,
    env: safeEnv,
  });

  // ログファイルのセットアップ
  let logStream: fsSync.WriteStream | null = null;
  let logFileName: string | null = null;
  if (ENABLE_SESSION_LOGS) {
    logFileName = generateLogFileName(sessionId, mode);
    const logPath = path.join(LOG_DIR, logFileName);
    try {
      logStream = fsSync.createWriteStream(logPath, { flags: 'a' });
      // ログヘッダーを書き込み
      const header = `=== セッション開始 ===\n日時: ${new Date().toISOString()}\nモード: ${spawnConfig.label}\nディレクトリ: ${startDir}\nコマンド: ${spawnConfig.command} ${spawnConfig.args.join(' ')}\n${'='.repeat(40)}\n\n`;
      logStream.write(header);
      // メタデータを保存
      sessionLogs.set(sessionId, {
        id: sessionId,
        fileName: logFileName,
        mode,
        label: spawnConfig.label,
        cwd: path.relative(ROOT_DIR, startDir) || '.',
        startedAt: new Date().toISOString(),
        endedAt: null,
      });
    } catch (error) {
      const err = error as Error;
      logger.error({ err }, 'ログファイルの作成に失敗しました');
    }
  }

  const session: SessionInternal = {
    id: sessionId,
    mode,
    cwd: path.relative(ROOT_DIR, startDir) || '.',
    label: spawnConfig.label,
    pty: ptyProcess,
    sshClient: null,
    sshChannel: null,
    ws,
    logStream,
    logFileName,
  };

  sessions.set(sessionId, session);

  ptyProcess.onData((data: string) => {
    send(ws, { type: 'data', data });
    // ログに書き込み（ANSIコードを除去）
    if (logStream) {
      logStream.write(stripAnsi(data));
    }
    // エラーパターン検知 → 通知送信
    const errorLine = detectError(data);
    if (errorLine) {
      sendErrorNotification(ws, sessionId, errorLine);
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    send(ws, { type: 'exit', exitCode, signal: signal?.toString() });
    // プロセス終了通知を送信
    sendExitNotification(ws, sessionId, exitCode, signal, spawnConfig.label);
    // 通知状態をクリア
    clearNotificationState(sessionId);
    // ログを閉じる
    if (logStream) {
      const footer = `\n${'='.repeat(40)}\n=== セッション終了 ===\n日時: ${new Date().toISOString()}\n終了コード: ${exitCode}\nシグナル: ${signal || 'なし'}\n`;
      logStream.write(footer);
      logStream.end();
      // メタデータを更新
      const logMeta = sessionLogs.get(sessionId);
      if (logMeta) {
        logMeta.endedAt = new Date().toISOString();
        logMeta.exitCode = exitCode;
      }
    }
    sessions.delete(sessionId);
  });

  return session;
}

/**
 * SSHセッションを開始
 * @param config セッション設定（sshConfigが必須）
 * @param ws WebSocket
 * @returns セッション情報
 */
export async function startSSHSession(
  config: SessionConfig,
  ws: WebSocket,
): Promise<SessionInternal> {
  // セッション数の上限チェック
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error('max-sessions-reached');
  }

  if (!isSSHEnabled()) {
    throw new Error('ssh-disabled');
  }

  if (!config.sshConfig) {
    throw new Error('ssh-config-required');
  }

  const sessionId = nanoid(10);
  const sshResult = await createSSHSession(config.sshConfig);
  const { client: sshClient, channel: sshChannel } = sshResult;

  const label = `SSH: ${config.sshConfig.username}@${config.sshConfig.host}`;
  const cwdDisplay = `${config.sshConfig.host}:${config.sshConfig.port}`;

  // ログファイルのセットアップ
  let logStream: fsSync.WriteStream | null = null;
  let logFileName: string | null = null;
  if (ENABLE_SESSION_LOGS) {
    logFileName = generateLogFileName(sessionId, 'ssh');
    const logPath = path.join(LOG_DIR, logFileName);
    try {
      logStream = fsSync.createWriteStream(logPath, { flags: 'a' });
      const header = `=== SSHセッション開始 ===\n日時: ${new Date().toISOString()}\n接続先: ${config.sshConfig.username}@${config.sshConfig.host}:${config.sshConfig.port}\n認証方式: ${config.sshConfig.authMethod}\n${'='.repeat(40)}\n\n`;
      logStream.write(header);
      sessionLogs.set(sessionId, {
        id: sessionId,
        fileName: logFileName,
        mode: 'ssh',
        label,
        cwd: cwdDisplay,
        startedAt: new Date().toISOString(),
        endedAt: null,
      });
    } catch (error) {
      const err = error as Error;
      logger.error({ err }, 'ログファイルの作成に失敗しました');
    }
  }

  const session: SessionInternal = {
    id: sessionId,
    mode: 'ssh',
    cwd: cwdDisplay,
    label,
    pty: null,
    sshClient,
    sshChannel,
    ws,
    logStream,
    logFileName,
  };

  sessions.set(sessionId, session);

  // SSHチャンネルからのデータをWebSocketに転送
  sshChannel.on('data', (data: Buffer) => {
    const str = data.toString('utf-8');
    send(ws, { type: 'data', data: str });
    if (logStream) {
      logStream.write(stripAnsi(str));
    }
    // エラーパターン検知
    const errorLine = detectError(str);
    if (errorLine) {
      sendErrorNotification(ws, sessionId, errorLine);
    }
  });

  // 標準エラー出力
  sshChannel.stderr.on('data', (data: Buffer) => {
    const str = data.toString('utf-8');
    send(ws, { type: 'data', data: str });
    if (logStream) {
      logStream.write(stripAnsi(str));
    }
  });

  // チャンネルのクローズイベント
  sshChannel.on('close', () => {
    send(ws, { type: 'exit', exitCode: 0 });
    sendExitNotification(ws, sessionId, 0, undefined, label);
    clearNotificationState(sessionId);
    if (logStream) {
      const footer = `\n${'='.repeat(40)}\n=== SSHセッション終了 ===\n日時: ${new Date().toISOString()}\n`;
      logStream.write(footer);
      logStream.end();
      const logMeta = sessionLogs.get(sessionId);
      if (logMeta) {
        logMeta.endedAt = new Date().toISOString();
        logMeta.exitCode = 0;
      }
    }
    sessions.delete(sessionId);
    closeSSHConnection(sshClient);
  });

  // SSH接続のエラー
  sshClient.on('error', (err) => {
    send(ws, { type: 'error', message: `SSH接続エラー: ${err.message}` });
  });

  // SSH接続の切断
  sshClient.on('end', () => {
    if (sessions.has(sessionId)) {
      send(ws, { type: 'exit', exitCode: 0 });
      clearNotificationState(sessionId);
      if (logStream) {
        const footer = `\n${'='.repeat(40)}\n=== SSH接続切断 ===\n日時: ${new Date().toISOString()}\n`;
        logStream.write(footer);
        logStream.end();
        const logMeta = sessionLogs.get(sessionId);
        if (logMeta) {
          logMeta.endedAt = new Date().toISOString();
        }
      }
      sessions.delete(sessionId);
    }
  });

  return session;
}

/**
 * セッションを停止
 * @param sessionId セッションID
 * @param reason 停止理由
 */
export function stopSession(sessionId: string, reason: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  // PTYまたはSSH接続を終了
  if (session.sshClient) {
    closeSSHConnection(session.sshClient);
  }
  if (session.pty) {
    try {
      session.pty.kill();
    } catch {
      // killエラーは無視
    }
  }
  // ログストリームを閉じる
  if (session.logStream) {
    const footer = `\n${'='.repeat(40)}\n=== セッション停止 ===\n日時: ${new Date().toISOString()}\n理由: ${reason}\n`;
    session.logStream.write(footer);
    session.logStream.end();
    // メタデータを更新
    const logMeta = sessionLogs.get(sessionId);
    if (logMeta) {
      logMeta.endedAt = new Date().toISOString();
      logMeta.stopReason = reason;
    }
  }
  sessions.delete(sessionId);
  if (session.ws) {
    send(session.ws, { type: 'stopped', reason });
  }
}

/**
 * 全セッションをクリーンアップ
 * シグナルハンドラから呼び出される
 */
export function cleanupAllSessions(): void {
  sessions.forEach((session) => {
    try {
      if (session.sshClient) {
        closeSSHConnection(session.sshClient);
      }
      if (session.pty) {
        session.pty.kill();
      }
      // ログストリームを閉じる
      if (session.logStream) {
        session.logStream.end();
      }
    } catch {
      // クリーンアップエラーは無視
    }
  });
  sessions.clear();
  // ログメタデータもクリア（メモリリーク防止）
  sessionLogs.clear();
}
