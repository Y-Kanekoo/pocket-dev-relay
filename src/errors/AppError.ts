/**
 * アプリケーションエラー基底クラス
 * 構造化されたエラー情報を提供する
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    // Error クラスを継承する際のプロトタイプチェーン修正
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * JSON シリアライズ用
   */
  toJSON(): {
    error: string;
    message: string;
    details?: unknown;
  } {
    return {
      error: this.code,
      message: this.message,
      ...(this.details !== undefined && { details: this.details }),
    };
  }
}

/**
 * 認証エラー
 * 認証トークンが無効または未提供の場合
 */
export class AuthenticationError extends AppError {
  constructor(message = '認証に失敗しました') {
    super('AUTHENTICATION_FAILED', 401, message);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * リソース未検出エラー
 * 要求されたリソースが存在しない場合
 */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', 404, `${resource}が見つかりません`);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * バリデーションエラー
 * リクエストの入力値が不正な場合
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', 400, message, details);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * ファイルサイズ超過エラー
 * アップロードファイルが上限を超えている場合
 */
export class FileTooLargeError extends AppError {
  constructor(maxSize: number, actualSize?: number) {
    super(
      'FILE_TOO_LARGE',
      413,
      `ファイルサイズが上限(${formatBytes(maxSize)})を超えています`,
      actualSize !== undefined ? { size: actualSize, maxSize } : { maxSize }
    );
    this.name = 'FileTooLargeError';
    Object.setPrototypeOf(this, FileTooLargeError.prototype);
  }
}

/**
 * パス不正エラー
 * ワークスペース外へのアクセスを試みた場合
 */
export class InvalidPathError extends AppError {
  constructor(message = 'ワークスペース外へのアクセスは許可されていません') {
    super('INVALID_PATH', 400, message);
    this.name = 'InvalidPathError';
    Object.setPrototypeOf(this, InvalidPathError.prototype);
  }
}

/**
 * 機能無効エラー
 * 無効化された機能へのアクセスを試みた場合
 */
export class FeatureDisabledError extends AppError {
  constructor(feature: string) {
    super('FEATURE_DISABLED', 403, `${feature}は無効化されています`);
    this.name = 'FeatureDisabledError';
    Object.setPrototypeOf(this, FeatureDisabledError.prototype);
  }
}

/**
 * ファイル種別エラー
 * ファイルとディレクトリの種別が期待と異なる場合
 */
export class FileTypeError extends AppError {
  constructor(expected: 'file' | 'directory', actual: 'file' | 'directory') {
    super(
      expected === 'file' ? 'NOT_A_FILE' : 'NOT_A_DIRECTORY',
      400,
      `${expected === 'file' ? 'ファイル' : 'ディレクトリ'}ではありません（実際: ${actual === 'file' ? 'ファイル' : 'ディレクトリ'}）`
    );
    this.name = 'FileTypeError';
    Object.setPrototypeOf(this, FileTypeError.prototype);
  }
}

/**
 * セッションエラー
 * セッション関連の操作でエラーが発生した場合
 */
export class SessionError extends AppError {
  constructor(code: string, message: string) {
    super(code, 400, message);
    this.name = 'SessionError';
    Object.setPrototypeOf(this, SessionError.prototype);
  }
}

/**
 * 内部サーバーエラー
 * 予期しないエラーをラップする場合
 */
export class InternalServerError extends AppError {
  constructor(message = 'サーバーエラーが発生しました', originalError?: Error) {
    super('INTERNAL_SERVER_ERROR', 500, message, {
      // 本番環境ではスタックトレースを含めない
      ...(process.env.NODE_ENV !== 'production' &&
        originalError && {
          originalMessage: originalError.message,
          stack: originalError.stack,
        }),
    });
    this.name = 'InternalServerError';
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}

/**
 * バイト数を人間が読みやすい形式に変換
 * @param bytes バイト数
 * @returns フォーマットされた文字列
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, index)).toFixed(2))} ${sizes[index]}`;
}
