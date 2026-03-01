/**
 * Pocket Dev Relay 型定義ハブ
 * ドメイン別に分離した型定義を re-export する
 *
 * 既存のインポート（from '../types/index.js'）はそのまま動作する
 */

// サーバー・クライアント共有型
export type {
  SessionMode,
  SSHConnectionConfig,
  StartMessage,
  InputMessage,
  ResizeMessage,
  StopMessage,
  AuthMessage,
  ClientMessage,
  DataMessage,
  StartedMessage,
  ExitMessage,
  StoppedMessage,
  ErrorMessage,
  NotificationMessage,
  NotificationLevel,
  AuthResultMessage,
  ServerMessage,
  FileItem,
  UrlType,
  AccessUrl,
  AIProviderName,
  AIAnalyzeRequest,
  AIAnalyzeResponse,
  AIStatusResponse,
  ClipboardData,
  ClipboardSetRequest,
  ClipboardResponse,
  Snippet,
  SnippetCreateRequest,
  SnippetsResponse,
  SnippetExecuteResponse,
  UploadResponse,
  ApiErrorResponse,
  FileTooLargeErrorResponse,
} from './shared.js';

// サーバー専用型
export type {
  SessionConfig,
  Session,
  SessionInternal,
  AppConfig,
  FileListResponse,
  FileContentResponse,
  FileWriteRequest,
  FileWriteResponse,
  SessionLogMeta,
  SessionLogsResponse,
  SessionLogContentResponse,
  AddressesResponse,
  QrResponse,
  MemoryUsage,
  HealthResponse,
  CommandPreset,
  Presets,
} from './server.js';

// クライアントUI専用型
export type {
  ClientSession,
  ReconnectConfig,
  ToastType,
} from './client.js';
