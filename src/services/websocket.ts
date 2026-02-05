/**
 * WebSocket処理サービス
 * WebSocket接続のハンドリング
 */

import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';

import { ClientMessage } from '../types/index.js';
import { authorizeWebSocket } from '../middleware/auth.js';
import {
  sessions,
  send,
  startSession,
  stopSession,
} from './session.js';

/**
 * WebSocketサーバーの接続ハンドラを設定
 * @param wss WebSocketサーバー
 */
export function setupWebSocketHandlers(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    if (!authorizeWebSocket(req)) {
      ws.close(4001, 'unauthorized');
      return;
    }

    let activeSessionId: string | null = null;

    ws.on('message', (message: Buffer | string) => {
      let payload: ClientMessage;
      try {
        payload = JSON.parse(message.toString()) as ClientMessage;
      } catch {
        return;
      }

      if (payload.type === 'start') {
        if (activeSessionId) {
          send(ws, { type: 'error', message: 'session-already-running' });
          return;
        }

        (async () => {
          try {
            const session = await startSession(
              {
                mode: payload.mode,
                cwd: payload.cwd,
                customCommand: payload.command,
              },
              ws
            );
            activeSessionId = session.id;
            send(ws, {
              type: 'started',
              sessionId: session.id,
              mode: session.mode,
              cwd: session.cwd,
              label: session.label,
            });
          } catch (error) {
            const err = error as Error;
            send(ws, { type: 'error', message: err.message || 'failed-to-start' });
          }
        })();
        return;
      }

      if (!activeSessionId) return;

      const session = sessions.get(activeSessionId);
      if (!session) return;

      if (payload.type === 'input' && typeof payload.data === 'string') {
        session.pty.write(payload.data);
      } else if (payload.type === 'resize') {
        const cols = Number(payload.cols);
        const rows = Number(payload.rows);
        if (Number.isInteger(cols) && Number.isInteger(rows)) {
          session.pty.resize(cols, rows);
        }
      } else if (payload.type === 'stop') {
        stopSession(activeSessionId, 'client-stop');
        activeSessionId = null;
      }
    });

    ws.on('close', () => {
      if (activeSessionId) {
        stopSession(activeSessionId, 'client-disconnect');
      }
    });
  });
}
