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

import {
  SessionMode,
  SessionConfig,
  SessionLogMeta,
  ServerMessage,
} from '../types/index.js';
import {
  ROOT_DIR,
  ENABLE_SESSION_LOGS,
  LOG_DIR,
} from '../config.js';
import { resolvePath } from '../utils/path.js';
import { spawnForMode } from './pty.js';

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
  pty: pty.IPty;
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
  } catch (error) {
    const err = error as Error;
    console.error('ログディレクトリの作成に失敗しました:', err.message);
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

/**
 * ANSIエスケープシーケンスを除去
 * @param str 入力文字列
 * @returns ANSI除去後の文字列
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

// ============================================================
// WebSocket通信
// ============================================================

/**
 * WebSocketにメッセージを送信
 * @param ws WebSocket
 * @param payload 送信するメッセージ
 */
export function send(ws: WebSocket, payload: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
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
export async function startSession(
  config: SessionConfig,
  ws: WebSocket
): Promise<SessionInternal> {
  const { mode, cwd, customCommand } = config;
  const spawnConfig = spawnForMode(mode, customCommand);
  const sessionId = nanoid(10);
  const startDir = resolveCwd(cwd || '.');

  const ptyProcess = pty.spawn(spawnConfig.command, spawnConfig.args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: startDir,
    env: { ...process.env, TERM: 'xterm-256color' } as { [key: string]: string },
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
      console.error('ログファイルの作成に失敗しました:', err.message);
    }
  }

  const session: SessionInternal = {
    id: sessionId,
    mode,
    cwd: path.relative(ROOT_DIR, startDir) || '.',
    label: spawnConfig.label,
    pty: ptyProcess,
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
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    send(ws, { type: 'exit', exitCode, signal: signal?.toString() });
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
 * セッションを停止
 * @param sessionId セッションID
 * @param reason 停止理由
 */
export function stopSession(sessionId: string, reason: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  try {
    session.pty.kill();
  } catch {
    // killエラーは無視
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
      session.pty.kill();
    } catch {
      // クリーンアップエラーは無視
    }
  });
}
