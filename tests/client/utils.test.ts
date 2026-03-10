/**
 * クライアント側ユーティリティのテスト
 *
 * joinPath, parentPath → src/utils/filepath.ts の実コードを直接テスト
 * pickBestUrl, labelForUrl → src/utils/url.ts の実コードを直接テスト
 *
 * getReconnectDelay, isValidFontSize, normalizeFontSize は
 * sessionStore のメソッド/ローカル定数であり、DOM依存（localStorage）のため
 * テスト環境では直接importできない。ロジック検証用に再実装。
 */

import { describe, it, expect } from 'vitest';
import { joinPath, parentPath } from '../../src/utils/filepath.js';
import { pickBestUrl, labelForUrl } from '../../src/utils/url.js';
import type { AccessUrl } from '../../src/types/index.js';

// ============================================================
// パスユーティリティのテスト（実コードから直接import）
// ============================================================

describe('joinPath', () => {
  it('ベースパスとファイル名を結合する', () => {
    expect(joinPath('src', 'index.ts')).toBe('src/index.ts');
  });

  it('ベースパスが空の場合はファイル名のみを返す', () => {
    expect(joinPath('', 'file.txt')).toBe('file.txt');
  });

  it('ベースパスがドットの場合はファイル名のみを返す', () => {
    expect(joinPath('.', 'file.txt')).toBe('file.txt');
  });

  it('ネストしたパスを結合できる', () => {
    expect(joinPath('src/components', 'Button.tsx')).toBe('src/components/Button.tsx');
  });
});

describe('parentPath', () => {
  it('親ディレクトリのパスを返す', () => {
    expect(parentPath('src/components')).toBe('src');
  });

  it('ルートレベルの場合はドットを返す', () => {
    expect(parentPath('src')).toBe('.');
  });

  it('ドットの場合はドットを返す', () => {
    expect(parentPath('.')).toBe('.');
  });

  it('空の場合はドットを返す', () => {
    expect(parentPath('')).toBe('.');
  });

  it('深くネストしたパスの親を返す', () => {
    expect(parentPath('src/components/ui/Button')).toBe('src/components/ui');
  });
});

// ============================================================
// URLラベル生成のテスト（実コードから直接import）
// ============================================================

describe('labelForUrl', () => {
  it('mDNSタイプのラベルを生成する', () => {
    const entry: AccessUrl = {
      type: 'mdns',
      name: 'macbook',
      host: 'macbook.local',
      url: 'http://macbook.local:4173',
    };
    expect(labelForUrl(entry)).toBe('mDNS (macbook.local)');
  });

  it('LANタイプのラベルを生成する', () => {
    const entry: AccessUrl = {
      type: 'lan',
      name: 'en0',
      host: '192.168.1.100',
      url: 'http://192.168.1.100:4173',
    };
    expect(labelForUrl(entry)).toBe('LAN (en0)');
  });

  it('localタイプのラベルを生成する', () => {
    const entry: AccessUrl = {
      type: 'local',
      name: 'localhost',
      host: 'localhost',
      url: 'http://localhost:4173',
    };
    expect(labelForUrl(entry)).toBe('このPC (localhost)');
  });

  it('tunnelタイプのラベルを生成する', () => {
    const entry: AccessUrl = {
      type: 'tunnel',
      name: 'cloudflare',
      host: 'example.trycloudflare.com',
      url: 'https://example.trycloudflare.com',
    };
    expect(labelForUrl(entry)).toBe('外部アクセス (cloudflare)');
  });
});

// ============================================================
// 最適URL選択のテスト（実コードから直接import）
// ============================================================

