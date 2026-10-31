/**
 * サーバー・クライアント共有型定義
 * WebSocketメッセージ、セッションモード、共通データ型
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
 * 認証メッセージ（メッセージベース認証用）
 */
export interface AuthMessage {
  type: 'auth';
  token: string;
}

/**
 * クライアントからサーバーへ送信するメッセージの共用体型
 */
export type ClientMessage = StartMessage | InputMessage | ResizeMessage | StopMessage | AuthMessage;

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
 * 認証結果メッセージ（メッセージベース認証の応答）
 */
export interface AuthResultMessage {
  type: 'auth_result';
  ok: boolean;
  message?: string;
}

/**
 * サーバーからクライアントへ送信するメッセージの共用体型
 */
export type ServerMessage =
  | DataMessage
  | StartedMessage
  | ExitMessage
  | StoppedMessage
  | ErrorMessage
  | NotificationMessage
  | AuthResultMessage;

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

// ============================================================
// アクセスURL関連
// ============================================================

/**
 * アクセスURLの種別
 */
export type UrlType = 'mdns' | 'lan' | 'local' | 'tunnel';

/**
 * アクセスURL情報
 */
export interface AccessUrl {
  type: UrlType;
  name: string;
  host: string;
  url: string;
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
