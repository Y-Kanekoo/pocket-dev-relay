/** Production authentication boundaries, without opening sockets or starting terminals. */
import { EventEmitter } from 'node:events';
import type http from 'node:http';
import type { Request, Response } from 'express';
import type { WebSocketServer } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthenticationError } from '../../src/errors/AppError.js';
import { assertAuthTokenConfigured, isConfiguredAuthToken } from '../../src/utils/auth.js';
import * as legacyAuth from '../../src/server/auth.js';

const config = vi.hoisted(() => ({ token: 'test-secret' as string | undefined }));
const sessions = vi.hoisted(() => ({
  sessions: new Map(),
  send: vi.fn(),
  startSession: vi.fn(),
  startSSHSession: vi.fn(),
  stopSession: vi.fn(),
}));
vi.mock('../../src/config.js', () => ({
  get AUTH_TOKEN() {
    return config.token;
  },
  SESSION_TIMEOUT: 0,
}));
vi.mock('../../src/services/session.js', () => sessions);
vi.mock('../../src/services/ssh.js', () => ({ resizeSSHChannel: vi.fn() }));

import * as auth from '../../src/middleware/auth.js';
import { setupWebSocketHandlers } from '../../src/services/websocket.js';

const invalidTokens = [
  undefined,
  '',
  ' ',
  '\t\n',
  'change-me',
  ' change-me ',
  'pdr-local',
  ' pdr-local ',
];
const request = (url = '/ws', authorization?: string): http.IncomingMessage =>
  ({
    url,
    headers: { authorization, host: 'localhost:4173', origin: 'http://localhost:4173' },
  }) as http.IncomingMessage;

function connect(url: string) {
  const wss = new EventEmitter();
  const ws = Object.assign(new EventEmitter(), { close: vi.fn() });
  setupWebSocketHandlers(wss as WebSocketServer);
  wss.emit('connection', ws, request(url));
  return ws;
}

afterEach(() => {
  config.token = 'test-secret';
  vi.clearAllMocks();
});

describe('fail-closed configuration', () => {
  it.each(invalidTokens)(
    'rejects invalid configuration case %# in every auth entrypoint',
    (token) => {
      config.token = token;
      expect(isConfiguredAuthToken(token)).toBe(false);
      expect(() => assertAuthTokenConfigured(token)).toThrow(/^AUTH_TOKEN must be set/);
      for (const header of [undefined, `Bearer ${token ?? ''}`, 'Bearer other']) {
        expect(auth.isAuthorizedHeader(header)).toBe(false);
        expect(legacyAuth.isAuthorizedHeader(header, token ?? '')).toBe(false);
        const next = vi.fn();
        auth.authMiddleware(request('/api/files', header) as Request, {} as Response, next);
        expect(next).toHaveBeenCalledExactlyOnceWith(expect.any(AuthenticationError));
        expect(next.mock.calls[0][0].statusCode).toBe(401);
      }
      for (const url of ['/ws', `/ws?token=${encodeURIComponent(token ?? '')}`]) {
        expect(auth.authorizeWebSocket(request(url))).toBe(false);
        expect(legacyAuth.authorizeWebSocket(request(url), token ?? '')).toBe(false);
        const ws = connect(url);
        expect(ws.close).toHaveBeenCalledExactlyOnceWith(4001, 'unauthorized');
        expect(ws.listenerCount('message')).toBe(0);
      }
      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const next = vi.fn();
      legacyAuth.createAuthMiddleware(token ?? '')(
        request('/api/files') as Request,
        { status } as unknown as Response,
        next,
      );
      expect(status).toHaveBeenCalledExactlyOnceWith(401);
      expect(next).not.toHaveBeenCalled();
      expect(sessions.startSession).not.toHaveBeenCalled();
      expect(sessions.startSSHSession).not.toHaveBeenCalled();
    },
  );

  it('reports only a fixed remediation message, never the configured value', () => {
    for (const token of invalidTokens) {
      try {
        assertAuthTokenConfigured(token);
      } catch (error) {
        expect((error as Error).message).toBe(
          'AUTH_TOKEN must be set to a non-blank, non-placeholder secret before starting the server.',
        );
      }
    }
  });
});

describe('valid-token compatibility', () => {
  it.each(['test-secret', '+/=%日本語', ' padded-secret '])(
    'preserves exact credential case %#',
    (token) => {
      config.token = token;
      expect(() => assertAuthTokenConfigured(token)).not.toThrow();
      expect(auth.isAuthorizedHeader(`Bearer ${token}`)).toBe(true);
      expect(legacyAuth.isAuthorizedHeader(`Bearer ${token}`, token)).toBe(true);
      const next = vi.fn();
      auth.authMiddleware(
        request('/api/files', `Bearer ${token}`) as Request,
        {} as Response,
        next,
      );
      expect(next).toHaveBeenCalledExactlyOnceWith();
      const url = `/ws?token=${encodeURIComponent(token)}`;
      expect(auth.authorizeWebSocket(request(url))).toBe(true);
      expect(legacyAuth.authorizeWebSocket(request(url), token)).toBe(true);
      const ws = connect(url);
      expect(ws.close).not.toHaveBeenCalled();
      expect(ws.listenerCount('message')).toBe(1);
      if (token !== token.trim()) {
        expect(auth.isAuthorizedHeader(`Bearer ${token.trim()}`)).toBe(false);
        expect(auth.authorizeWebSocket(request(`/ws?token=${token.trim()}`))).toBe(false);
      }
    },
  );

  it.each([undefined, 'Bearer wrong', 'test-secret', 'bearer test-secret', 'Bearer '])(
    'rejects missing or wrong HTTP credential case %# even on localhost',
    (header) => {
      const next = vi.fn();
      auth.authMiddleware(request('/api/files', header) as Request, {} as Response, next);
      expect(next).toHaveBeenCalledExactlyOnceWith(expect.any(AuthenticationError));
    },
  );

  it.each(['/ws', '/ws?token=', '/ws?token=wrong', '/ws?token=wrong&token=test-secret', '//['])(
    'rejects missing, wrong, or malformed WS credential case %# before session execution',
    (url) => {
      expect(auth.authorizeWebSocket(request(url))).toBe(false);
      expect(legacyAuth.authorizeWebSocket(request(url), 'test-secret')).toBe(false);
      const ws = connect(url);
      expect(ws.close).toHaveBeenCalledExactlyOnceWith(4001, 'unauthorized');
      expect(ws.listenerCount('message')).toBe(0);
      expect(sessions.startSession).not.toHaveBeenCalled();
      expect(sessions.startSSHSession).not.toHaveBeenCalled();
    },
  );

  it('retains the first query parameter semantics', () => {
    expect(auth.authorizeWebSocket(request('/ws?token=test-secret&token=wrong'))).toBe(true);
  });

  it('does not trust Host or Origin as credentials', () => {
    for (const host of ['localhost', '127.0.0.1', 'attacker.invalid']) {
      const req = request('/ws');
      req.headers = { host, origin: `http://${host}`, 'x-forwarded-for': '127.0.0.1' };
      expect(auth.authorizeWebSocket(req)).toBe(false);
      const next = vi.fn();
      auth.authMiddleware(req as Request, {} as Response, next);
      expect(next).toHaveBeenCalledExactlyOnceWith(expect.any(AuthenticationError));
    }
  });
});