describe('pickBestUrl', () => {
  it('localでないURLを優先する', () => {
    const urls: AccessUrl[] = [
      {
        type: 'local',
        name: 'localhost',
        host: 'localhost',
        url: 'http://localhost:4173',
      },
      {
        type: 'lan',
        name: 'en0',
        host: '192.168.1.100',
        url: 'http://192.168.1.100:4173',
      },
    ];
    const best = pickBestUrl(urls);
    expect(best?.type).toBe('lan');
  });

  it('localしかない場合はlocalを返す', () => {
    const urls: AccessUrl[] = [
      {
        type: 'local',
        name: 'localhost',
        host: 'localhost',
        url: 'http://localhost:4173',
      },
    ];
    const best = pickBestUrl(urls);
    expect(best?.type).toBe('local');
  });

  it('空配列の場合はundefinedを返す', () => {
    const best = pickBestUrl([]);
    expect(best).toBeUndefined();
  });

  it('tunnelを最優先で選択する', () => {
    const urls: AccessUrl[] = [
      {
        type: 'lan',
        name: 'en0',
        host: '192.168.1.100',
        url: 'http://192.168.1.100:4173',
      },
      {
        type: 'tunnel',
        name: 'cloudflare',
        host: 'example.trycloudflare.com',
        url: 'https://example.trycloudflare.com',
      },
    ];
    const best = pickBestUrl(urls);
    expect(best?.type).toBe('tunnel');
  });

  it('mDNSとLANがある場合は最初のものを返す', () => {
    const urls: AccessUrl[] = [
      {
        type: 'mdns',
        name: 'macbook',
        host: 'macbook.local',
        url: 'http://macbook.local:4173',
      },
      {
        type: 'lan',
        name: 'en0',
        host: '192.168.1.100',
        url: 'http://192.168.1.100:4173',
      },
    ];
    const best = pickBestUrl(urls);
    expect(best?.type).toBe('mdns');
  });
});

// ============================================================
// 再接続遅延計算のテスト
// ============================================================

/**
 * 再接続の遅延時間を計算
 * 注: 実コード (sessionStore.getReconnectDelay) は sessionStore のメソッドであり、
 * localStorage依存のため直接importできない。ロジック検証用に再実装。
 */
function getReconnectDelay(attempts: number, baseDelay: number, maxDelay: number): number {
  return Math.min(baseDelay * Math.pow(2, attempts), maxDelay);
}

describe('getReconnectDelay', () => {
  const baseDelay = 1000;
  const maxDelay = 30000;

  it('初回は基本遅延を返す', () => {
    expect(getReconnectDelay(0, baseDelay, maxDelay)).toBe(1000);
  });

  it('指数バックオフで遅延が増加する', () => {
    expect(getReconnectDelay(1, baseDelay, maxDelay)).toBe(2000);
    expect(getReconnectDelay(2, baseDelay, maxDelay)).toBe(4000);
    expect(getReconnectDelay(3, baseDelay, maxDelay)).toBe(8000);
  });

  it('最大遅延を超えない', () => {
    expect(getReconnectDelay(10, baseDelay, maxDelay)).toBe(maxDelay);
    expect(getReconnectDelay(20, baseDelay, maxDelay)).toBe(maxDelay);
  });
});

// ============================================================
// フォントサイズ検証のテスト
// ============================================================

/**
 * フォントサイズ定数
 * 注: 実コード (src/client/state/sessionStore.ts) はlocalStorage依存のため
 * モジュールレベルでimportするとエラーになる。定数のみ再定義。
 */
const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 24;
const FONT_SIZE_DEFAULT = 13;

/**
 * フォントサイズが有効範囲内かチェック
 */
function isValidFontSize(size: number): boolean {
  return size >= FONT_SIZE_MIN && size <= FONT_SIZE_MAX;
}

/**
 * フォントサイズを正規化
 */
function normalizeFontSize(size: number): number {
  if (!isValidFontSize(size)) {
    return FONT_SIZE_DEFAULT;
  }
  return size;
}

describe('フォントサイズ検証', () => {
  it('有効なフォントサイズを許可する', () => {
    expect(isValidFontSize(10)).toBe(true);
    expect(isValidFontSize(13)).toBe(true);
    expect(isValidFontSize(24)).toBe(true);
  });

  it('範囲外のフォントサイズを拒否する', () => {
    expect(isValidFontSize(9)).toBe(false);
    expect(isValidFontSize(25)).toBe(false);
    expect(isValidFontSize(-1)).toBe(false);
  });

  it('無効なサイズをデフォルトに正規化する', () => {
    expect(normalizeFontSize(5)).toBe(FONT_SIZE_DEFAULT);
    expect(normalizeFontSize(100)).toBe(FONT_SIZE_DEFAULT);
  });

  it('有効なサイズはそのまま返す', () => {
    expect(normalizeFontSize(14)).toBe(14);
    expect(normalizeFontSize(20)).toBe(20);
  });
});
