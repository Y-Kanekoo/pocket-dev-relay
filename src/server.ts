/**
 * Pocket Dev Relay サーバー
 * TypeScript版 - server.js からの移行
 */

import express, { Request, Response, NextFunction, Application } from 'express';
import http from 'http';
import https from 'https';
import fsSync from 'fs';
import WebSocket, { WebSocketServer } from 'ws';
import * as pty from 'node-pty';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { nanoid } from 'nanoid';
import dotenv from 'dotenv';

import {
  SessionMode,
  ClientMessage,
  ServerMessage,
  SessionConfig,
  CommandPreset,
  Presets,
  SessionLogMeta,
  AccessUrl,
  UrlType,
  FileItem,
  AppConfig,
  FileListResponse,
  FileContentResponse,
  AddressesResponse,
  QrResponse,
  SessionLogsResponse,
  SessionLogContentResponse,
} from './types/index.js';

// QRCodeの型定義（@types/qrcodeがないため独自定義）
interface QRCodeToDataURLOptions {
  margin?: number;
  scale?: number;
  color?: {
    dark?: string;
    light?: string;
  };
}

// QRCode モジュールのインポート（CommonJSモジュール）
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode: {
  toDataURL: (text: string, options?: QRCodeToDataURLOptions) => Promise<string>;
} = require('qrcode');

// 環境変数の読み込み
dotenv.config();

// ============================================================
// 設定値
// ============================================================

const PORT: number = parseInt(process.env.PORT || '4173', 10);
const ROOT_DIR: string = path.resolve(process.env.WORKSPACE_ROOT || process.cwd());
const AUTH_TOKEN: string = process.env.AUTH_TOKEN || '';
const ALLOW_CUSTOM_COMMANDS: boolean = process.env.ALLOW_CUSTOM_COMMANDS === 'true';
const ALLOW_FILE_WRITE: boolean = process.env.ALLOW_FILE_WRITE === 'true';
const MAX_FILE_SIZE: number = parseInt(process.env.MAX_FILE_SIZE || '1048576', 10);
const ENABLE_SESSION_LOGS: boolean = process.env.ENABLE_SESSION_LOGS === 'true';
const LOG_DIR: string = path.resolve(process.env.LOG_DIR || path.join(ROOT_DIR, 'logs'));

const SHELL_CMD: string = process.env.SHELL_CMD || process.env.SHELL || 'zsh';

// HTTPS設定
const ENABLE_HTTPS: boolean = process.env.ENABLE_HTTPS === 'true';
const SSL_KEY_PATH: string = process.env.SSL_KEY_PATH || '';
const SSL_CERT_PATH: string = process.env.SSL_CERT_PATH || '';

// ============================================================
// 型定義（サーバー内部用）
// ============================================================

/** セッションログメタデータ（内部用） */
interface SessionLogMetaInternal extends SessionLogMeta {
  size?: number;
}

/** セッション（内部用） */
interface SessionInternal {
  id: string;
  mode: SessionMode;
  cwd: string;
  label: string;
  pty: pty.IPty;
  ws: WebSocket;
  logStream: fsSync.WriteStream | null;
  logFileName: string | null;
}

/** スポーン設定 */
interface SpawnConfig {
  command: string;
  args: string[];
  label: string;
}

/** ネットワークインターフェース情報 */
interface InterfaceEntry {
  name: string;
  address: string;
}

// ============================================================
// セッションログ管理
// ============================================================

// セッションログ用のメタデータを保存
const sessionLogs = new Map<string, SessionLogMetaInternal>();

/**
 * ログディレクトリの初期化
 */
async function initLogDir(): Promise<void> {
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
// 引数パーサー
// ============================================================

/**
 * 引数文字列をパース
 * @param input 引数文字列（JSON配列またはスペース区切り）
 * @returns 引数配列
 */
function parseArgs(input: string | undefined): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // JSON解析失敗時はsplitArgsにフォールスルー
  }
  return splitArgs(input);
}

/**
 * 引数文字列をスペース区切りで分割（クォート対応）
 * @param input 引数文字列
 * @returns 引数配列
 */
function splitArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: string | null = null;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === '\\' && i + 1 < input.length) {
        i += 1;
        current += input[i];
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    if (char === '\\' && i + 1 < input.length) {
      i += 1;
      current += input[i];
      continue;
    }

    current += char;
  }

  if (current) args.push(current);
  return args;
}

