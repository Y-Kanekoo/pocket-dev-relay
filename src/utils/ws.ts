/**
 * WebSocket送信ユーティリティ
 * 循環依存を避けるため、session.tsとnotifier.tsから独立
 */

import WebSocket from 'ws';
import { ServerMessage } from '../types/index.js';

/**
 * WebSocketにメッセージを送信
 * @param ws WebSocket
 * @param payload 送信するメッセージ
 */
export function send(ws: WebSocket, payload: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}
