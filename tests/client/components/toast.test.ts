/**
 * toast.ts のテスト
 * トースト通知コンポーネントの初期化・表示ロジックをテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// DOM モック設定
// ============================================================

// createElement で生成される要素のモック
function createMockElement() {
  return {
    className: '',
    textContent: '',
    classList: {
      add: vi.fn(),
    },
    append: vi.fn(),
    appendChild: vi.fn(),
    remove: vi.fn(),
    setAttribute: vi.fn(),
  };
}

// document.createElement のモック
const mockCreateElement = vi.fn(() => createMockElement());
vi.stubGlobal('document', {
  createElement: mockCreateElement,
});

// console.warn のモック
vi.stubGlobal('console', {
  ...console,
  warn: vi.fn(),
});

// ============================================================
// テスト
// ============================================================

import { initToast, showToast } from '../../../src/client/components/toast.js';

describe('トースト通知コンポーネント', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // コンテナをリセット
    initToast(null);
  });

  // ============================================================
  // initToast のテスト
  // ============================================================

  describe('initToast', () => {
    it('nullで初期化するとコンテナが未設定になる', () => {
      initToast(null);
      const result = showToast('テスト');
      expect(result).toBeNull();
    });

    it('コンテナ要素を設定できる', () => {
      const container = createMockElement();
      initToast(container as unknown as HTMLElement);

      // showToast が正常に動作することでコンテナ設定を確認
      const result = showToast('テスト');
      expect(result).not.toBeNull();
    });
  });

  // ============================================================
  // showToast のテスト
  // ============================================================

  describe('showToast', () => {
    let container: ReturnType<typeof createMockElement>;

    beforeEach(() => {
      container = createMockElement();
      initToast(container as unknown as HTMLElement);
    });

    it('コンテナ未設定の場合はnullを返し、警告を出す', () => {
      initToast(null);
      const result = showToast('メッセージ');
      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith('トーストコンテナが初期化されていません');
    });

    it('infoタイプのトーストを作成する', () => {
      showToast('情報メッセージ', 'info');
      // createElementが呼ばれたことを確認（toast div + icon span + message span = 3回）
      expect(mockCreateElement).toHaveBeenCalledTimes(3);
    });

    it('各タイプのトーストにそれぞれのクラス名を設定する', () => {
      const types = ['success', 'error', 'warning', 'info'] as const;

      for (const type of types) {
        vi.clearAllMocks();
        // createElementの返り値を個別に設定
        const toastEl = createMockElement();
        const iconEl = createMockElement();
        const messageEl = createMockElement();
        mockCreateElement
          .mockReturnValueOnce(toastEl)
          .mockReturnValueOnce(iconEl)
          .mockReturnValueOnce(messageEl);

        showToast('テスト', type);
        expect(toastEl.className).toBe(`toast toast-${type}`);
      }
    });

    it('アイコンとメッセージのspan要素を作成する', () => {
      const toastEl = createMockElement();
      const iconEl = createMockElement();
      const messageEl = createMockElement();
      mockCreateElement
        .mockReturnValueOnce(toastEl)
        .mockReturnValueOnce(iconEl)
        .mockReturnValueOnce(messageEl);

      showToast('テストメッセージ', 'success');

      expect(iconEl.className).toBe('toast-icon');
      expect(iconEl.textContent).toBe('\u2713'); // 成功のチェックマーク
      expect(messageEl.className).toBe('toast-message');
      expect(messageEl.textContent).toBe('テストメッセージ');
    });

    it('エラーのアイコンは X マーク', () => {
      const toastEl = createMockElement();
      const iconEl = createMockElement();
      const messageEl = createMockElement();
      mockCreateElement
        .mockReturnValueOnce(toastEl)
        .mockReturnValueOnce(iconEl)
        .mockReturnValueOnce(messageEl);

      showToast('エラー', 'error');
      expect(iconEl.textContent).toBe('\u2715');
    });

    it('警告のアイコンは ! マーク', () => {
      const toastEl = createMockElement();
      const iconEl = createMockElement();
      const messageEl = createMockElement();
      mockCreateElement
        .mockReturnValueOnce(toastEl)
        .mockReturnValueOnce(iconEl)
        .mockReturnValueOnce(messageEl);

      showToast('警告', 'warning');
      expect(iconEl.textContent).toBe('!');
    });

    it('情報のアイコンは i マーク', () => {
      const toastEl = createMockElement();
      const iconEl = createMockElement();
      const messageEl = createMockElement();
      mockCreateElement
        .mockReturnValueOnce(toastEl)
        .mockReturnValueOnce(iconEl)
        .mockReturnValueOnce(messageEl);

      showToast('情報', 'info');
      expect(iconEl.textContent).toBe('i');
    });

    it('トーストをコンテナに追加する', () => {
      const toastEl = createMockElement();
      mockCreateElement
        .mockReturnValueOnce(toastEl)
        .mockReturnValueOnce(createMockElement())
        .mockReturnValueOnce(createMockElement());

      showToast('テスト');
      expect(container.appendChild).toHaveBeenCalledWith(toastEl);
    });

    it('デフォルトタイプはinfo', () => {
      const toastEl = createMockElement();
      mockCreateElement
        .mockReturnValueOnce(toastEl)
        .mockReturnValueOnce(createMockElement())
        .mockReturnValueOnce(createMockElement());

      showToast('テスト');
      expect(toastEl.className).toBe('toast toast-info');
    });

    it('指定時間後にフェードアウトクラスを追加する', () => {
      const toastEl = createMockElement();
      mockCreateElement
        .mockReturnValueOnce(toastEl)
        .mockReturnValueOnce(createMockElement())
        .mockReturnValueOnce(createMockElement());

      showToast('テスト', 'info', 3000);

      // 3000ms 後にフェードアウト開始
      vi.advanceTimersByTime(3000);
      expect(toastEl.classList.add).toHaveBeenCalledWith('toast-out');

      // さらに300ms 後に要素を削除
      vi.advanceTimersByTime(300);
      expect(toastEl.remove).toHaveBeenCalled();
    });

    it('カスタムdurationを設定できる', () => {
      const toastEl = createMockElement();
      mockCreateElement
        .mockReturnValueOnce(toastEl)
        .mockReturnValueOnce(createMockElement())
        .mockReturnValueOnce(createMockElement());

      showToast('テスト', 'info', 5000);

      // 3000ms ではまだフェードアウトしない
      vi.advanceTimersByTime(3000);
      expect(toastEl.classList.add).not.toHaveBeenCalled();

      // 5000ms 後にフェードアウト開始
      vi.advanceTimersByTime(2000);
      expect(toastEl.classList.add).toHaveBeenCalledWith('toast-out');
    });

    it('作成されたトースト要素を返す', () => {
      const toastEl = createMockElement();
      mockCreateElement
        .mockReturnValueOnce(toastEl)
        .mockReturnValueOnce(createMockElement())
        .mockReturnValueOnce(createMockElement());

      const result = showToast('テスト');
      expect(result).toBe(toastEl);
    });
  });
});
