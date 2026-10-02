import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Test actual env parsing without reading a developer's .env file.
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('authentication environment', () => {
  it.each([undefined, '', ' ', 'change-me', 'pdr-local', 'env-test-token'])(
    'loads environment case %# without normalizing the token',
    async (token) => {
      vi.resetModules();
      vi.stubEnv('AUTH_TOKEN', token);
      const config = await import('../../src/config.js');
      const auth = await import('../../src/middleware/auth.js');
      expect(config.AUTH_TOKEN).toBe(token ?? '');
      expect(auth.isAuthorizedHeader(`Bearer ${token ?? ''}`)).toBe(token === 'env-test-token');
    },
  );

  it('does not supply a known token when Compose receives an unset environment', () => {
    const compose = readFileSync('docker-compose.yml', 'utf8');
    const example = readFileSync('.env.example', 'utf8');
    expect(compose).toMatch(/^\s+- AUTH_TOKEN=\$\{AUTH_TOKEN:-\}$/m);
    expect(compose).not.toContain('pdr-local');
    expect(example).toMatch(/^AUTH_TOKEN=$/m);
  });
});