// ============================================================
// コマンドプリセット
// ============================================================

const PRESETS: Presets = {
  codex: {
    label: 'Codex CLI',
    command: process.env.CODEX_CMD || 'codex',
    args: parseArgs(process.env.CODEX_ARGS),
  },
  claude: {
    label: 'Claude Code',
    command: process.env.CLAUDE_CMD || 'claude',
    args: parseArgs(process.env.CLAUDE_ARGS),
  },
  shell: {
    label: 'Shell',
    command: SHELL_CMD,
    args: parseArgs(process.env.SHELL_ARGS),
  },
};

// ============================================================
// 認証
// ============================================================

/**
 * Authorizationヘッダーを検証
 * @param header Authorizationヘッダー値
 * @returns 認証結果
 */
function isAuthorizedHeader(header: string | undefined): boolean {
  if (!AUTH_TOKEN) return true;
  return header === `Bearer ${AUTH_TOKEN}`;
}

/**
 * 認証ミドルウェア
 */
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!AUTH_TOKEN) {
    next();
    return;
  }
  if (isAuthorizedHeader(req.headers.authorization)) {
    next();
    return;
  }
  res.status(401).json({ error: 'unauthorized' });
}

// ============================================================
// パス解決
// ============================================================

/**
 * 相対パスをワークスペースルート内の絶対パスに解決
 * @param relativePath 相対パス
 * @returns 絶対パス
 * @throws パスがワークスペース外の場合
 */
function resolvePath(relativePath: string): string {
  const safePath = path.resolve(ROOT_DIR, relativePath || '.');
  const relative = path.relative(ROOT_DIR, safePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path outside workspace root');
  }
  return safePath;
}

/**
 * ファイルシステムエラーを適切なHTTPレスポンスに変換
 * @param res Expressレスポンス
 * @param error エラーオブジェクト
 * @param fallback フォールバックエラーメッセージ
 */
function respondFsError(
  res: Response,
  error: unknown,
  fallback: string
): void {
  const err = error as { message?: string; code?: string };
  if (err && err.message === 'Path outside workspace root') {
    res.status(400).json({ error: 'invalid-path' });
    return;
  }
  if (err && err.code === 'ENOENT') {
    res.status(404).json({ error: 'not-found' });
    return;
  }
  res.status(500).json({ error: fallback || 'server-error' });
}

// ============================================================
// ネットワーク情報
// ============================================================

/**
 * ネットワークインターフェースのIPv4アドレス一覧を取得
 * @returns インターフェース情報の配列
 */
function listInterfaceAddresses(): InterfaceEntry[] {
  const entries: InterfaceEntry[] = [];
  const nets = os.networkInterfaces();
  Object.entries(nets).forEach(([name, ifaceList]) => {
    ifaceList?.forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        entries.push({ name, address: iface.address });
      }
    });
  });
  return entries;
}

/**
 * ホスト名をmDNS形式に正規化
 * @param hostname ホスト名
 * @returns mDNS形式のホスト名
 */
function normalizeMdns(hostname: string | undefined): string {
  if (!hostname) return '';
  return hostname.includes('.') ? hostname : `${hostname}.local`;
}

/**
 * アクセスURL一覧を構築
 * @returns アクセスURL情報の配列
 */
function buildAccessUrls(): AccessUrl[] {
  const urls: AccessUrl[] = [];
  const hostname = os.hostname();
  const mdnsHost = normalizeMdns(hostname);
  // HTTPSが有効な場合はhttps://を使用
  const protocol = ENABLE_HTTPS ? 'https' : 'http';

  if (mdnsHost) {
    urls.push({
      type: 'mdns' as UrlType,
      name: hostname,
      host: mdnsHost,
      url: `${protocol}://${mdnsHost}:${PORT}`,
    });
  }

  listInterfaceAddresses().forEach((entry) => {
    urls.push({
      type: 'lan' as UrlType,
      name: entry.name,
      host: entry.address,
      url: `${protocol}://${entry.address}:${PORT}`,
    });
  });

  urls.push({
    type: 'local' as UrlType,
    name: 'localhost',
    host: 'localhost',
    url: `${protocol}://localhost:${PORT}`,
  });

  const seen = new Set<string>();
  return urls.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}

