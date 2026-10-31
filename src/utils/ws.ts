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

// ============================================================
// 出力バッファリング
// ============================================================

/** バッファのフラッシュ間隔（≒60fps） */
const FLUSH_INTERVAL_MS = 16;

/** バッファサイズの閾値（4KB超過で即座にフラッシュ） */
const FLUSH_SIZE_THRESHOLD = 4 * 1024;

/** セッションごとのバッファ状態 */
interface BufferEntry {
  /** 蓄積中のデータチャンク */
  chunks: string[];
  /** 蓄積中のデータサイズ（バイト数概算） */
  size: number;
  /** フラッシュ用タイマー */
  timer: ReturnType<typeof setTimeout> | null;
  /** 送信先WebSocket */
  ws: WebSocket;
}

/**
 * WebSocket出力バッファ
 *
 * PTY/SSHからの小さなチャンク出力を一定間隔でまとめて送信し、
 * JSONシリアライズ・フレーム化・ネットワーク送信のオーバーヘッドを削減する。
 *
 * - 16ms間隔（≒60fps）でフラッシュ
 * - 4KB超過時は即座にフラッシュ
 * - 対話的操作のレスポンスを損なわない設計
 */
export class OutputBuffer {
  /** セッションIDごとのバッファ */
  private buffers = new Map<string, BufferEntry>();

  /**
   * データをバッファに追加
   * バッファサイズが閾値を超えた場合は即座にフラッシュする
   * @param sessionId セッションID
   * @param data 出力データ
   * @param ws 送信先WebSocket
   */
  write(sessionId: string, data: string, ws: WebSocket): void {
    let entry = this.buffers.get(sessionId);
    if (!entry) {
      entry = { chunks: [], size: 0, timer: null, ws };
      this.buffers.set(sessionId, entry);
    }

    // WebSocket参照を最新に保つ
    entry.ws = ws;
    entry.chunks.push(data);
    entry.size += data.length;

    // サイズ閾値を超えた場合は即座にフラッシュ
    if (entry.size >= FLUSH_SIZE_THRESHOLD) {
      this.flush(sessionId);
      return;
    }

    // タイマーが未設定の場合のみ新規タイマーを設定
    if (!entry.timer) {
      entry.timer = setTimeout(() => {
        this.flush(sessionId);
      }, FLUSH_INTERVAL_MS);
    }
  }

  /**
   * 指定セッションのバッファを即座にフラッシュ（送信）
   * @param sessionId セッションID
   */
  flush(sessionId: string): void {
    const entry = this.buffers.get(sessionId);
    if (!entry || entry.chunks.length === 0) {
      // タイマーだけ残っている場合はクリア
      if (entry?.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
      }
      return;
    }

    // タイマーをクリア
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }

    // バッファ内容を結合して一括送信
    const combined = entry.chunks.join('');
    entry.chunks = [];
    entry.size = 0;

    send(entry.ws, { type: 'data', data: combined });
  }

  /**
   * 指定セッションのバッファをフラッシュしてクリーンアップ
   * セッション終了・接続切断時に呼び出す
   * @param sessionId セッションID
   */
  destroy(sessionId: string): void {
    this.flush(sessionId);
    const entry = this.buffers.get(sessionId);
    if (entry?.timer) {
      clearTimeout(entry.timer);
    }
    this.buffers.delete(sessionId);
  }

  /**
   * 全バッファをフラッシュしてクリーンアップ
   * サーバーシャットダウン時に呼び出す
   */
  destroyAll(): void {
    for (const sessionId of this.buffers.keys()) {
      this.destroy(sessionId);
    }
  }
}

/** グローバルな出力バッファインスタンス */
export const outputBuffer = new OutputBuffer();
