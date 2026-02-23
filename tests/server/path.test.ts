/**
 * パス操作ユーティリティのテスト
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/config.js', () => ({
  ROOT_DIR: '/test/workspace',
  LOG_LEVEL: 'silent',
  APP_VERSION: '0.0.0-test',
}));

import { resolvePath, convertFsError } from '../../src/utils/path.js';
import {
  AppError,
  InvalidPathError,
  NotFoundError,
} from '../../src/errors/AppError.js';

// ============================================================
// resolvePath のテスト
// ============================================================

describe('resolvePath', () => {
  it('正常な相対パスをROOT_DIR内の絶対パスに解決する', () => {
    const result = resolvePath('file.txt');
    expect(result).toBe('/test/workspace/file.txt');
  });

  it('空文字の場合はROOT_DIRを返す', () => {
    const result = resolvePath('');
    expect(result).toBe('/test/workspace');
  });

  it('"."の場合はROOT_DIRを返す', () => {
    const result = resolvePath('.');
    expect(result).toBe('/test/workspace');
  });

  it('サブディレクトリのファイルパスを正しく解決する', () => {
    const result = resolvePath('subdir/file.txt');
    expect(result).toBe('/test/workspace/subdir/file.txt');
  });

  it('"../outside"の場合はInvalidPathErrorをthrowする', () => {
    expect(() => resolvePath('../outside')).toThrow(InvalidPathError);
  });

  it('絶対パスで外部のパスを指定した場合はInvalidPathErrorをthrowする', () => {
    expect(() => resolvePath('/etc/passwd')).toThrow(InvalidPathError);
  });
});

// ============================================================
// convertFsError のテスト
// ============================================================

describe('convertFsError', () => {
  it('InvalidPathErrorを渡すとそのまま返す', () => {
    const original = new InvalidPathError();
    const result = convertFsError(original);
    expect(result).toBe(original);
    expect(result).toBeInstanceOf(InvalidPathError);
  });

  it('ENOENTコードのエラーを渡すとNotFoundErrorを返す', () => {
    const fsError = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const result = convertFsError(fsError);
    expect(result).toBeInstanceOf(NotFoundError);
    expect(result.statusCode).toBe(404);
  });

  it('一般的なErrorを渡すとstatusCode 500のAppErrorを返す', () => {
    const genericError = new Error('何らかのエラー');
    const result = convertFsError(genericError);
    expect(result).toBeInstanceOf(AppError);
    expect(result.statusCode).toBe(500);
    expect(result.code).toBe('FS_ERROR');
  });
});
