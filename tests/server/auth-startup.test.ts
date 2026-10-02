/** Exercise the real entrypoint with inert servers: no network listener is opened. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ token: undefined as string | undefined, https: false }));
const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
  http: vi.fn(),
  https: vi.fn(),
  websocket: vi.fn(),
  initLogDir: vi.fn(),
  cleanupAllSessions: vi.fn(),
}));
vi.mock('../../src/config.js', () => ({
  get AUTH_TOKEN() {
    return state.token;
  },
  get ENABLE_HTTPS() {
    return state.https;
  },
  PORT: 4173,
  SSL_KEY_PATH: '',
  SSL_CERT_PATH: '',
  ENABLE_SESSION_LOGS: true,
  LOG_DIR: '/unused',
}));
vi.mock('http', () => ({ default: { createServer: mocks.http } }));
vi.mock('https', () => ({ default: { createServer: mocks.https } }));
vi.mock('ws', () => ({ WebSocketServer: mocks.websocket }));
vi.mock('../../src/services/logger.js', () => ({ default: { info: vi.fn(), error: vi.fn() } }));
vi.mock('../../src/services/session.js', () => ({
  initLogDir: mocks.initLogDir,
  cleanupAllSessions: mocks.cleanupAllSessions,
}));
vi.mock('../../src/services/websocket.js', () => ({ setupWebSocketHandlers: vi.fn() }));
vi.mock('../../src/utils/network.js', () => ({ buildAccessUrls: () => [] }));
vi.mock('../../src/middleware/rateLimit.js', () => ({ createRateLimiter: () => vi.fn() }));
vi.mock('../../src/routes/health.js', () => ({ default: vi.fn() }));
vi.mock('../../src/routes/api.js', () => ({ default: vi.fn() }));
vi.mock('../../src/routes/files.js', () => ({ default: vi.fn() }));
vi.mock('../../src/routes/logs.js', () => ({ default: vi.fn() }));
vi.mock('../../src/routes/clipboard.js', () => ({ default: vi.fn() }));
vi.mock('../../src/routes/snippets.js', () => ({ default: vi.fn() }));
vi.mock('../../src/routes/ai.js', () => ({ default: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.http.mockReturnValue({ listen: mocks.listen });
  vi.spyOn(process, 'on').mockReturnValue(process);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([false, true])('startup auth gate (HTTPS=%s)', (https) => {
  it.each([undefined, '', ' ', '\t\n', 'change-me', ' change-me ', 'pdr-local', ' pdr-local '])(
    'rejects invalid configuration case %# before server creation',
    async (token) => {
      state.token = token;
      state.https = https;
      await expect(import('../../src/server.js')).rejects.toThrow(/^AUTH_TOKEN must be set/);
      expect(mocks.http).not.toHaveBeenCalled();
      expect(mocks.https).not.toHaveBeenCalled();
      expect(mocks.websocket).not.toHaveBeenCalled();
      expect(mocks.listen).not.toHaveBeenCalled();
      expect(mocks.initLogDir).not.toHaveBeenCalled();
    },
  );
});

it('allows a configured token to reach the unchanged startup path', async () => {
  state.token = 'startup-test-token';
  state.https = false;
  await import('../../src/server.js');
  expect(mocks.http).toHaveBeenCalledOnce();
  expect(mocks.websocket).toHaveBeenCalledOnce();
  expect(mocks.listen).toHaveBeenCalledExactlyOnceWith(4173, '0.0.0.0', expect.any(Function));
});
