/**
 * PTYサービスのテスト
 * シェルメタ文字検出、ブロックコマンド検出、スポーン設定のテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// config.jsのモック（カスタムコマンド有効）
vi.mock('../../src/config.js', () => ({
  ALLOW_CUSTOM_COMMANDS: true,
  SHELL_CMD: '/bin/bash',
  LOG_LEVEL: 'silent',
  APP_VERSION: '0.0.0-test',
}));

describe('PTYサービス', () => {
  let spawnForMode: typeof import('../../src/services/pty.js').spawnForMode;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('../../src/config.js', () => ({
      ALLOW_CUSTOM_COMMANDS: true,
      SHELL_CMD: '/bin/bash',
      LOG_LEVEL: 'silent',
      APP_VERSION: '0.0.0-test',
    }));
    const mod = await import('../../src/services/pty.js');
    spawnForMode = mod.spawnForMode;
  });

  // ============================================================
  // シェルメタ文字検出のテスト
  // ============================================================

  describe('シェルメタ文字検出', () => {
    /**
     * メタ文字を含むコマンドが拒否されることを検証するヘルパー
     */
    function expectBlocked(command: string, description: string): void {
      it(`${description} を検出してブロックする: "${command}"`, () => {
        expect(() => spawnForMode('custom', command)).toThrow('shell-metachar-detected');
      });
    }

    /**
     * 安全なコマンドが許可されることを検証するヘルパー
     */
    function expectAllowed(command: string, description: string): void {
      it(`${description} を許可する: "${command}"`, () => {
        // ブロックコマンドでない安全なコマンドがメタ文字チェックを通過すること
        expect(() => spawnForMode('custom', command)).not.toThrow('shell-metachar-detected');
      });
    }

    // パイプライン・コマンド連結
    expectBlocked('cat /etc/passwd | grep root', 'パイプ（|）');
    expectBlocked('echo hello; echo world', 'セミコロン（;）');
    expectBlocked('true && echo success', 'AND連結（&&）');
    expectBlocked('false || echo fallback', 'OR連結（||）');

    // コマンド置換
    expectBlocked('echo $(whoami)', 'コマンド置換 $(...)');
    expectBlocked('echo `whoami`', 'バッククォート置換 `...`');

    // 変数展開
    expectBlocked('echo $HOME', '変数展開 $VAR');
    expectBlocked('echo ${HOME}', '変数展開 ${VAR}');

    // 算術展開
    expectBlocked('echo $((1+2))', '算術展開 $((expr))');

    // リダイレクト
    expectBlocked('echo hello > /tmp/out', '出力リダイレクト（>）');
    expectBlocked('echo hello >> /tmp/out', '追記リダイレクト（>>）');
    expectBlocked('cat < /etc/passwd', '入力リダイレクト（<）');
    expectBlocked('cat << EOF', 'ヒアドキュメント（<<）');

    // サブシェル・ブレース展開
    expectBlocked('(echo hello)', 'サブシェル (...)');
    expectBlocked('{ echo hello; }', 'ブレース展開 {...}');

    // 改行によるコマンド注入
    expectBlocked('echo hello\necho world', '改行文字（\\n）');
    expectBlocked('echo hello\recho world', 'キャリッジリターン（\\r）');

    // エスケープされた改行リテラル（JSONペイロード経由での注入）
    expectBlocked('echo hello\\necho world', 'エスケープリテラル（\\\\n）');
    expectBlocked('echo hello\\recho world', 'エスケープリテラル（\\\\r）');

    // 安全なコマンド（通常のシェル操作を阻害しないことを確認）
    expectAllowed('node server.js', '通常のコマンド');
    expectAllowed('python3 script.py', 'パス無しコマンド');
    expectAllowed('/usr/local/bin/node app.js', 'フルパスコマンド');
    expectAllowed('npm run dev', 'npmスクリプト');
    expectAllowed('docker run -it ubuntu', 'フラグ付きコマンド');
    expectAllowed('git log --oneline', 'ダブルダッシュフラグ');
  });

  // ============================================================
  // ブロックコマンド検出のテスト
  // ============================================================

  describe('ブロックコマンド検出', () => {
    const blockedCommands = [
      'rm', 'rmdir', 'mkfs', 'dd', 'format',
      'shutdown', 'reboot', 'halt', 'poweroff',
      'chmod', 'chown', 'chgrp',
      'su', 'sudo',
      'passwd', 'useradd', 'userdel', 'usermod',
      'iptables', 'ip6tables',
    ];

    blockedCommands.forEach((cmd) => {
      it(`危険なコマンド "${cmd}" をブロックする`, () => {
        expect(() => spawnForMode('custom', cmd)).toThrow('blocked-command');
      });
    });

    it('パス付きのブロックコマンドもブロックする', () => {
      expect(() => spawnForMode('custom', '/usr/bin/sudo')).toThrow('blocked-command');
      expect(() => spawnForMode('custom', '/bin/rm')).toThrow('blocked-command');
    });
  });

  // ============================================================
  // スポーン設定のテスト
  // ============================================================

  describe('spawnForMode', () => {
    it('customモードで安全なコマンドを受け付ける', () => {
      const config = spawnForMode('custom', 'node server.js');
      expect(config.command).toBe('node');
      expect(config.args).toEqual(['server.js']);
      expect(config.label).toBe('Custom');
    });

    it('customモードでコマンドが空の場合エラーになる', () => {
      expect(() => spawnForMode('custom', '')).toThrow('missing-command');
    });

    it('customモードでundefinedの場合エラーになる', () => {
      expect(() => spawnForMode('custom', undefined)).toThrow('missing-command');
    });

    it('sshモードはエラーになる', () => {
      expect(() => spawnForMode('ssh', undefined)).toThrow('ssh-mode-not-pty');
    });

    it('不明なモードはエラーになる', () => {
      // @ts-expect-error: 不明なモードのテスト
      expect(() => spawnForMode('invalid', undefined)).toThrow('unknown-mode');
    });

    it('プリセットモード（codex）の設定を返す', () => {
      const config = spawnForMode('codex', undefined);
      expect(config.label).toBe('Codex CLI');
    });

    it('プリセットモード（claude）の設定を返す', () => {
      const config = spawnForMode('claude', undefined);
      expect(config.label).toBe('Claude Code');
    });

    it('プリセットモード（shell）の設定を返す', () => {
      const config = spawnForMode('shell', undefined);
      expect(config.label).toBe('Shell');
      expect(config.command).toBe('/bin/bash');
    });
  });

  // ============================================================
  // カスタムコマンド無効時のテスト
  // ============================================================

  describe('カスタムコマンド無効時', () => {
    let spawnForModeDisabled: typeof import('../../src/services/pty.js').spawnForMode;

    beforeEach(async () => {
      vi.resetModules();
      vi.doMock('../../src/config.js', () => ({
        ALLOW_CUSTOM_COMMANDS: false,
        SHELL_CMD: '/bin/bash',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      const mod = await import('../../src/services/pty.js');
      spawnForModeDisabled = mod.spawnForMode;
    });

    it('customモードが拒否される', () => {
      expect(() => spawnForModeDisabled('custom', 'node server.js')).toThrow(
        'custom-commands-disabled',
      );
    });
  });
});
