/**
 * セッション管理のテスト
 * 注: 実際のセッション管理はサーバーと密結合しているため、
 * ここではヘルパー関数のテストを行う
 */

import { describe, it, expect } from 'vitest';
import { splitArgs, parseArgs } from '../../src/server/utils.js';

// ============================================================
// セッション関連のユーティリティテスト
// ============================================================

describe('セッション設定のパース', () => {
  describe('コマンドライン引数のパース', () => {
    it('Codex用の引数をパースできる', () => {
      const args = parseArgs('["--model", "gpt-4"]');
      expect(args).toEqual(['--model', 'gpt-4']);
    });

    it('Claude用の引数をパースできる', () => {
      const args = parseArgs('["--dangerously-skip-permissions"]');
      expect(args).toEqual(['--dangerously-skip-permissions']);
    });

    it('シェル用の引数をパースできる', () => {
      const args = parseArgs('-l -c "echo hello"');
      expect(args).toEqual(['-l', '-c', 'echo hello']);
    });

    it('空の引数を処理できる', () => {
      expect(parseArgs('')).toEqual([]);
      expect(parseArgs(undefined)).toEqual([]);
    });
  });

  describe('カスタムコマンドのパース', () => {
    it('単純なコマンドを分割できる', () => {
      const parts = splitArgs('npm run dev');
      expect(parts).toEqual(['npm', 'run', 'dev']);
    });

    it('引数付きコマンドを分割できる', () => {
      const parts = splitArgs('docker run -it --rm ubuntu bash');
      expect(parts).toEqual(['docker', 'run', '-it', '--rm', 'ubuntu', 'bash']);
    });

    it('クォート付きコマンドを分割できる', () => {
      const parts = splitArgs('python -c "print(\'hello\')"');
      expect(parts).toEqual(['python', '-c', "print('hello')"]);
    });

    it('パス付きコマンドを分割できる', () => {
      const parts = splitArgs('/usr/local/bin/node script.js');
      expect(parts).toEqual(['/usr/local/bin/node', 'script.js']);
    });

    it('環境変数付きコマンドを分割できる', () => {
      // 注: 実際の環境変数展開はシェルが行うため、ここでは文字列として分割
      const parts = splitArgs('NODE_ENV=production node server.js');
      expect(parts).toEqual(['NODE_ENV=production', 'node', 'server.js']);
    });
  });
});

// ============================================================
// セッションモードのバリデーション
// ============================================================

describe('セッションモードのバリデーション', () => {
  const validModes = ['codex', 'claude', 'shell', 'custom'];

  it('有効なモードを識別できる', () => {
    validModes.forEach((mode) => {
      expect(validModes.includes(mode)).toBe(true);
    });
  });

  it('無効なモードを識別できる', () => {
    expect(validModes.includes('invalid')).toBe(false);
    expect(validModes.includes('')).toBe(false);
    expect(validModes.includes('CODEX')).toBe(false); // 大文字は無効
  });
});

// ============================================================
// セッションIDの形式チェック
// ============================================================

describe('セッションIDの形式', () => {
  // nanoidが生成するIDの形式をシミュレート
  const nanoidPattern = /^[A-Za-z0-9_-]{10}$/;

  it('10文字のIDパターンを検証できる', () => {
    const validIds = ['abc123XYZ_', 'a1b2c3d4e5', 'ABCDEFGHIJ'];
    validIds.forEach((id) => {
      expect(nanoidPattern.test(id)).toBe(true);
    });
  });

  it('無効なIDを検出できる', () => {
    const invalidIds = [
      'short', // 短すぎる
      'thisidistoolong', // 長すぎる
      'abc123!@#$', // 無効な文字
      '', // 空
    ];
    invalidIds.forEach((id) => {
      expect(nanoidPattern.test(id)).toBe(false);
    });
  });
});
