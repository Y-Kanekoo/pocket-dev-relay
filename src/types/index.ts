/**
 * Pocket Dev Relay 共通型定義
 * サーバーとクライアントで共有する型を定義
 */

// ============================================================
// セッションモード
// ============================================================

/**
 * セッションの動作モード
 * - codex: Codex CLI を使用
 * - claude: Claude Code を使用
 * - shell: シェル（bash/zsh等）を使用
 * - custom: カスタムコマンドを使用
 * - ssh: SSH中継接続を使用
 */
export type SessionMode = 'codex' | 'claude' | 'shell' | 'custom' | 'ssh';

// ============================================================
// WebSocketメッセージ型（クライアント → サーバー）
// ============================================================

/**
 * SSH接続設定（クライアントから送信）
 */
export interface SSHConnectionConfig {
  /** 接続先ホスト */
  host: string;
  /** ポート番号 */
  port: number;
  /** ユーザー名 */
  username: string;
  /** 認証方式 */
  authMethod: 'password' | 'key';
  /** パスワード（パスワード認証時） */
  password?: string;
}

/**
 * セッション開始メッセージ
 */
export interface StartMessage {
  type: 'start';
  mode: SessionMode;
  cwd?: string;
  command?: string;
  sessionId?: string;
  /** SSH接続設定（SSHモード時） */
  sshConfig?: SSHConnectionConfig;
}

/**
 * ターミナル入力メッセージ
 */
export interface InputMessage {
  type: 'input';
  data: string;
  sessionId?: string;
}

/**
 * ターミナルリサイズメッセージ
 */
export interface ResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
  sessionId?: string;
}

/**
 * セッション停止メッセージ
 */
export interface StopMessage {
  type: 'stop';
  sessionId?: string;
}

/**
 * クライアントからサーバーへ送信するメッセージの共用体型
 */
export type ClientMessage = StartMessage | InputMessage | ResizeMessage | StopMessage;

// ============================================================
// WebSocketメッセージ型（サーバー → クライアント）
// ============================================================

/**
 * ターミナル出力メッセージ
 */
export interface DataMessage {
  type: 'data';
  data: string;
  sessionId?: string;
}

/**
 * セッション開始完了メッセージ
 */
export interface StartedMessage {
  type: 'started';
  sessionId: string;
  mode: string;
  cwd: string;
  label: string;
}

/**
 * セッション終了メッセージ（プロセス終了）
 */
export interface ExitMessage {
  type: 'exit';
  exitCode: number;
  signal?: string;
  sessionId?: string;
}

/**
 * セッション停止メッセージ（手動停止）
 */
export interface StoppedMessage {
  type: 'stopped';
  reason: string;
  sessionId?: string;
}

/**
 * エラーメッセージ
 */
export interface ErrorMessage {
  type: 'error';
  message: string;
}

/**
 * 通知メッセージ（サーバー → クライアント）
 * エラー検知やプロセス終了時に送信される
 */
export interface NotificationMessage {
  type: 'notification';
  title: string;
  body: string;
  level: 'info' | 'success' | 'warning' | 'error';
  sessionId?: string;
}

/**
 * 通知レベル
 */
export type NotificationLevel = NotificationMessage['level'];

/**
 * サーバーからクライアントへ送信するメッセージの共用体型
 */
export type ServerMessage =
  | DataMessage
  | StartedMessage
  | ExitMessage
  | StoppedMessage
  | ErrorMessage
  | NotificationMessage;

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
// ファイルブラウザ関連
// ============================================================

/**
 * ファイルアイテム
 */
export interface FileItem {
  name: string;
  type: 'file' | 'dir';
}

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
// アクセスURL関連
// ============================================================

/**
 * アクセスURLの種別
 */
export type UrlType = 'mdns' | 'lan' | 'local';

/**
 * アクセスURL情報
 */
export interface AccessUrl {
  type: UrlType;
  name: string;
  host: string;
  url: string;
}

/**
 * API /api/addresses のレスポンス型
 */
export interface AddressesResponse {
  port: number;
  urls: AccessUrl[];
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
// AI解析関連
// ============================================================

/**
 * AIプロバイダー名
 */
export type AIProviderName = 'claude' | 'openai';

/**
 * AI解析リクエストボディ
 */
export interface AIAnalyzeRequest {
  /** ターミナル出力のコンテキスト */
  context: string;
  /** ユーザーの質問（オプション） */
  question?: string;
}

/**
 * AI解析レスポンス
 */
export interface AIAnalyzeResponse {
  /** AIの回答 */
  answer: string;
  /** 使用したプロバイダー名 */
  provider: AIProviderName;
  /** 使用したモデル名 */
  model: string;
}

/**
 * AIステータスレスポンス
 */
export interface AIStatusResponse {
  /** AI機能が有効かどうか */
  enabled: boolean;
  /** 使用中のプロバイダー名（無効時はnull） */
  provider: AIProviderName | null;
  /** 使用中のモデル名（無効時はnull） */
  model: string | null;
}

// ============================================================
// エラーレスポンス
// ============================================================

/**
 * APIエラーレスポンス
 */
export interface ApiErrorResponse {
  error: string;
}

/**
 * ファイルサイズ超過エラーレスポンス
 */
export interface FileTooLargeErrorResponse extends ApiErrorResponse {
  error: 'file-too-large';
  size: number;
  maxSize: number;
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

// ============================================================
// クライアント側の状態管理
// ============================================================

/**
 * クライアント側セッション情報
 */
export interface ClientSession {
  id: string;
  num: number;
  active: boolean;
  label: string;
  cwd: string;
}

/**
 * 再接続設定
 */
export interface ReconnectConfig {
  enabled: boolean;
  attempts: number;
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  manualDisconnect: boolean;
}

/**
 * トースト通知の種別
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

// ============================================================
// クリップボード共有関連
// ============================================================

/**
 * クリップボードデータ
 */
export interface ClipboardData {
  /** テキスト内容 */
  text: string;
  /** 更新日時（ISO 8601形式） */
  updatedAt: string;
}

/**
 * API /api/clipboard (POST) のリクエストボディ
 */
export interface ClipboardSetRequest {
  text: string;
}

/**
 * API /api/clipboard のレスポンス型
 */
export interface ClipboardResponse {
  text: string;
  updatedAt: string;
}

// ============================================================
// コマンドスニペット関連
// ============================================================

/**
 * スニペットアイテム
 */
export interface Snippet {
  /** 一意なID */
  id: string;
  /** 表示ラベル */
  label: string;
  /** 実行するコマンド */
  command: string;
}

/**
 * API /api/snippets (POST) のリクエストボディ
 */
export interface SnippetCreateRequest {
  label: string;
  command: string;
}

/**
 * API /api/snippets のレスポンス型
 */
export interface SnippetsResponse {
  snippets: Snippet[];
}

/**
 * API /api/snippets/:id/execute のレスポンス型
 */
export interface SnippetExecuteResponse {
  ok: boolean;
  message: string;
}

// ============================================================
// ファイルアップロード関連
// ============================================================

/**
 * API /api/upload のレスポンス型
 */
export interface UploadResponse {
  ok: boolean;
  /** アップロードされたファイル名 */
  fileName: string;
  /** アップロード先の相対パス */
  path: string;
  /** ファイルサイズ（バイト） */
  size: number;
}
