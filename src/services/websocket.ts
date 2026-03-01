/**
 * WebSocket処理サービス
 * WebSocket接続のハンドリングとセッションタイムアウト管理
 */

import WebSocket, { WebSocketServer } from 'ws';

import { ClientMessage } from '../types/index.js';
import { AUTH_TOKEN, SESSION_TIMEOUT, MAX_SESSION_LIFETIME } from '../config.js';
import { authorizeToken } from '../middleware/auth.js';
import { sessions, startSession, startSSHSession, stopSession } from './session.js';
import { send } from '../utils/ws.js';
import { resizeSSHChannel } from './ssh.js';
import logger from './logger.js';

/** タイムアウト警告を送信するまでの残り時間（タイムアウトの5分前） */
const TIMEOUT_WARNING_BEFORE_MS = 5 * 60 * 1000;

/**
 * セッションタイムアウトのタイマー管理
 */
interface SessionTimers {
  /** 入力ベースのタイムアウトタイマー */
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  /** 入力ベースの警告タイマー */
  warningTimer: ReturnType<typeof setTimeout> | null;
  /** 絶対タイムアウトタイマー */
  lifetimeTimer: ReturnType<typeof setTimeout> | null;
  /** 絶対タイムアウト警告タイマー */
  lifetimeWarningTimer: ReturnType<typeof setTimeout> | null;
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
  // 既存の入力ベースタイマーをクリア（絶対タイムアウトは保持）
  const existing = sessionTimers.get(sessionId);
  if (existing) {
    if (existing.timeoutTimer) clearTimeout(existing.timeoutTimer);
    if (existing.warningTimer) clearTimeout(existing.warningTimer);
    existing.timeoutTimer = null;
    existing.warningTimer = null;
  }

  // タイムアウトが無効（0以下）の場合はタイマーを設定しない
  if (SESSION_TIMEOUT <= 0) return;

  const timers: SessionTimers = existing || {
    timeoutTimer: null,
    warningTimer: null,
    lifetimeTimer: null,
    lifetimeWarningTimer: null,
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
 * セッションのタイマーをすべてクリア
 * @param sessionId セッションID
 */
function clearSessionTimers(sessionId: string): void {
  const timers = sessionTimers.get(sessionId);
  if (timers) {
    if (timers.timeoutTimer) clearTimeout(timers.timeoutTimer);
    if (timers.warningTimer) clearTimeout(timers.warningTimer);
    if (timers.lifetimeTimer) clearTimeout(timers.lifetimeTimer);
    if (timers.lifetimeWarningTimer) clearTimeout(timers.lifetimeWarningTimer);
    sessionTimers.delete(sessionId);
  }
}

/**
 * セッションの絶対タイムアウトタイマーを設定
 * セッション開始時に一度だけ呼び出され、リセットされない
 * @param sessionId セッションID
 * @param ws WebSocket接続
 */
function setLifetimeTimeout(sessionId: string, ws: WebSocket): void {
  // 絶対タイムアウトが無効（0以下）の場合はタイマーを設定しない
  if (MAX_SESSION_LIFETIME <= 0) return;

  const timers = sessionTimers.get(sessionId);
  if (!timers) return;

  // 絶対タイムアウト警告（5分前に警告）
  const lifetimeWarningMs = MAX_SESSION_LIFETIME - TIMEOUT_WARNING_BEFORE_MS;
  if (lifetimeWarningMs > 0) {
    timers.lifetimeWarningTimer = setTimeout(() => {
      const remainingSec = Math.floor(TIMEOUT_WARNING_BEFORE_MS / 1000);
      send(ws, {
        type: 'data',
        data: `\r\n⚠ セッション絶対タイムアウト警告: ${remainingSec}秒後にセッションが自動切断されます。\r\n`,
      });
    }, lifetimeWarningMs);
  }

  // 絶対タイムアウトタイマー
  timers.lifetimeTimer = setTimeout(() => {
    send(ws, {
      type: 'data',
      data: '\r\n⚠ セッション絶対タイムアウト: 最大セッション時間に達したためセッションを切断します。\r\n',
    });
    stopSession(sessionId, 'session-lifetime-timeout');
    clearSessionTimers(sessionId);
  }, MAX_SESSION_LIFETIME);
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
    } catch (error) {
      logger.debug({ err: error }, 'WebSocketメッセージのJSONパースに失敗しました');
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
          // セッション開始時に絶対タイムアウトタイマーを開始
          setLifetimeTimeout(session.id, ws);
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
      // 入力があるたびにタイムアウトをリセット（絶対タイムアウトはリセットしない）
      resetSessionTimeout(activeSessionId, ws);
    } else if (payload.type === 'resize') {
      const cols = Number(payload.cols);
      const rows = Number(payload.rows);
      if (Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && cols <= 500 && rows > 0 && rows <= 500) {
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
    } else {
      logger.warn({ type: (payload as { type: string }).type }, '未知のメッセージタイプを受信しました');
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
  wss.on('connection', (ws: WebSocket) => {
    // AUTH_TOKEN未設定時は認証不要
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
