/**
 * JsonStore（JSON永続化ユーティリティ）のテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// vi.mockはホイスティングされるため、vi.hoistedで変数を事前定義する
const { TEST_DATA_DIR, fsStore } = vi.hoisted(() => {
  return {
    TEST_DATA_DIR: '/tmp/test-store-data',
    fsStore: new Map<string, string>(),
  };
});

vi.mock('../../src/config.js', () => ({
  DATA_DIR: TEST_DATA_DIR,
  LOG_LEVEL: 'silent',
  APP_VERSION: '0.0.0-test',
}));

// loggerモック
vi.mock('../../src/services/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// fsモック: Mapベースのインメモリファイルシステム
vi.mock('fs', () => {
  return {
    default: {
      existsSync: vi.fn((p: string) => fsStore.has(p)),
      readFileSync: vi.fn((p: string) => {
        if (!fsStore.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        return fsStore.get(p);
      }),
      writeFileSync: vi.fn((p: string, data: string) => {
        fsStore.set(p, data);
      }),
      renameSync: vi.fn((src: string, dest: string) => {
        const data = fsStore.get(src);
        if (data !== undefined) {
          fsStore.set(dest, data);
          fsStore.delete(src);
        }
      }),
      mkdirSync: vi.fn(),
    },
  };
});

import { JsonStore } from '../../src/utils/store.js';
import fsSync from 'fs';
import logger from '../../src/services/logger.js';

beforeEach(() => {
  fsStore.clear();
  vi.clearAllMocks();
});

// ============================================================
// JsonStore#load() のテスト
// ============================================================

describe('JsonStore#load()', () => {
  it('ファイル未存在時はデフォルト値を返す', () => {
    const store = new JsonStore<string[]>('test.json', []);
    const result = store.load();
    expect(result).toEqual([]);
  });

  it('ファイルが存在して有効なJSONの場合はパースした値を返す', () => {
    const filePath = path.join(TEST_DATA_DIR, 'test.json');
    fsStore.set(filePath, JSON.stringify({ key: 'value' }));

    const store = new JsonStore<{ key: string }>('test.json', { key: 'default' });
    const result = store.load();
    expect(result).toEqual({ key: 'value' });
  });

  it('ファイルが存在して無効なJSONの場合はデフォルト値を返しwarnを出力する', () => {
    const filePath = path.join(TEST_DATA_DIR, 'test.json');
    fsStore.set(filePath, '{ invalid json }');

    const store = new JsonStore<string[]>('test.json', ['default']);
    const result = store.load();
    expect(result).toEqual(['default']);
    expect(logger.warn).toHaveBeenCalled();
  });
});

// ============================================================
// JsonStore#save() のテスト
// ============================================================

describe('JsonStore#save()', () => {
  it('データを一時ファイルに書き込み後renameで保存する', () => {
    // DATA_DIRが存在する状態にする
    fsStore.set(TEST_DATA_DIR, '');

    const store = new JsonStore<{ items: number[] }>('data.json', { items: [] });
    store.save({ items: [1, 2, 3] });

    // writeFileSyncが一時ファイルパスで呼ばれたことを確認
    const expectedTmpPath = path.join(TEST_DATA_DIR, 'data.json.tmp');
    const expectedFilePath = path.join(TEST_DATA_DIR, 'data.json');
    expect(fsSync.writeFileSync).toHaveBeenCalledWith(
      expectedTmpPath,
      JSON.stringify({ items: [1, 2, 3] }, null, 2),
      'utf-8',
    );
    // renameSyncが呼ばれたことを確認
    expect(fsSync.renameSync).toHaveBeenCalledWith(expectedTmpPath, expectedFilePath);
  });

  it('DATA_DIR未存在時はmkdirSyncが呼ばれる', () => {
    // DATA_DIRをfsStoreに入れない = 存在しない状態
    const store = new JsonStore<string>('config.json', '');
    store.save('test-data');

    expect(fsSync.mkdirSync).toHaveBeenCalledWith(TEST_DATA_DIR, { recursive: true });
  });
});

// ============================================================
// JsonStore#initDir() のテスト
// ============================================================

describe('JsonStore#initDir()', () => {
  it('ディレクトリ未存在時はmkdirSyncが呼ばれる', () => {
    // DATA_DIRをfsStoreに入れない = 存在しない
    const store = new JsonStore<string>('file.json', '');
    store.initDir();

    expect(fsSync.mkdirSync).toHaveBeenCalledWith(TEST_DATA_DIR, { recursive: true });
    expect(logger.info).toHaveBeenCalled();
  });

  it('ディレクトリ存在時はmkdirSyncが呼ばれない', () => {
    // DATA_DIRが存在する状態にする
    fsStore.set(TEST_DATA_DIR, '');

    const store = new JsonStore<string>('file.json', '');
    store.initDir();

    expect(fsSync.mkdirSync).not.toHaveBeenCalled();
  });
});
