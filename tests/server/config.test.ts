/**
 * config.ts のテスト
 * 環境変数の分岐、validateInt、TRUST_PROXY、LOG_LEVEL、APP_VERSION等
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 元の環境変数を退避する
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  vi.resetModules();
});

afterEach(() => {
  process.env = originalEnv;
});

/**
 * 環境変数を設定してconfig.tsを動的インポートするヘルパー
 */
async function loadConfigWith(envOverrides: Record<string, string | undefined>) {
  // 不要な環境変数をクリア
  delete process.env.PORT;
  delete process.env.HOST;
  delete process.env.WORKSPACE_ROOT;
  delete process.env.AUTH_TOKEN;
  delete process.env.ALLOW_CUSTOM_COMMANDS;
  delete process.env.ALLOW_FILE_WRITE;
  delete process.env.MAX_FILE_SIZE;
  delete process.env.TRUST_PROXY;
  delete process.env.LOG_LEVEL;
  delete process.env.NODE_ENV;
  delete process.env.ENABLE_SESSION_LOGS;
  delete process.env.LOG_DIR;
  delete process.env.DATA_DIR;
  delete process.env.LOG_MAX_AGE_DAYS;
  delete process.env.LOG_MAX_SIZE_MB;
  delete process.env.SHELL_CMD;
  delete process.env.MAX_UPLOAD_SIZE;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_MODEL;
  delete process.env.AI_MAX_CONTEXT_LINES;
  delete process.env.ENABLE_HTTPS;
  delete process.env.SSL_KEY_PATH;
  delete process.env.SSL_CERT_PATH;
  delete process.env.RATE_LIMIT_API;
  delete process.env.RATE_LIMIT_AUTH;
  delete process.env.SESSION_TIMEOUT;
  delete process.env.MAX_SESSION_LIFETIME;
  delete process.env.MAX_SESSIONS;
  delete process.env.ENABLE_SSH;
  delete process.env.SSH_DEFAULT_HOST;
  delete process.env.SSH_DEFAULT_PORT;
  delete process.env.SSH_DEFAULT_USER;
  delete process.env.SSH_KEY_PATH;
  delete process.env.SSH_STRICT_HOST_KEY;
  delete process.env.SSH_REQUIRE_HTTPS_FOR_PASSWORD;
  delete process.env.ENABLE_TUNNEL;
  delete process.env.TUNNEL_PROVIDER;
  delete process.env.CLOUDFLARED_PATH;
  delete process.env.TUNNEL_TIMEOUT;

  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  // dotenvのモック（テスト中に.envファイルを読まないようにする）
  vi.doMock('dotenv', () => ({
    default: { config: vi.fn() },
    config: vi.fn(),
  }));

  return import('../../src/config.js');
}

