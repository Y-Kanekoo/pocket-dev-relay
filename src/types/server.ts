/**
 * サーバー専用型定義
 * セッション管理、API レスポンス、サーバー内部状態
 */

import type { SessionMode, FileItem } from './shared.js';
import type { SSHConnectionConfig } from './shared.js';

// ============================================================
// セッション関連
// ============================================================

/**
 * セッション設定
 */
export interface SessionConfig {
  mode: SessionMode;
  cwd?: string;
  customCommand?: string;
  /** SSH接続設定（SSHモード時） */
  sshConfig?: SSHConnectionConfig;
}

/**
 * セッション情報
 */
export interface Session {
  id: string;
  mode: SessionMode;
  cwd: string;
  label: string;
}

/**
 * 完全なセッション情報（サーバー内部用）
 * ptyやlogStreamは実行時の型なので省略
 */
export interface SessionInternal extends Session {
  logFileName: string | null;
}

// ============================================================
// アプリケーション設定
// ============================================================

/**
 * API /api/config のレスポンス型
 */
export interface AppConfig {
  /** ワークスペースの絶対パス */
  workspaceRoot: string;
  /** ワークスペースディレクトリ名 */
  workspaceName: string;
  /** 利用可能なセッションモード */
  modes: SessionMode[];
  /** カスタムコマンドの許可 */
  allowCustomCommands: boolean;
  /** ファイル書き込みの許可 */
  fileWriteEnabled: boolean;
  /** 認証が有効か */
  authEnabled: boolean;
  /** 最大ファイルサイズ（バイト） */
  maxFileSize: number;
  /** セッションログが有効か */
  sessionLogsEnabled: boolean;
  /** SSH機能が有効か */
  sshEnabled: boolean;
  /** SSHデフォルトホスト */
  sshDefaultHost?: string;
  /** SSHデフォルトポート */
  sshDefaultPort?: number;
  /** SSHデフォルトユーザー */
  sshDefaultUser?: string;
}

// ============================================================
// ファイルブラウザ関連（APIレスポンス）
// ============================================================

/**
 * API /api/files のレスポンス型
 */
export interface FileListResponse {
  /** 現在のパス（ワークスペースルートからの相対パス） */
  path: string;
  /** ファイル・ディレクトリ一覧 */
  items: FileItem[];
}

/**
 * API /api/file (GET) のレスポンス型
 */
export interface FileContentResponse {
  /** ファイルパス（ワークスペースルートからの相対パス） */
  path: string;
  /** ファイル内容 */
  content: string;
}

/**
 * API /api/file (POST) のリクエストボディ
 */
export interface FileWriteRequest {
  /** ファイルパス（ワークスペースルートからの相対パス） */
  path: string;
  /** 書き込む内容 */
  content: string;
}

/**
 * API /api/file (POST) のレスポンス型
 */
export interface FileWriteResponse {
  ok: boolean;
}

// ============================================================
// セッションログ関連
// ============================================================

/**
 * セッションログのメタデータ
 */
export interface SessionLogMeta {
  /** セッションID */
  id: string;
  /** ログファイル名 */
  fileName: string;
  /** セッションモード */
  mode: SessionMode;
  /** セッションラベル */
  label: string;
  /** 作業ディレクトリ */
  cwd: string;
  /** 開始日時（ISO 8601形式） */
  startedAt: string;
  /** 終了日時（ISO 8601形式）、未終了の場合はnull */
  endedAt: string | null;
  /** 終了コード（終了した場合） */
  exitCode?: number;
  /** 停止理由（手動停止の場合） */
  stopReason?: string;
}

/**
 * API /api/logs のレスポンス型
 */
export interface SessionLogsResponse {
  logs: SessionLogMeta[];
}

/**
 * API /api/log/:fileName のレスポンス型
 */
export interface SessionLogContentResponse {
  fileName: string;
  content: string;
}

// ============================================================
// アクセスURL関連（APIレスポンス）
// ============================================================

/**
 * API /api/addresses のレスポンス型
 */
export interface AddressesResponse {
  port: number;
  urls: import('./shared.js').AccessUrl[];
}

// ============================================================
// QRコード関連
// ============================================================

/**
 * API /api/qr のレスポンス型
 */
export interface QrResponse {
  dataUrl: string;
}

// ============================================================
// ヘルスチェック
// ============================================================

/**
 * メモリ使用量情報
 */
export interface MemoryUsage {
  /** Resident Set Size（バイト） */
  rss: number;
  /** 使用中のヒープサイズ（バイト） */
  heapUsed: number;
  /** ヒープ合計サイズ（バイト） */
  heapTotal: number;
}

/**
 * API /api/health のレスポンス型
 */
export interface HealthResponse {
  /** ステータス */
  status: 'ok';
  /** サーバー稼働時間（秒） */
  uptime: number;
  /** アプリケーションバージョン */
  version: string;
  /** 現在のタイムスタンプ（ISO 8601形式） */
  timestamp: string;
  /** アクティブセッション数 */
  activeSessions: number;
  /** メモリ使用量 */
  memory: MemoryUsage;
}

// ============================================================
// コマンドプリセット関連
// ============================================================

/**
 * コマンドプリセット設定
 */
export interface CommandPreset {
  label: string;
  command: string;
  args: string[];
}

/**
 * プリセット辞書型
 */
export type Presets = {
  [K in Exclude<SessionMode, 'custom' | 'ssh'>]: CommandPreset;
};
