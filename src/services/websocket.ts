/**
 * WebSocket処理サービス
 * WebSocket接続のハンドリングとセッションタイムアウト管理
 */

import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';

import { ClientMessage } from '../types/index.js';
import { SESSION_TIMEOUT, MAX_SESSION_LIFETIME } from '../config.js';
import { authorizeToken, authorizeWebSocket } from '../middleware/auth.js';
import { sessions, send, startSession, startSSHSession, stopSession } from './session.js';
import { resizeSSHChannel } from './ssh.js';

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

/** タイマークリーンアップの実行間隔（1分） */
const TIMER_CLEANUP_INTERVAL_MS = 60 * 1000;

/** タイマークリーンアップのインターバルID */
let timerCleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * sessionTimersの孤立エントリを定期クリーンアップ開始
 * sessionsに存在しないセッションIDのタイマーを検出して削除する
 */
export function startTimerCleanup(): void {
  // 既にクリーンアップが動作中なら何もしない
  if (timerCleanupInterval) return;

  timerCleanupInterval = setInterval(() => {
    sessionTimers.forEach((timers, sessionId) => {
      if (!sessions.has(sessionId)) {
        // 孤立エントリを検出: タイマーをクリアして削除
        if (timers.timeoutTimer) clearTimeout(timers.timeoutTimer);
        if (timers.warningTimer) clearTimeout(timers.warningTimer);
        if (timers.lifetimeTimer) clearTimeout(timers.lifetimeTimer);
        if (timers.lifetimeWarningTimer) clearTimeout(timers.lifetimeWarningTimer);
        sessionTimers.delete(sessionId);
      }
    });
  }, TIMER_CLEANUP_INTERVAL_MS);

  // unref() でプロセス終了を妨げないようにする
  timerCleanupInterval.unref();
}

/**
 * sessionTimersの定期クリーンアップを停止
 */
export function stopTimerCleanup(): void {
  if (timerCleanupInterval) {
    clearInterval(timerCleanupInterval);
    timerCleanupInterval = null;
  }
}

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

  const timers: SessionTimers = sessionTimers.get(sessionId) || {
    timeoutTimer: null,
    warningTimer: null,
    lifetimeTimer: null,
    lifetimeWarningTimer: null,
  };
  sessionTimers.set(sessionId, timers);

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

export function setupWebSocketHandlers(wss: WebSocketServer): void {
  startTimerCleanup();

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    if (!authorizeWebSocket(req)) {
      ws.close(4001, 'unauthorized');
      return;
    }

    let activeSessionId: string | null = null;
    let starting = false;
    let closed = false;
    let stopRequested = false;

    ws.on('message', (message: Buffer | string) => {
      if (closed) return;
      let payload: ClientMessage;
      try {
        payload = JSON.parse(message.toString()) as ClientMessage;
      } catch {
        return;
      }
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'auth') {
        if (typeof payload.token === 'string' && authorizeToken(payload.token)) {
          send(ws, { type: 'auth_result', ok: true });
        } else {
          send(ws, { type: 'auth_result', ok: false, message: '認証に失敗しました' });
          ws.close(4001, 'unauthorized');
        }
        return;
      }

      if (payload.type === 'start') {
        if (activeSessionId || starting) {
          send(ws, { type: 'error', message: 'session-already-running' });
          return;
        }

        starting = true;
        stopRequested = false;
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
            if (closed || stopRequested) {
              stopSession(session.id, closed ? 'client-disconnect' : 'client-stop');
              return;
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
            setLifetimeTimeout(session.id, ws);
          } catch (error) {
            const err = error as Error;
            if (!closed) send(ws, { type: 'error', message: err.message || 'failed-to-start' });
          } finally {
            starting = false;
          }
        })();
        return;
      }

      if (payload.type === 'stop' && starting) {
        stopRequested = true;
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
        if (
          Number.isInteger(cols) &&
          Number.isInteger(rows) &&
          cols > 0 &&
          cols <= 500 &&
          rows > 0 &&
          rows <= 500
        ) {
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
      closed = true;
      if (activeSessionId) {
        clearSessionTimers(activeSessionId);
        stopSession(activeSessionId, 'client-disconnect');
      }
    });
  });
}
