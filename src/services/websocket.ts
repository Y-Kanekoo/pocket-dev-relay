/**
 * WebSocket処理サービス
 * WebSocket接続のハンドリングとセッションタイムアウト管理
 */

import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';

import { ClientMessage } from '../types/index.js';
import { AUTH_TOKEN, SESSION_TIMEOUT } from '../config.js';
import { authorizeWebSocket, authorizeToken } from '../middleware/auth.js';
import { sessions, send, startSession, startSSHSession, stopSession } from './session.js';
import { resizeSSHChannel } from './ssh.js';
import logger from './logger.js';

/** タイムアウト警告を送信するまでの残り時間（タイムアウトの5分前） */
const TIMEOUT_WARNING_BEFORE_MS = 5 * 60 * 1000;

/**
 * セッションタイムアウトのタイマー管理
 */
interface SessionTimers {
  /** タイムアウトタイマー */
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  /** 警告タイマー */
  warningTimer: ReturnType<typeof setTimeout> | null;
}

/** セッションごとのタイマーマップ */
const sessionTimers = new Map<string, SessionTimers>();

/**
 * セッションのタイムアウトタイマーをリセット
 * 入力があるたびに呼び出してタイマーをリスタート
 * @param sessionId セッションID
 * @param ws WebSocket接続
 */
function resetSessionTimeout(sessionId: string, ws: WebSocket): void {
  // 既存のタイマーをクリア
  clearSessionTimers(sessionId);

  // タイムアウトが無効（0以下）の場合はタイマーを設定しない
  if (SESSION_TIMEOUT <= 0) return;

  const timers: SessionTimers = {
    timeoutTimer: null,
    warningTimer: null,
  };

  // 警告タイマー（タイムアウトの5分前に警告）
  const warningMs = SESSION_TIMEOUT - TIMEOUT_WARNING_BEFORE_MS;
  if (warningMs > 0) {
    timers.warningTimer = setTimeout(() => {
      const remainingSec = Math.floor(TIMEOUT_WARNING_BEFORE_MS / 1000);
      send(ws, {
        type: 'data',
        data: `\r\n⚠ セッションタイムアウト警告: ${remainingSec}秒後に入力がない場合、セッションが自動切断されます。\r\n`,
      });
    }, warningMs);
  }

  // タイムアウトタイマー
  timers.timeoutTimer = setTimeout(() => {
    send(ws, {
      type: 'data',
      data: '\r\n⚠ セッションタイムアウト: 入力がないためセッションを切断します。\r\n',
    });
    stopSession(sessionId, 'session-timeout');
    clearSessionTimers(sessionId);
  }, SESSION_TIMEOUT);

  sessionTimers.set(sessionId, timers);
}

/**
 * セッションのタイマーをクリア
 * @param sessionId セッションID
 */
function clearSessionTimers(sessionId: string): void {
  const timers = sessionTimers.get(sessionId);
  if (timers) {
    if (timers.timeoutTimer) clearTimeout(timers.timeoutTimer);
    if (timers.warningTimer) clearTimeout(timers.warningTimer);
    sessionTimers.delete(sessionId);
  }
}

/** WebSocket認証タイムアウト（5秒） */
const WS_AUTH_TIMEOUT = 5000;

/**
 * 認証済みWebSocket接続のメッセージハンドリングを設定
 * @param ws WebSocket接続
 */
function handleAuthenticated(ws: WebSocket): void {
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
          let session;
          if (payload.mode === 'ssh') {
            // SSHモード: ssh2ライブラリで接続
            session = await startSSHSession(
              {
                mode: 'ssh',
                sshConfig: payload.sshConfig,
              },
              ws,
            );
          } else {
            // 通常モード: PTYで起動
            session = await startSession(
              {
                mode: payload.mode,
                cwd: payload.cwd,
                customCommand: payload.command,
              },
              ws,
            );
          }
          activeSessionId = session.id;
          send(ws, {
            type: 'started',
            sessionId: session.id,
            mode: session.mode,
            cwd: session.cwd,
            label: session.label,
          });
          // セッション開始時にタイムアウトタイマーを開始
          resetSessionTimeout(session.id, ws);
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
      // SSHモードとPTYモードで書き込み先を切り替え
      if (session.sshChannel) {
        session.sshChannel.write(payload.data);
      } else if (session.pty) {
        session.pty.write(payload.data);
      }
      // 入力があるたびにタイムアウトをリセット
      resetSessionTimeout(activeSessionId, ws);
    } else if (payload.type === 'resize') {
      const cols = Number(payload.cols);
      const rows = Number(payload.rows);
      if (Number.isInteger(cols) && Number.isInteger(rows)) {
        // SSHモードとPTYモードでリサイズ処理を切り替え
        if (session.sshChannel) {
          resizeSSHChannel(session.sshChannel, cols, rows);
        } else if (session.pty) {
          session.pty.resize(cols, rows);
        }
      }
    } else if (payload.type === 'stop') {
      clearSessionTimers(activeSessionId);
      stopSession(activeSessionId, 'client-stop');
      activeSessionId = null;
    }
  });

  ws.on('close', () => {
    if (activeSessionId) {
      clearSessionTimers(activeSessionId);
      stopSession(activeSessionId, 'client-disconnect');
    }
  });
}

/**
 * WebSocketサーバーの接続ハンドラを設定
 * @param wss WebSocketサーバー
 */
export function setupWebSocketHandlers(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    // 後方互換: URLクエリパラメータで認証
    if (authorizeWebSocket(req)) {
      handleAuthenticated(ws);
      return;
    }

    // 防御的チェック: authorizeWebSocketの挙動が変更された場合の安全弁
    if (!AUTH_TOKEN) {
      handleAuthenticated(ws);
      return;
    }

    // メッセージベース認証待ち（5秒タイムアウト）
    logger.debug('WebSocketメッセージベース認証を待機中');
    const authTimeout = setTimeout(() => {
      send(ws, { type: 'auth_result', ok: false, message: '認証タイムアウト' });
      ws.close(4001, 'auth-timeout');
    }, WS_AUTH_TIMEOUT);

    ws.once('message', (data: Buffer | string) => {
      clearTimeout(authTimeout);
      try {
        const msg = JSON.parse(data.toString()) as { type?: string; token?: string };
        if (msg.type === 'auth' && typeof msg.token === 'string' && authorizeToken(msg.token)) {
          logger.debug('WebSocketメッセージベース認証に成功');
          send(ws, { type: 'auth_result', ok: true });
          handleAuthenticated(ws);
        } else {
          logger.warn('WebSocketメッセージベース認証に失敗');
          send(ws, { type: 'auth_result', ok: false, message: '認証に失敗しました' });
          ws.close(4001, 'unauthorized');
        }
      } catch {
        ws.close(4001, 'invalid-message');
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
    });
  });
}
