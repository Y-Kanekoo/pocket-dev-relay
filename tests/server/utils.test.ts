/**
 * サーバー側ユーティリティ関数のテスト
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import {
  stripAnsi,
  splitArgs,
  parseArgs,
  resolvePath,
  generateLogFileName,
  normalizeMdns,
} from '../../src/server/utils.js';

// ============================================================
// stripAnsi のテスト
// ============================================================

describe('stripAnsi', () => {
  it('ANSIエスケープシーケンスを除去する', () => {
    // 色付きテキスト（赤色）
    const input = '\x1B[31mエラー\x1B[0m';
    expect(stripAnsi(input)).toBe('エラー');
  });

  it('複数のANSIコードを除去する', () => {
    // 太字+青色+リセット
    const input = '\x1B[1m\x1B[34mタイトル\x1B[0m: 内容';
    expect(stripAnsi(input)).toBe('タイトル: 内容');
  });

  it('ANSIコードがない場合はそのまま返す', () => {
    const input = '通常のテキスト';
    expect(stripAnsi(input)).toBe('通常のテキスト');
  });

  it('カーソル移動コードを除去する', () => {
    // カーソルを上に移動
    const input = '\x1B[2Aテスト';
    expect(stripAnsi(input)).toBe('テスト');
  });

  it('空文字列を処理できる', () => {
    expect(stripAnsi('')).toBe('');
  });
});

// ============================================================
// splitArgs のテスト
// ============================================================

describe('splitArgs', () => {
  it('スペース区切りの引数を分割する', () => {
    expect(splitArgs('arg1 arg2 arg3')).toEqual(['arg1', 'arg2', 'arg3']);
  });

  it('ダブルクォートで囲まれた引数を処理する', () => {
    expect(splitArgs('--name "John Doe" --age 30')).toEqual(['--name', 'John Doe', '--age', '30']);
  });

  it('シングルクォートで囲まれた引数を処理する', () => {
    expect(splitArgs("--message 'Hello World'")).toEqual(['--message', 'Hello World']);
  });

  it('エスケープされた空白を処理する', () => {
    expect(splitArgs('path/to/file\\ name.txt')).toEqual(['path/to/file name.txt']);
  });

  it('クォート内のエスケープ文字を処理する', () => {
    expect(splitArgs('"say \\"hello\\""')).toEqual(['say "hello"']);
  });

  it('空文字列を処理できる', () => {
    expect(splitArgs('')).toEqual([]);
  });

  it('連続した空白を正しく処理する', () => {
    expect(splitArgs('arg1   arg2')).toEqual(['arg1', 'arg2']);
  });

  it('先頭と末尾の空白を無視する', () => {
    expect(splitArgs('  arg1 arg2  ')).toEqual(['arg1', 'arg2']);
  });
});

// ============================================================
// parseArgs のテスト
// ============================================================

describe('parseArgs', () => {
  it('JSON配列をパースする', () => {
    expect(parseArgs('["--flag", "value"]')).toEqual(['--flag', 'value']);
  });

  it('数値を含むJSON配列を文字列に変換する', () => {
    expect(parseArgs('[1, 2, 3]')).toEqual(['1', '2', '3']);
  });

  it('JSONパース失敗時はsplitArgsにフォールバックする', () => {
    expect(parseArgs('--flag value')).toEqual(['--flag', 'value']);
  });

  it('undefinedの場合は空配列を返す', () => {
    expect(parseArgs(undefined)).toEqual([]);
  });

  it('空文字列の場合は空配列を返す', () => {
    expect(parseArgs('')).toEqual([]);
  });

  it('配列でないJSONの場合はsplitArgsにフォールバックする', () => {
    // オブジェクトのJSONはJSON.parseは成功するが配列ではないため、splitArgsにフォールバック
    // splitArgsはダブルクォート内の値を抽出するため、クォートは除去される
    expect(parseArgs('{"key": "value"}')).toEqual(['{key:', 'value}']);
  });
});

// ============================================================
// resolvePath のテスト
// ============================================================

describe('resolvePath', () => {
  const rootDir = '/workspace/project';

  it('相対パスを絶対パスに解決する', () => {
    const result = resolvePath(rootDir, 'src/index.ts');
    expect(result).toBe(path.resolve(rootDir, 'src/index.ts'));
  });

  it('空文字列の場合はルートディレクトリを返す', () => {
    const result = resolvePath(rootDir, '');
    expect(result).toBe(rootDir);
  });

  it('ドットの場合はルートディレクトリを返す', () => {
    const result = resolvePath(rootDir, '.');
    expect(result).toBe(rootDir);
  });

  it('親ディレクトリへのトラバーサルを検出してエラーを投げる', () => {
    expect(() => resolvePath(rootDir, '../etc/passwd')).toThrow('Path outside workspace root');
  });

  it('複雑なトラバーサルを検出してエラーを投げる', () => {
    expect(() => resolvePath(rootDir, 'src/../../etc/passwd')).toThrow(
      'Path outside workspace root',
    );
  });

  it('正規化されたパスがルート内なら許可する', () => {
    // src/../lib は lib に正規化されるのでOK
    const result = resolvePath(rootDir, 'src/../lib/utils.ts');
    expect(result).toBe(path.resolve(rootDir, 'lib/utils.ts'));
  });
});

// ============================================================
// generateLogFileName のテスト
// ============================================================

describe('generateLogFileName', () => {
  it('正しい形式のファイル名を生成する', () => {
    const fileName = generateLogFileName('abc123', 'shell');
    // session-YYYY-MM-DDTHH-MM-SS-shell-abc123.log の形式
    expect(fileName).toMatch(/^session-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-shell-abc123\.log$/);
  });

  it('異なるモードで正しいファイル名を生成する', () => {
    const fileName = generateLogFileName('xyz789', 'codex');
    expect(fileName).toMatch(/^session-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-codex-xyz789\.log$/);
  });

  it('セッションIDが含まれる', () => {
    const sessionId = 'unique-session-id';
    const fileName = generateLogFileName(sessionId, 'claude');
    expect(fileName).toContain(sessionId);
  });
});

// ============================================================
// normalizeMdns のテスト
// ============================================================

describe('normalizeMdns', () => {
  it('ドットがないホスト名に.localを追加する', () => {
    expect(normalizeMdns('macbook')).toBe('macbook.local');
  });

  it('すでにドットを含むホスト名はそのまま返す', () => {
    expect(normalizeMdns('server.example.com')).toBe('server.example.com');
  });

  it('undefinedの場合は空文字列を返す', () => {
    expect(normalizeMdns(undefined)).toBe('');
  });

  it('空文字列の場合は空文字列を返す', () => {
    expect(normalizeMdns('')).toBe('');
  });

  it('.localで終わるホスト名はそのまま返す', () => {
    expect(normalizeMdns('device.local')).toBe('device.local');
  });
});