// ============================================================
// Expressアプリケーション設定
// ============================================================

const app: Application = express();

// HTTPSまたはHTTPサーバーを作成
let server: http.Server | https.Server;
if (ENABLE_HTTPS) {
  // SSL証明書ファイルの存在確認
  if (!SSL_KEY_PATH || !SSL_CERT_PATH) {
    console.error('エラー: HTTPS が有効ですが、SSL_KEY_PATH または SSL_CERT_PATH が設定されていません。');
    console.error('環境変数を設定してください:');
    console.error('  SSL_KEY_PATH: 秘密鍵ファイルのパス');
    console.error('  SSL_CERT_PATH: 証明書ファイルのパス');
    process.exit(1);
  }

  if (!fsSync.existsSync(SSL_KEY_PATH)) {
    console.error(`エラー: 秘密鍵ファイルが見つかりません: ${SSL_KEY_PATH}`);
    process.exit(1);
  }

  if (!fsSync.existsSync(SSL_CERT_PATH)) {
    console.error(`エラー: 証明書ファイルが見つかりません: ${SSL_CERT_PATH}`);
    process.exit(1);
  }

  try {
    const httpsOptions: https.ServerOptions = {
      key: fsSync.readFileSync(SSL_KEY_PATH),
      cert: fsSync.readFileSync(SSL_CERT_PATH),
    };
    server = https.createServer(httpsOptions, app);
    console.log('HTTPS モードで起動します');
  } catch (error) {
    const err = error as Error;
    console.error(`エラー: SSL証明書の読み込みに失敗しました: ${err.message}`);
    process.exit(1);
  }
} else {
  server = http.createServer(app);
}

const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor', express.static(path.join(__dirname, '..', 'node_modules')));

// ============================================================
// APIエンドポイント
// ============================================================

/**
 * GET /api/config - アプリケーション設定を取得
 */
app.get('/api/config', authMiddleware, (_req: Request, res: Response) => {
  const config: AppConfig = {
    workspaceRoot: ROOT_DIR,
    workspaceName: path.basename(ROOT_DIR),
    modes: Object.keys(PRESETS) as SessionMode[],
    allowCustomCommands: ALLOW_CUSTOM_COMMANDS,
    fileWriteEnabled: ALLOW_FILE_WRITE,
    authEnabled: Boolean(AUTH_TOKEN),
    maxFileSize: MAX_FILE_SIZE,
    sessionLogsEnabled: ENABLE_SESSION_LOGS,
  };
  res.json(config);
});

/**
 * GET /api/addresses - アクセスURL一覧を取得
 */
app.get('/api/addresses', authMiddleware, (_req: Request, res: Response) => {
  const response: AddressesResponse = {
    port: PORT,
    urls: buildAccessUrls(),
  };
  res.json(response);
});

/**
 * GET /api/qr - QRコードを生成
 */
app.get('/api/qr', authMiddleware, async (req: Request, res: Response) => {
  const text = String(req.query.text || '').trim();
  if (!text) {
    res.status(400).json({ error: 'missing-text' });
    return;
  }
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      margin: 1,
      scale: 6,
      color: {
        dark: '#1f1a14',
        light: '#ffffff',
      },
    });
    const response: QrResponse = { dataUrl };
    res.json(response);
  } catch {
    res.status(500).json({ error: 'failed-to-generate' });
  }
});

/**
 * GET /api/files - ディレクトリ一覧を取得
 */
app.get('/api/files', authMiddleware, async (req: Request, res: Response) => {
  try {
    const relativePath = (req.query.path as string) || '.';
    const targetPath = resolvePath(relativePath);
    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      res.status(400).json({ error: 'not-a-directory' });
      return;
    }

    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const items: FileItem[] = entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'dir' : 'file',
    }));

    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const response: FileListResponse = {
      path: path.relative(ROOT_DIR, targetPath) || '.',
      items,
    };
    res.json(response);
  } catch (error) {
    respondFsError(res, error, 'failed-to-list');
  }
});

/**
 * GET /api/file - ファイル内容を取得
 */
