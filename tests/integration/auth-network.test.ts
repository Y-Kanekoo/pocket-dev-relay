/** Real loopback HTTP/WS protocol boundaries; terminal/SSH execution remains mocked. */
import { once } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import WebSocket, { WebSocketServer } from 'ws';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({ token: 'network-test-token', root: '', allowWrite: false }));
const session = vi.hoisted(() => ({
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
  get ROOT_DIR() {
    return config.root;
  },
  get ALLOW_FILE_WRITE() {
    return config.allowWrite;
  },
  MAX_FILE_SIZE: 1024,
  MAX_UPLOAD_SIZE: 1024,
}));
vi.mock('../../src/services/session.js', () => session);
vi.mock('../../src/services/ssh.js', () => ({ resizeSSHChannel: vi.fn() }));
vi.mock('../../src/services/logger.js', () => ({ default: { error: vi.fn() } }));

import { authMiddleware } from '../../src/middleware/auth.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { setupWebSocketHandlers } from '../../src/services/websocket.js';
import filesRouter from '../../src/routes/files.js';

let server: http.Server;
let wss: WebSocketServer;
let base: string;
const clients: WebSocket[] = [];

beforeEach(async () => {
  config.token = 'network-test-token';
  config.root = await mkdtemp(path.join(tmpdir(), 'pdr-upload-test-'));
  config.allowWrite = false;
  vi.clearAllMocks();
  const app = express();
  app.get('/api/protected', authMiddleware, (_req, res) => res.json({ ok: true }));
  app.use('/api', filesRouter);
  app.use(errorHandler);
  server = http.createServer(app);
  wss = new WebSocketServer({ server, path: '/ws' });
  setupWebSocketHandlers(wss);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  for (const client of wss.clients) client.terminate();
  await new Promise<void>((resolve) => wss.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(config.root, { recursive: true, force: true });
});

describe('upload write boundary over real multipart HTTP', () => {
  async function upload(content: string, uploadPath = '.', authorized = true) {
    const body = new FormData();
    body.set('uploadPath', uploadPath);
    body.set('file', new Blob([content]), 'existing.txt');
    return fetch(`${base}/api/upload`, {
      method: 'POST',
      body,
      headers: authorized ? { authorization: 'Bearer network-test-token' } : {},
    });
  }

  it('refuses disabled uploads before writing or deleting an existing file', async () => {
    await writeFile(path.join(config.root, 'existing.txt'), 'keep');
    expect((await upload('replacement')).status).toBe(403);
    expect(await readFile(path.join(config.root, 'existing.txt'), 'utf8')).toBe('keep');
    expect(await readdir(config.root)).toEqual(['existing.txt']);
  });

  it('refuses unauthorized uploads without touching the filesystem', async () => {
    config.allowWrite = true;
    await writeFile(path.join(config.root, 'existing.txt'), 'keep');
    expect((await upload('replacement', '.', false)).status).toBe(401);
    expect(await readFile(path.join(config.root, 'existing.txt'), 'utf8')).toBe('keep');
    expect(await readdir(config.root)).toEqual(['existing.txt']);
  });

  it('preserves an existing file when destination validation fails', async () => {
    config.allowWrite = true;
    await writeFile(path.join(config.root, 'existing.txt'), 'keep');
    expect((await upload('replacement', '../outside')).status).toBe(400);
    expect(await readFile(path.join(config.root, 'existing.txt'), 'utf8')).toBe('keep');
    expect(await readdir(config.root)).toEqual(['existing.txt']);
  });

  it('cleans up an oversized attempt and permits a valid retry', async () => {
    config.allowWrite = true;
    await writeFile(path.join(config.root, 'existing.txt'), 'keep');
    expect((await upload('x'.repeat(2048))).status).toBeGreaterThanOrEqual(400);
    expect(await readFile(path.join(config.root, 'existing.txt'), 'utf8')).toBe('keep');
    expect(await readdir(config.root)).toEqual(['existing.txt']);
    const response = await upload('replacement');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, fileName: 'existing.txt' });
    expect(await readFile(path.join(config.root, 'existing.txt'), 'utf8')).toBe('replacement');
    expect(await readdir(config.root)).toEqual(['existing.txt']);
  });
});

function connect(query: string): WebSocket {
  const client = new WebSocket(`${base.replace('http:', 'ws:')}/ws${query}`);
  clients.push(client);
  return client;
}

describe('HTTP authentication over real loopback transport', () => {
  it.each([undefined, 'Bearer wrong', 'bearer network-test-token'])(
    'rejects credential case %# with an actual 401 response',
    async (authorization) => {
      const response = await fetch(`${base}/api/protected`, {
        headers: authorization ? { authorization } : {},
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: 'AUTHENTICATION_FAILED' });
    },
  );

  it('allows retry with the exact credential after repeated rejection', async () => {
    for (let i = 0; i < 2; i++) {
      expect((await fetch(`${base}/api/protected`)).status).toBe(401);
    }
    const response = await fetch(`${base}/api/protected`, {
      headers: { authorization: 'Bearer network-test-token' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe('WebSocket authentication over real loopback transport', () => {
  it.each(['', '?token=wrong', '?token=wrong&token=network-test-token'])(
    'closes credential case %# before terminal or SSH execution',
    async (query) => {
      const client = connect(query);
      const [code, reason] = await once(client, 'close');
      expect(code).toBe(4001);
      expect(reason.toString()).toBe('unauthorized');
      expect(session.startSession).not.toHaveBeenCalled();
      expect(session.startSSHSession).not.toHaveBeenCalled();
    },
  );

  it('accepts a fresh valid connection after a denied attempt and cleans up on close', async () => {
    await once(connect('?token=wrong'), 'close');
    session.startSession.mockResolvedValue({ id: 'safe-test-session', mode: 'shell' });
    const client = connect('?token=network-test-token');
    await once(client, 'open');
    client.send(JSON.stringify({ type: 'start', mode: 'shell' }));
    await vi.waitFor(() => expect(session.startSession).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(session.send).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: 'started', sessionId: 'safe-test-session' }),
      ),
    );
    client.close();
    await once(client, 'close');
    await vi.waitFor(() =>
      expect(session.stopSession).toHaveBeenCalledExactlyOnceWith(
        'safe-test-session',
        'client-disconnect',
      ),
    );
    expect(session.startSSHSession).not.toHaveBeenCalled();
  });
});
