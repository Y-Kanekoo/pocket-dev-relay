/**
 * クライアント側エラーハンドリングユーティリティ
 * API エラーを統一的に処理する
 */
import type { ToastType } from '../../types/index.js';

/**
 * API エラーレスポンスの型定義
 */
interface ApiErrorResponse {
  error: string;
  message: string;
  details?: unknown;
}

/**
 * エラーコードと日本語メッセージのマッピング
 */
const ERROR_MESSAGES: Record<string, string> = {
  // 認証関連
  AUTHENTICATION_FAILED: '認証に失敗しました。トークンを確認してください。',
  unauthorized: '認証が必要です。',

  // ファイル関連
  NOT_FOUND: 'リソースが見つかりません。',
  NOT_A_FILE: 'ファイルではありません。',
  NOT_A_DIRECTORY: 'ディレクトリではありません。',
  FILE_TOO_LARGE: 'ファイルサイズが上限を超えています。',
  INVALID_PATH: 'パスが無効です。ワークスペース外にはアクセスできません。',

  // 機能関連
  FEATURE_DISABLED: 'この機能は無効化されています。',
  'file-write-disabled': 'ファイル書き込みは無効化されています。',
  'session-logs-disabled': 'セッションログは無効化されています。',
  'custom-commands-disabled': 'カスタムコマンドは無効化されています。',

  // バリデーション関連
  VALIDATION_ERROR: '入力値が不正です。',
  'invalid-content': 'コンテンツが不正です。',
  'missing-text': 'テキストが指定されていません。',
  'invalid-filename': 'ファイル名が不正です。',

  // セッション関連
  'session-already-running': 'セッションは既に実行中です。',
  'unknown-mode': '不明なモードです。',
  'missing-command': 'コマンドが指定されていません。',

  // 一般エラー
  INTERNAL_SERVER_ERROR: 'サーバーエラーが発生しました。',
  'server-error': 'サーバーエラーが発生しました。',
  'failed-to-generate': 'QRコードの生成に失敗しました。',
  'failed-to-list': 'ファイル一覧の取得に失敗しました。',
  'failed-to-read': 'ファイルの読み込みに失敗しました。',
  'failed-to-write': 'ファイルの書き込みに失敗しました。',
  'failed-to-list-logs': 'ログ一覧の取得に失敗しました。',
  'failed-to-read-log': 'ログの読み込みに失敗しました。',
  'log-not-found': 'ログファイルが見つかりません。',
};

/**
 * エラーコードから日本語メッセージを取得
 * @param code エラーコード
 * @returns 日本語メッセージ
 */
export function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] || `エラーが発生しました: ${code}`;
}

/**
 * API レスポンスからエラーメッセージを抽出
 * @param response API エラーレスポンス
 * @returns 日本語エラーメッセージ
 */
export function extractErrorMessage(response: ApiErrorResponse): string {
  // message フィールドがあればそれを使用
  if (response.message) {
    return response.message;
  }
  // error コードからメッセージを取得
  if (response.error) {
    return getErrorMessage(response.error);
  }
  return '予期しないエラーが発生しました';
}

/**
 * API エラーを処理してトースト通知を表示
 * @param error エラーオブジェクト
 * @param showToast トースト表示関数
 * @param defaultMessage デフォルトメッセージ
 */
export function handleApiError(
  error: unknown,
  showToast: (message: string, type: ToastType) => void,
  defaultMessage = '予期しないエラーが発生しました'
): void {
  // ApiErrorResponse 型のチェック
  if (isApiErrorResponse(error)) {
    showToast(extractErrorMessage(error), 'error');
    return;
  }

  // Error インスタンスのチェック
  if (error instanceof Error) {
    showToast(error.message || defaultMessage, 'error');
    return;
  }

  // その他のケース
  showToast(defaultMessage, 'error');
}

/**
 * fetch レスポンスからエラーを処理
 * @param response fetch レスポンス
 * @param showToast トースト表示関数
 * @returns エラーがあった場合は true
 */
export async function handleFetchError(
  response: Response,
  showToast: (message: string, type: ToastType) => void
): Promise<boolean> {
  if (response.ok) {
    return false;
  }

  try {
    const errorData = (await response.json()) as ApiErrorResponse;
    showToast(extractErrorMessage(errorData), 'error');
  } catch {
    // JSON パースに失敗した場合はステータスコードからメッセージを生成
    const statusMessages: Record<number, string> = {
      400: '不正なリクエストです',
      401: '認証が必要です',
      403: 'アクセスが拒否されました',
      404: 'リソースが見つかりません',
      413: 'ファイルサイズが大きすぎます',
      500: 'サーバーエラーが発生しました',
    };
    const message =
      statusMessages[response.status] ||
      `エラーが発生しました (${response.status})`;
    showToast(message, 'error');
  }

  return true;
}

/**
 * オブジェクトが ApiErrorResponse 型かどうかをチェック
 * @param obj チェック対象オブジェクト
 * @returns ApiErrorResponse 型の場合 true
 */
function isApiErrorResponse(obj: unknown): obj is ApiErrorResponse {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const candidate = obj as Record<string, unknown>;
  return typeof candidate.error === 'string';
}

/**
 * ネットワークエラーを処理
 * @param error エラーオブジェクト
 * @param showToast トースト表示関数
 */
export function handleNetworkError(
  error: unknown,
  showToast: (message: string, type: ToastType) => void
): void {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    showToast('ネットワークエラー: サーバーに接続できません', 'error');
    return;
  }
  handleApiError(error, showToast);
}