app.get('/api/file', authMiddleware, async (req: Request, res: Response) => {
  try {
    const relativePath = (req.query.path as string) || '';
    const targetPath = resolvePath(relativePath);
    const stats = await fs.stat(targetPath);
    if (!stats.isFile()) {
      res.status(400).json({ error: 'not-a-file' });
      return;
    }
    if (stats.size > MAX_FILE_SIZE) {
      res.status(413).json({
        error: 'file-too-large',
        size: stats.size,
        maxSize: MAX_FILE_SIZE,
      });
      return;
    }

    const content = await fs.readFile(targetPath, 'utf8');
    const response: FileContentResponse = {
      path: path.relative(ROOT_DIR, targetPath) || '.',
      content,
    };
    res.json(response);
  } catch (error) {
    respondFsError(res, error, 'failed-to-read');
  }
});

/**
 * POST /api/file - ファイルを書き込み
 */
app.post('/api/file', authMiddleware, async (req: Request, res: Response) => {
  if (!ALLOW_FILE_WRITE) {
    res.status(403).json({ error: 'file-write-disabled' });
    return;
  }

  try {
    const relativePath = (req.body.path as string) || '';
    const content = req.body.content;
    if (typeof content !== 'string') {
      res.status(400).json({ error: 'invalid-content' });
      return;
    }

    const targetPath = resolvePath(relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, 'utf8');
    res.json({ ok: true });
  } catch (error) {
    respondFsError(res, error, 'failed-to-write');
  }
});

/**
 * GET /api/logs - セッションログ一覧を取得
 */
app.get('/api/logs', authMiddleware, async (_req: Request, res: Response) => {
  if (!ENABLE_SESSION_LOGS) {
    res.status(403).json({ error: 'session-logs-disabled' });
    return;
  }

  try {
    // ディスク上のログファイルを取得
    const files = await fs.readdir(LOG_DIR).catch(() => [] as string[]);
    const logFiles = files
      .filter((f) => f.startsWith('session-') && f.endsWith('.log'))
      .sort()
      .reverse();

    // メタデータとマージ
    const logs = await Promise.all(
      logFiles.map(async (fileName) => {
        // メモリ上のメタデータを検索
        for (const [, meta] of sessionLogs) {
          if (meta.fileName === fileName) {
            return meta;
          }
        }
        // メタデータがない場合はファイル情報から生成
        const filePath = path.join(LOG_DIR, fileName);
        const stats = await fs.stat(filePath).catch(() => null);
        return {
          id: '',
          fileName,
          mode: 'shell' as SessionMode,
          label: '',
          cwd: '',
          startedAt: stats ? stats.birthtime.toISOString() : '',
          endedAt: null,
          size: stats ? stats.size : 0,
        };
      })
    );

    const response: SessionLogsResponse = { logs };
    res.json(response);
  } catch {
    res.status(500).json({ error: 'failed-to-list-logs' });
  }
});

/**
 * GET /api/log/:fileName - セッションログ内容を取得
 */
app.get('/api/log/:fileName', authMiddleware, async (req: Request, res: Response) => {
  if (!ENABLE_SESSION_LOGS) {
    res.status(403).json({ error: 'session-logs-disabled' });
    return;
  }

  try {
    const fileName = req.params.fileName as string;
    // ディレクトリトラバーサル防止
    if (fileName.includes('/') || fileName.includes('..')) {
      res.status(400).json({ error: 'invalid-filename' });
      return;
    }
    if (!fileName.startsWith('session-') || !fileName.endsWith('.log')) {
      res.status(400).json({ error: 'invalid-filename' });
      return;
    }

    const logPath = path.join(LOG_DIR, fileName);
    const content = await fs.readFile(logPath, 'utf8');
    const response: SessionLogContentResponse = { fileName, content };
    res.json(response);
  } catch (error) {
    const err = error as { code?: string };
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'log-not-found' });
      return;
    }
    res.status(500).json({ error: 'failed-to-read-log' });
  }
});

// ============================================================
// セッション管理
// ============================================================

const sessions = new Map<string, SessionInternal>();

/**
 * WebSocketにメッセージを送信
 * @param ws WebSocket
 * @param payload 送信するメッセージ
 */
