import { EventEmitter } from 'node:events';
import type http from 'node:http';
import type { WebSocketServer } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  sessions: new Map(),
  send: vi.fn(),
  startSession: vi.fn(),
  startSSHSession: vi.fn(),
  stopSession: vi.fn(),
}));
vi.mock('../../src/config.js', () => ({ AUTH_TOKEN: 'lifecycle-test-token', SESSION_TIMEOUT: 0 }));
vi.mock('../../src/services/session.js', () => session);
vi.mock('../../src/services/ssh.js', () => ({ resizeSSHChannel: vi.fn() }));
import { setupWebSocketHandlers } from '../../src/services/websocket.js';

afterEach(() => vi.resetAllMocks());

function setup(mode = 'shell') {
  let resolve!: (value: { id: string; mode: string }) => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<{ id: string; mode: string }>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  session.startSession.mockReturnValue(pending);
  session.startSSHSession.mockReturnValue(pending);
  const wss = new EventEmitter();
  const ws = Object.assign(new EventEmitter(), { close: vi.fn() });
  setupWebSocketHandlers(wss as WebSocketServer);
  wss.emit('connection', ws, { url: '/ws?token=lifecycle-test-token' } as http.IncomingMessage);
  const start = () => ws.emit('message', JSON.stringify({ type: 'start', mode }));
  return { ws, start, resolve, reject };
}

describe('asynchronous session lifecycle', () => {
  it.each(['shell', 'ssh'])(
    'rejects duplicate %s starts while startup is pending',
    async (mode) => {
      const { start, resolve } = setup(mode);
      start();
      start();
      expect(mode === 'ssh' ? session.startSSHSession : session.startSession).toHaveBeenCalledTimes(
        1,
      );
      expect(session.send).toHaveBeenCalledWith(expect.anything(), {
        type: 'error',
        message: 'session-already-running',
      });
      resolve({ id: 'session-one', mode });
      await Promise.resolve();
      expect(session.send).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: 'started', sessionId: 'session-one' }),
      );
    },
  );

  it('disposes a late session after disconnect and sends no success', async () => {
    const { ws, start, resolve } = setup();
    start();
    ws.emit('close');
    resolve({ id: 'late-session', mode: 'shell' });
    await Promise.resolve();
    expect(session.stopSession).toHaveBeenCalledExactlyOnceWith(
      'late-session',
      'client-disconnect',
    );
    expect(session.send).not.toHaveBeenCalled();
    start();
    expect(session.startSession).toHaveBeenCalledTimes(1);
  });

  it('honors stop during pending startup and allows a subsequent retry', async () => {
    const { ws, start, resolve } = setup();
    start();
    ws.emit('message', JSON.stringify({ type: 'stop' }));
    resolve({ id: 'cancelled-session', mode: 'shell' });
    await Promise.resolve();
    expect(session.stopSession).toHaveBeenCalledExactlyOnceWith('cancelled-session', 'client-stop');
    expect(session.send).not.toHaveBeenCalled();
    session.startSession.mockResolvedValueOnce({ id: 'retry-session', mode: 'shell' });
    start();
    await Promise.resolve();
    expect(session.startSession).toHaveBeenCalledTimes(2);
    expect(session.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'started', sessionId: 'retry-session' }),
    );
  });

  it('unlocks retry after a rejected startup', async () => {
    const { start, reject } = setup();
    start();
    reject(new Error('test startup failure'));
    await Promise.resolve();
    expect(session.send).toHaveBeenCalledWith(expect.anything(), {
      type: 'error',
      message: 'test startup failure',
    });
    session.startSession.mockResolvedValueOnce({ id: 'retry-session', mode: 'shell' });
    start();
    await Promise.resolve();
    expect(session.startSession).toHaveBeenCalledTimes(2);
  });
});