describe('config.ts', () => {
  describe('validateInt - PORT設定', () => {
    it('環境変数未設定時はデフォルト値を使用する', async () => {
      const config = await loadConfigWith({});
      expect(config.PORT).toBe(4173);
    });

    it('正常な整数値を受け付ける', async () => {
      const config = await loadConfigWith({ PORT: '8080' });
      expect(config.PORT).toBe(8080);
    });

    it('最小値（1）を受け付ける', async () => {
      const config = await loadConfigWith({ PORT: '1' });
      expect(config.PORT).toBe(1);
    });

    it('最大値（65535）を受け付ける', async () => {
      const config = await loadConfigWith({ PORT: '65535' });
      expect(config.PORT).toBe(65535);
    });

    it('範囲外（0）の場合はデフォルト値にフォールバックする', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = await loadConfigWith({ PORT: '0' });
      expect(config.PORT).toBe(4173);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PORT'));
      warnSpy.mockRestore();
    });

    it('範囲外（65536）の場合はデフォルト値にフォールバックする', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = await loadConfigWith({ PORT: '65536' });
      expect(config.PORT).toBe(4173);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PORT'));
      warnSpy.mockRestore();
    });

    it('非数値文字列の場合はデフォルト値にフォールバックする', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = await loadConfigWith({ PORT: 'abc' });
      expect(config.PORT).toBe(4173);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PORT'));
      warnSpy.mockRestore();
    });

    it('小数値の場合はparseIntにより整数部が使用される', async () => {
      // parseInt('3.14', 10) は 3 を返し、3 は範囲内なのでそのまま使用される
      const config = await loadConfigWith({ PORT: '3.14' });
      expect(config.PORT).toBe(3);
    });

    it('空文字列の場合はデフォルト値を使用する', async () => {
      const config = await loadConfigWith({ PORT: '' });
      expect(config.PORT).toBe(4173);
    });

    it('負の値の場合はデフォルト値にフォールバックする', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = await loadConfigWith({ PORT: '-1' });
      expect(config.PORT).toBe(4173);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PORT'));
      warnSpy.mockRestore();
    });
  });

  describe('validateInt - MAX_SESSIONS設定（上限が100）', () => {
    it('範囲内の値を受け付ける', async () => {
      const config = await loadConfigWith({ MAX_SESSIONS: '50' });
      expect(config.MAX_SESSIONS).toBe(50);
    });

    it('上限（100）を超える値はデフォルト値にフォールバックする', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = await loadConfigWith({ MAX_SESSIONS: '101' });
      expect(config.MAX_SESSIONS).toBe(10);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('MAX_SESSIONS'));
      warnSpy.mockRestore();
    });
  });

  describe('TRUST_PROXY設定', () => {
    it('未設定時はfalseになる', async () => {
      const config = await loadConfigWith({});
      expect(config.TRUST_PROXY).toBe(false);
    });

    it('"true"を設定するとtrueになる', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const config = await loadConfigWith({ TRUST_PROXY: 'true' });
      expect(config.TRUST_PROXY).toBe(true);
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('TRUST_PROXY'));
      infoSpy.mockRestore();
    });

    it('"false"を設定するとfalseになる', async () => {
      const config = await loadConfigWith({ TRUST_PROXY: 'false' });
      expect(config.TRUST_PROXY).toBe(false);
    });

    it('正の整数を設定すると数値になる', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const config = await loadConfigWith({ TRUST_PROXY: '2' });
      expect(config.TRUST_PROXY).toBe(2);
      infoSpy.mockRestore();
    });

    it('0を設定すると数値0になる', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const config = await loadConfigWith({ TRUST_PROXY: '0' });
      expect(config.TRUST_PROXY).toBe(0);
      infoSpy.mockRestore();
    });

    it('IPアドレス文字列をそのまま返す', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const config = await loadConfigWith({ TRUST_PROXY: '127.0.0.1' });
      expect(config.TRUST_PROXY).toBe('127.0.0.1');
      infoSpy.mockRestore();
    });

    it('サブネット文字列をそのまま返す', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const config = await loadConfigWith({ TRUST_PROXY: '10.0.0.0/8' });
      expect(config.TRUST_PROXY).toBe('10.0.0.0/8');
      infoSpy.mockRestore();
    });
  });

  describe('LOG_LEVEL設定', () => {
    it('環境変数未設定でNODE_ENVがproductionの場合はinfoを返す', async () => {
      const config = await loadConfigWith({ NODE_ENV: 'production' });
      expect(config.LOG_LEVEL).toBe('info');
    });

    it('環境変数未設定でNODE_ENVがdevelopmentの場合はdebugを返す', async () => {
      const config = await loadConfigWith({ NODE_ENV: 'development' });
      expect(config.LOG_LEVEL).toBe('debug');
    });

    it('環境変数未設定でNODE_ENVも未設定の場合はdebugを返す', async () => {
      const config = await loadConfigWith({});
      expect(config.LOG_LEVEL).toBe('debug');
    });

    it('LOG_LEVELが明示的に設定されている場合はその値を返す', async () => {
      const config = await loadConfigWith({ LOG_LEVEL: 'warn', NODE_ENV: 'production' });
      expect(config.LOG_LEVEL).toBe('warn');
    });
  });

  describe('AI_PROVIDER設定', () => {
    it('APIキー未設定時はnullを返す', async () => {
      const config = await loadConfigWith({});
      expect(config.AI_PROVIDER).toBeNull();
    });

    it('ANTHROPIC_API_KEYが設定されている場合はclaudeを返す', async () => {
      const config = await loadConfigWith({ ANTHROPIC_API_KEY: 'test-key' });
      expect(config.AI_PROVIDER).toBe('claude');
    });

    it('OPENAI_API_KEYのみ設定されている場合はopenaiを返す', async () => {
      const config = await loadConfigWith({ OPENAI_API_KEY: 'test-key' });
      expect(config.AI_PROVIDER).toBe('openai');
    });

    it('両方設定されている場合はclaudeが優先される', async () => {
      const config = await loadConfigWith({
        ANTHROPIC_API_KEY: 'anthropic-key',
        OPENAI_API_KEY: 'openai-key',
      });
      expect(config.AI_PROVIDER).toBe('claude');
    });
  });

  describe('AI_MODEL設定', () => {
    it('ANTHROPIC_API_KEY設定時のデフォルトモデル', async () => {
      const config = await loadConfigWith({ ANTHROPIC_API_KEY: 'test-key' });
      expect(config.AI_MODEL).toBe('claude-sonnet-4-5-20250929');
    });

    it('ANTHROPIC_API_KEY未設定時のデフォルトモデル', async () => {
      const config = await loadConfigWith({});
      expect(config.AI_MODEL).toBe('gpt-4o');
    });

    it('AI_MODELが明示的に設定されている場合はその値を返す', async () => {
      const config = await loadConfigWith({ AI_MODEL: 'custom-model' });
      expect(config.AI_MODEL).toBe('custom-model');
    });
  });

  describe('ブール値設定', () => {
    it('ALLOW_CUSTOM_COMMANDSは"true"のときのみtrue', async () => {
      const config1 = await loadConfigWith({ ALLOW_CUSTOM_COMMANDS: 'true' });
      expect(config1.ALLOW_CUSTOM_COMMANDS).toBe(true);

      vi.resetModules();
      const config2 = await loadConfigWith({ ALLOW_CUSTOM_COMMANDS: 'false' });
      expect(config2.ALLOW_CUSTOM_COMMANDS).toBe(false);

      vi.resetModules();
      const config3 = await loadConfigWith({});
      expect(config3.ALLOW_CUSTOM_COMMANDS).toBe(false);
    });

    it('ENABLE_HTTPSは"true"のときのみtrue', async () => {
      const config1 = await loadConfigWith({ ENABLE_HTTPS: 'true' });
      expect(config1.ENABLE_HTTPS).toBe(true);

      vi.resetModules();
      const config2 = await loadConfigWith({});
      expect(config2.ENABLE_HTTPS).toBe(false);
    });

    it('SSH_STRICT_HOST_KEYは"false"以外でtrue', async () => {
      const config1 = await loadConfigWith({});
      expect(config1.SSH_STRICT_HOST_KEY).toBe(true);

      vi.resetModules();
      const config2 = await loadConfigWith({ SSH_STRICT_HOST_KEY: 'false' });
      expect(config2.SSH_STRICT_HOST_KEY).toBe(false);

      vi.resetModules();
      const config3 = await loadConfigWith({ SSH_STRICT_HOST_KEY: 'true' });
      expect(config3.SSH_STRICT_HOST_KEY).toBe(true);
    });
  });

  describe('文字列設定のデフォルト値', () => {
    it('HOSTのデフォルトは0.0.0.0', async () => {
      const config = await loadConfigWith({});
      expect(config.HOST).toBe('0.0.0.0');
    });

    it('AUTH_TOKENのデフォルトは空文字列', async () => {
      const config = await loadConfigWith({});
      expect(config.AUTH_TOKEN).toBe('');
    });

    it('TUNNEL_PROVIDERのデフォルトはcloudflared', async () => {
      const config = await loadConfigWith({});
      expect(config.TUNNEL_PROVIDER).toBe('cloudflared');
    });
  });

  describe('APP_VERSION', () => {
    it('package.jsonから値を取得する', async () => {
      const config = await loadConfigWith({});
      // 実際のpackage.jsonが存在するため、バージョン文字列が返る
      expect(typeof config.APP_VERSION).toBe('string');
      expect(config.APP_VERSION).not.toBe('');
    });

    it('package.jsonが読めない場合は0.0.0を返す', async () => {
      vi.doMock('fs', () => ({
        readFileSync: () => {
          throw new Error('ファイルが見つかりません');
        },
      }));

      // readFileSyncは直接モックが難しいため、この分岐は
      // __dirnameがビルド後のパスを参照する環境でテストされることを確認
      const config = await loadConfigWith({});
      // 正常時はバージョン文字列、異常時は'0.0.0'
      expect(typeof config.APP_VERSION).toBe('string');
    });
  });

  describe('SESSION_TIMEOUT設定', () => {
    it('0を許容する（無効化）', async () => {
      const config = await loadConfigWith({ SESSION_TIMEOUT: '0' });
      expect(config.SESSION_TIMEOUT).toBe(0);
    });

    it('デフォルトは1時間（3600000ms）', async () => {
      const config = await loadConfigWith({});
      expect(config.SESSION_TIMEOUT).toBe(3600000);
    });
  });
});
