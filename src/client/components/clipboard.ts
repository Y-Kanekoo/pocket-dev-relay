/**
 * クリップボード共有コンポーネント
 * PC⇔スマホ間でテキストを転送する機能
 */

import type { ClipboardResponse } from '../../types/index.js';
import { authHeaders } from '../services/api.js';
import { showToast } from './toast.js';

// ==================================================
// DOM要素の参照
// ==================================================

interface ClipboardElements {
  clipboardBtn: HTMLButtonElement | null;
  clipboardModal: HTMLElement | null;
  clipboardClose: HTMLButtonElement | null;
  clipboardText: HTMLTextAreaElement | null;
  clipboardSend: HTMLButtonElement | null;
  clipboardPaste: HTMLButtonElement | null;
  clipboardCopy: HTMLButtonElement | null;
  clipboardClear: HTMLButtonElement | null;
  clipboardStatus: HTMLElement | null;
}

let elements: ClipboardElements = {
  clipboardBtn: null,
  clipboardModal: null,
  clipboardClose: null,
  clipboardText: null,
  clipboardSend: null,
  clipboardPaste: null,
  clipboardCopy: null,
  clipboardClear: null,
  clipboardStatus: null,
};

// ==================================================
// API呼び出し
// ==================================================

/**
 * サーバーのクリップボードを取得
 */
async function fetchClipboard(): Promise<ClipboardResponse> {
  const res = await fetch('/api/clipboard', {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error('クリップボードの取得に失敗しました');
  }
  return await res.json();
}

/**
 * サーバーのクリップボードにテキストを設定
 */
async function setClipboard(text: string): Promise<ClipboardResponse> {
  const res = await fetch('/api/clipboard', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error('クリップボードの設定に失敗しました');
  }
  return await res.json();
}

/**
 * サーバーのクリップボードをクリア
 */
async function clearClipboard(): Promise<void> {
  const res = await fetch('/api/clipboard', {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error('クリップボードのクリアに失敗しました');
  }
}

// ==================================================
// UI操作
// ==================================================

/**
 * モーダルを表示
 */
function showModal(): void {
  elements.clipboardModal?.classList.remove('hidden');
  // サーバーのクリップボードを取得して表示
  loadClipboard();
}

/**
 * モーダルを非表示
 */
function hideModal(): void {
  elements.clipboardModal?.classList.add('hidden');
}

/**
 * サーバーのクリップボードを読み込み
 */
async function loadClipboard(): Promise<void> {
  try {
    const data = await fetchClipboard();
    if (elements.clipboardText && data.text) {
      elements.clipboardText.value = data.text;
    }
    if (elements.clipboardStatus && data.updatedAt) {
      const date = new Date(data.updatedAt);
      elements.clipboardStatus.textContent = `最終更新: ${date.toLocaleString('ja-JP')}`;
    } else if (elements.clipboardStatus) {
      elements.clipboardStatus.textContent = 'クリップボードは空です';
    }
  } catch {
    if (elements.clipboardStatus) {
      elements.clipboardStatus.textContent = '取得に失敗しました';
    }
  }
}

/**
 * テキストをサーバーに送信
 */
async function sendText(): Promise<void> {
  const text = elements.clipboardText?.value || '';
  if (!text.trim()) {
    showToast('テキストを入力してください', 'warning');
    return;
  }

  try {
    await setClipboard(text);
    showToast('クリップボードに送信しました', 'success');
    loadClipboard();
  } catch {
    showToast('送信に失敗しました', 'error');
  }
}

/**
 * デバイスのクリップボードからペースト
 */
async function pasteFromDevice(): Promise<void> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      const text = await navigator.clipboard.readText();
      if (elements.clipboardText) {
        elements.clipboardText.value = text;
      }
      showToast('デバイスのクリップボードから取得しました', 'success');
    } else {
      showToast('クリップボードAPIが利用できません', 'warning');
    }
  } catch {
    showToast('クリップボードの読み取りが拒否されました', 'error');
  }
}

/**
 * テキストをデバイスのクリップボードにコピー
 */
async function copyToDevice(): Promise<void> {
  const text = elements.clipboardText?.value || '';
  if (!text.trim()) {
    showToast('コピーするテキストがありません', 'warning');
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      showToast('デバイスのクリップボードにコピーしました', 'success');
    } else {
      // フォールバック
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast('デバイスのクリップボードにコピーしました', 'success');
    }
  } catch {
    showToast('コピーに失敗しました', 'error');
  }
}

/**
 * クリップボードをクリア
 */
async function handleClear(): Promise<void> {
  try {
    await clearClipboard();
    if (elements.clipboardText) {
      elements.clipboardText.value = '';
    }
    if (elements.clipboardStatus) {
      elements.clipboardStatus.textContent = 'クリップボードは空です';
    }
    showToast('クリップボードをクリアしました', 'success');
  } catch {
    showToast('クリアに失敗しました', 'error');
  }
}

// ==================================================
// 初期化
// ==================================================

/**
 * クリップボードコンポーネントを初期化
 */
export function initClipboard(elems: ClipboardElements): void {
  elements = elems;

  // モーダル表示ボタン
  elements.clipboardBtn?.addEventListener('click', showModal);

  // モーダル閉じるボタン
  elements.clipboardClose?.addEventListener('click', hideModal);

  // モーダル背景クリックで閉じる
  elements.clipboardModal?.addEventListener('click', (e: Event) => {
    if (e.target === elements.clipboardModal) {
      hideModal();
    }
  });

  // 送信ボタン
  elements.clipboardSend?.addEventListener('click', sendText);

  // ペーストボタン
  elements.clipboardPaste?.addEventListener('click', pasteFromDevice);

  // コピーボタン
  elements.clipboardCopy?.addEventListener('click', copyToDevice);

  // クリアボタン
  elements.clipboardClear?.addEventListener('click', handleClear);
}