function send(ws: WebSocket, payload: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/**
 * WebSocketリクエストからトークンを取得
 * @param req HTTPリクエスト
 * @returns トークン
 */
function getTokenFromRequest(req: http.IncomingMessage): string {
  const url = new URL(req.url || '', 'http://localhost');
  return url.searchParams.get('token') || '';
}

/**
 * WebSocket接続を認証
 * @param req HTTPリクエスト
 * @returns 認証結果
 */
function authorizeWebSocket(req: http.IncomingMessage): boolean {
  if (!AUTH_TOKEN) return true;
  return getTokenFromRequest(req) === AUTH_TOKEN;
}

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
 * モードに応じたスポーン設定を取得
 * @param mode セッションモード
 * @param customCommand カスタムコマンド（customモード時）
 * @returns スポーン設定
 */
function spawnForMode(mode: SessionMode, customCommand: string | undefined): SpawnConfig {
  if (mode === 'custom') {
    if (!ALLOW_CUSTOM_COMMANDS) {
      throw new Error('custom-commands-disabled');
    }
    const parts = splitArgs(customCommand || '');
    const command = parts.shift();
    if (!command) {
      throw new Error('missing-command');
    }
    return { command, args: parts, label: 'Custom' };
  }

  const preset = PRESETS[mode];
  if (!preset) {
    throw new Error('unknown-mode');
  }

  return { command: preset.command, args: preset.args, label: preset.label };
}

/**
 * セッションを開始
 * @param config セッション設定
 * @param ws WebSocket
 * @returns セッション情報
 */
async function startSession(
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
function stopSession(sessionId: string, reason: string): void {
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

// ============================================================
// WebSocket接続処理
// ============================================================

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  if (!authorizeWebSocket(req)) {
    ws.close(4001, 'unauthorized');
    return;
  }

  let activeSessionId: string | null = null;

  ws.on('message', (message: Buffer | string) => {
    let payload: ClientMessage;
    try {
      payload = JSON.parse(message.toString()) as ClientMessage;
    } catch {
      return;
    }

    if (payload.type === 'start') {
      if (activeSessionId) {
        send(ws, { type: 'error', message: 'session-already-running' });
        return;
      }

      (async () => {
        try {
          const session = await startSession(
            {
              mode: payload.mode,
              cwd: payload.cwd,
              customCommand: payload.command,
            },
            ws
          );
          activeSessionId = session.id;
          send(ws, {
            type: 'started',
            sessionId: session.id,
            mode: session.mode,
            cwd: session.cwd,
            label: session.label,
          });
        } catch (error) {
          const err = error as Error;
          send(ws, { type: 'error', message: err.message || 'failed-to-start' });
        }
      })();
      return;
    }

    if (!activeSessionId) return;

    const session = sessions.get(activeSessionId);
    if (!session) return;

    if (payload.type === 'input' && typeof payload.data === 'string') {
      session.pty.write(payload.data);
    } else if (payload.type === 'resize') {
      const cols = Number(payload.cols);
      const rows = Number(payload.rows);
      if (Number.isInteger(cols) && Number.isInteger(rows)) {
        session.pty.resize(cols, rows);
      }
    } else if (payload.type === 'stop') {
      stopSession(activeSessionId, 'client-stop');
      activeSessionId = null;
    }
  });

  ws.on('close', () => {
    if (activeSessionId) {
      stopSession(activeSessionId, 'client-disconnect');
    }
  });
});

// ============================================================
// サーバー起動
// ============================================================

server.listen(PORT, '0.0.0.0', async () => {
  // ログディレクトリを初期化
  if (ENABLE_SESSION_LOGS) {
    await initLogDir();
    console.log(`セッションログ: 有効 (${LOG_DIR})`);
  }

  // HTTPSが有効な場合はプロトコルを変更
  const protocol = ENABLE_HTTPS ? 'https' : 'http';

  console.log('Pocket Dev Relay is running.');
  console.log(`Local: ${protocol}://localhost:${PORT}`);
  buildAccessUrls()
    .filter((entry) => entry.type === 'lan')
    .forEach((entry) => {
      console.log(`LAN (${entry.name}): ${entry.url}`);
    });
});

// ============================================================
// シグナルハンドラ
// ============================================================

process.on('SIGINT', () => {
  sessions.forEach((session) => {
    try {
      session.pty.kill();
    } catch {
      // クリーンアップエラーは無視
    }
  });
  process.exit(0);
});
