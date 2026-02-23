/**
 * AppError および派生エラークラスのテスト
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  FileTooLargeError,
  InvalidPathError,
  FeatureDisabledError,
  FileTypeError,
  SessionError,
  InternalServerError,
} from '../../src/errors/AppError.js';

// ============================================================
// AppError のテスト
// ============================================================

describe('AppError', () => {
  it('コンストラクタでcode, statusCode, message, detailsを設定する', () => {
    const error = new AppError('TEST_ERROR', 400, 'テストエラー', { key: 'value' });
    expect(error.code).toBe('TEST_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('テストエラー');
    expect(error.details).toEqual({ key: 'value' });
    expect(error.name).toBe('AppError');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });

  it('toJSON()でcode, messageを含むオブジェクトを返す', () => {
    const error = new AppError('TEST_ERROR', 400, 'テストエラー');
    const json = error.toJSON();
    expect(json).toEqual({
      error: 'TEST_ERROR',
      message: 'テストエラー',
    });
  });

  it('toJSON()でdetailsがある場合はdetailsを含む', () => {
    const error = new AppError('TEST_ERROR', 400, 'テストエラー', { extra: 123 });
    const json = error.toJSON();
    expect(json).toEqual({
      error: 'TEST_ERROR',
      message: 'テストエラー',
      details: { extra: 123 },
    });
  });

  it('toJSON()でdetailsがundefinedの場合はdetailsを含まない', () => {
    const error = new AppError('TEST_ERROR', 400, 'テストエラー', undefined);
    const json = error.toJSON();
    expect(json).not.toHaveProperty('details');
  });
});

// ============================================================
// AuthenticationError のテスト
// ============================================================

describe('AuthenticationError', () => {
  it('デフォルトメッセージで生成される', () => {
    const error = new AuthenticationError();
    expect(error.message).toBe('認証に失敗しました');
  });

  it('statusCodeが401である', () => {
    const error = new AuthenticationError();
    expect(error.statusCode).toBe(401);
  });

  it('codeがAUTHENTICATION_FAILEDである', () => {
    const error = new AuthenticationError();
    expect(error.code).toBe('AUTHENTICATION_FAILED');
  });

  it('AppErrorのインスタンスである', () => {
    const error = new AuthenticationError();
    expect(error).toBeInstanceOf(AppError);
  });
});

// ============================================================
// NotFoundError のテスト
// ============================================================

describe('NotFoundError', () => {
  it('リソース名を含むメッセージを生成する', () => {
    const error = new NotFoundError('ユーザー');
    expect(error.message).toBe('ユーザーが見つかりません');
  });

  it('statusCodeが404である', () => {
    const error = new NotFoundError('ファイル');
    expect(error.statusCode).toBe(404);
  });

  it('codeがNOT_FOUNDである', () => {
    const error = new NotFoundError('リソース');
    expect(error.code).toBe('NOT_FOUND');
  });
});

// ============================================================
// ValidationError のテスト
// ============================================================

describe('ValidationError', () => {
  it('メッセージとdetailsを設定する', () => {
    const error = new ValidationError('入力値が不正です', { field: 'name' });
    expect(error.message).toBe('入力値が不正です');
    expect(error.details).toEqual({ field: 'name' });
  });

  it('statusCodeが400である', () => {
    const error = new ValidationError('不正な値');
    expect(error.statusCode).toBe(400);
  });

  it('codeがVALIDATION_ERRORである', () => {
    const error = new ValidationError('不正な値');
    expect(error.code).toBe('VALIDATION_ERROR');
  });
});

// ============================================================
// FileTooLargeError のテスト
// ============================================================

describe('FileTooLargeError', () => {
  it('maxSizeをフォーマットしてメッセージに含める', () => {
    // 1MB = 1048576 bytes
    const error = new FileTooLargeError(1048576);
    expect(error.message).toBe('ファイルサイズが上限(1 MB)を超えています');
  });

  it('actualSizeがある場合はdetailsにsize, maxSizeを含む', () => {
    const error = new FileTooLargeError(1024, 2048);
    expect(error.details).toEqual({ size: 2048, maxSize: 1024 });
  });

  it('actualSizeがない場合はdetailsにmaxSizeのみを含む', () => {
    const error = new FileTooLargeError(1024);
    expect(error.details).toEqual({ maxSize: 1024 });
  });

  it('statusCodeが413である', () => {
    const error = new FileTooLargeError(1024);
    expect(error.statusCode).toBe(413);
  });

  it('codeがFILE_TOO_LARGEである', () => {
    const error = new FileTooLargeError(1024);
    expect(error.code).toBe('FILE_TOO_LARGE');
  });
});

// ============================================================
// InvalidPathError のテスト
// ============================================================

describe('InvalidPathError', () => {
  it('デフォルトメッセージで生成される', () => {
    const error = new InvalidPathError();
    expect(error.message).toBe('ワークスペース外へのアクセスは許可されていません');
  });

  it('statusCodeが400である', () => {
    const error = new InvalidPathError();
    expect(error.statusCode).toBe(400);
  });

  it('codeがINVALID_PATHである', () => {
    const error = new InvalidPathError();
    expect(error.code).toBe('INVALID_PATH');
  });
});

// ============================================================
// FeatureDisabledError のテスト
// ============================================================

describe('FeatureDisabledError', () => {
  it('機能名を含むメッセージを生成する', () => {
    const error = new FeatureDisabledError('ターミナル');
    expect(error.message).toBe('ターミナルは無効化されています');
  });

  it('statusCodeが403である', () => {
    const error = new FeatureDisabledError('AI機能');
    expect(error.statusCode).toBe(403);
  });

  it('codeがFEATURE_DISABLEDである', () => {
    const error = new FeatureDisabledError('テスト機能');
    expect(error.code).toBe('FEATURE_DISABLED');
  });
});

// ============================================================
// FileTypeError のテスト
// ============================================================

describe('FileTypeError', () => {
  it('ファイルを期待してディレクトリだった場合のメッセージ', () => {
    const error = new FileTypeError('file', 'directory');
    expect(error.message).toBe('ファイルではありません（実際: ディレクトリ）');
    expect(error.code).toBe('NOT_A_FILE');
  });

  it('ディレクトリを期待してファイルだった場合のメッセージ', () => {
    const error = new FileTypeError('directory', 'file');
    expect(error.message).toBe('ディレクトリではありません（実際: ファイル）');
    expect(error.code).toBe('NOT_A_DIRECTORY');
  });

  it('statusCodeが400である', () => {
    const error = new FileTypeError('file', 'directory');
    expect(error.statusCode).toBe(400);
  });
});

// ============================================================
// SessionError のテスト
// ============================================================

describe('SessionError', () => {
  it('code, messageを正しく設定する', () => {
    const error = new SessionError('SESSION_NOT_FOUND', 'セッションが見つかりません');
    expect(error.code).toBe('SESSION_NOT_FOUND');
    expect(error.message).toBe('セッションが見つかりません');
  });

  it('statusCodeが400である', () => {
    const error = new SessionError('SESSION_ERROR', 'エラー');
    expect(error.statusCode).toBe(400);
  });
});

// ============================================================
// InternalServerError のテスト
// ============================================================

describe('InternalServerError', () => {
  it('デフォルトメッセージで生成される', () => {
    const error = new InternalServerError();
    expect(error.message).toBe('サーバーエラーが発生しました');
  });

  it('originalError付きでdetailsにoriginalMessage, stackを含む（NODE_ENV非production）', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const original = new Error('元のエラー');
      const error = new InternalServerError('内部エラー', original);
      expect(error.details).toHaveProperty('originalMessage', '元のエラー');
      expect(error.details).toHaveProperty('stack');
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('statusCodeが500である', () => {
    const error = new InternalServerError();
    expect(error.statusCode).toBe(500);
  });

  it('codeがINTERNAL_SERVER_ERRORである', () => {
    const error = new InternalServerError();
    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
