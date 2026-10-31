/**
 * OutputBuffer（出力バッファリング）のテスト
 * WebSocket出力のバッファリングとフラッシュ動作を検証
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';

import { OutputBuffer } from '../../src/utils/ws.js';

// send関数をスパイするためのモック用WebSocket
function createMockWs(): WebSocket {
  const ws = {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    OPEN: WebSocket.OPEN,
  } as unknown as WebSocket;
  return ws;
}

describe('OutputBuffer', () => {
  let buffer: OutputBuffer;
  let ws: WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    buffer = new OutputBuffer();
    ws = createMockWs();
  });

  afterEach(() => {
    buffer.destroyAll();
    vi.useRealTimers();
  });

  // ============================================================
  // バッファリング動作
  // ============================================================

  describe('バッファリング動作', () => {
    it('writeしただけではWebSocketに送信されないこと', () => {
      buffer.write('session-1', 'hello', ws);

      expect(ws.send).not.toHaveBeenCalled();
    });

    it('16ms後にバッファがフラッシュされること', () => {
      buffer.write('session-1', 'hello', ws);
      buffer.write('session-1', ' world', ws);

      // まだ送信されていない
      expect(ws.send).not.toHaveBeenCalled();

      // 16ms経過
      vi.advanceTimersByTime(16);

      // 結合されたデータが送信される
      expect(ws.send).toHaveBeenCalledTimes(1);
      const callArgs = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const parsed = JSON.parse(callArgs);
      expect(parsed).toEqual({ type: 'data', data: 'hello world' });
    });

    it('4KB以上のデータで即座にフラッシュされること', () => {
      const largeData = 'x'.repeat(4096);
      buffer.write('session-1', largeData, ws);

      // 即座に送信される
      expect((ws.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
      const callArgs = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const parsed = JSON.parse(callArgs);
      expect(parsed.type).toBe('data');
      expect(parsed.data).toBe(largeData);
    });

    it('4KB未満の蓄積が4KBを超えたときに即座にフラッシュされること', () => {
      // 3KBを書き込み
      buffer.write('session-1', 'a'.repeat(3000), ws);
      expect((ws.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);

      // さらに2KB追加 → 合計5KBで閾値超過
      buffer.write('session-1', 'b'.repeat(2000), ws);
      expect((ws.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);

      const callArgs = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const parsed = JSON.parse(callArgs);
      expect(parsed.data).toBe('a'.repeat(3000) + 'b'.repeat(2000));
    });
  });

  // ============================================================
  // フラッシュ動作
  // ============================================================

  describe('flush', () => {
    it('手動フラッシュでバッファ内容が送信されること', () => {
      buffer.write('session-1', 'data1', ws);
      buffer.write('session-1', 'data2', ws);

      buffer.flush('session-1');

      expect((ws.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
      const callArgs = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const parsed = JSON.parse(callArgs);
      expect(parsed).toEqual({ type: 'data', data: 'data1data2' });
    });

    it('空バッファのフラッシュはWebSocketに送信しないこと', () => {
      buffer.flush('session-1');
      expect((ws.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    });

    it('フラッシュ後のバッファは空になっていること', () => {
      buffer.write('session-1', 'data', ws);
      buffer.flush('session-1');

      // 再フラッシュしても何も送信されない
      buffer.flush('session-1');
      expect((ws.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    });
  });

  // ============================================================
  // クリーンアップ
  // ============================================================

  describe('destroy', () => {
    it('destroyでバッファがフラッシュされてクリーンアップされること', () => {
      buffer.write('session-1', 'remaining-data', ws);

      buffer.destroy('session-1');

      // フラッシュされている
      expect((ws.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
      const callArgs = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const parsed = JSON.parse(callArgs);
      expect(parsed.data).toBe('remaining-data');

      // 再度writeしてもタイマー後に正常に動作する（新しいエントリが作成される）
      buffer.write('session-1', 'new-data', ws);
      vi.advanceTimersByTime(16);
      expect((ws.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    });

    it('destroy後にタイマーが発火しないこと', () => {
      buffer.write('session-1', 'data', ws);

      // destroy（フラッシュされる）
      buffer.destroy('session-1');

      // タイマーが進んでも追加送信はない
      vi.advanceTimersByTime(100);
      expect((ws.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    });
  });

  describe('destroyAll', () => {
    it('全セッションのバッファがフラッシュされてクリーンアップされること', () => {
      const ws2 = createMockWs();
      buffer.write('session-1', 'data1', ws);
      buffer.write('session-2', 'data2', ws2);

      buffer.destroyAll();

      // 両方フラッシュされている
      expect((ws.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
      expect((ws2.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);

      // タイマーが進んでも追加送信はない
      vi.advanceTimersByTime(100);
      expect((ws.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
      expect((ws2.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    });
  });

  // ============================================================
  // セッション分離
  // ============================================================

  describe('セッション分離', () => {
    it('異なるセッションのバッファが混ざらないこと', () => {
      const ws2 = createMockWs();
      buffer.write('session-1', 'aaa', ws);
      buffer.write('session-2', 'bbb', ws2);

      buffer.flush('session-1');
      buffer.flush('session-2');

      const args1 = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const args2 = (ws2.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(JSON.parse(args1).data).toBe('aaa');
      expect(JSON.parse(args2).data).toBe('bbb');
    });
  });

  // ============================================================
  // WebSocket接続状態
  // ============================================================

  describe('WebSocket接続状態', () => {
    it('WebSocketが閉じている場合はフラッシュ時に送信されないこと', () => {
      buffer.write('session-1', 'data', ws);

      // WebSocketをCLOSED状態にする
      (ws as unknown as { readyState: number }).readyState = WebSocket.CLOSED;

      buffer.flush('session-1');

      // send関数内でreadyStateチェックにより送信されない
      expect((ws.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    });
  });
});
