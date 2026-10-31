/**
 * コマンドスニペットコンポーネント
 * よく使うコマンドをワンタップで実行する機能
 */

import type { Snippet, SnippetExecuteResponse } from '../../types/index.js';
import { authHeaders } from '../services/api.js';
import { showToast } from './toast.js';

// ==================================================
// DOM要素の参照
// ==================================================

interface SnippetElements {
  snippetBtn: HTMLButtonElement | null;
  snippetDrawer: HTMLElement | null;
  snippetClose: HTMLButtonElement | null;
  snippetList: HTMLElement | null;
  snippetLabel: HTMLInputElement | null;
  snippetCommand: HTMLInputElement | null;
  snippetAdd: HTMLButtonElement | null;
  snippetOverlay: HTMLElement | null;
}

let elements: SnippetElements = {
  snippetBtn: null,
  snippetDrawer: null,
  snippetClose: null,
  snippetList: null,
  snippetLabel: null,
  snippetCommand: null,
  snippetAdd: null,
  snippetOverlay: null,
};

// ==================================================
// API呼び出し
// ==================================================

/**
 * スニペット一覧を取得
 */
async function fetchSnippets(): Promise<Snippet[]> {
  const res = await fetch('/api/snippets', {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error('スニペットの取得に失敗しました');
  }
  const data = await res.json();
  return data.snippets || [];
}

/**
 * スニペットを追加
 */
async function addSnippet(label: string, command: string): Promise<Snippet> {
  const res = await fetch('/api/snippets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ label, command }),
  });
  if (!res.ok) {
    throw new Error('スニペットの追加に失敗しました');
  }
  return await res.json();
}

/**
 * スニペットを削除
 */
async function deleteSnippet(id: string): Promise<void> {
  const res = await fetch(`/api/snippets/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error('スニペットの削除に失敗しました');
  }
}

/**
 * スニペットを実行
 */
async function executeSnippet(id: string): Promise<SnippetExecuteResponse> {
  const res = await fetch(`/api/snippets/${id}/execute`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error('スニペットの実行に失敗しました');
  }
  return await res.json();
}

// ==================================================
// UI操作
// ==================================================

/**
 * ドロワーを表示
 */
function showDrawer(): void {
  elements.snippetDrawer?.classList.add('open');
  elements.snippetOverlay?.classList.remove('hidden');
  loadSnippets();
}

/**
 * ドロワーを非表示
 */
function hideDrawer(): void {
  elements.snippetDrawer?.classList.remove('open');
  elements.snippetOverlay?.classList.add('hidden');
}

/**
 * スニペット一覧を読み込んで表示
 */
async function loadSnippets(): Promise<void> {
  if (!elements.snippetList) return;

  try {
    const snippets = await fetchSnippets();
    renderSnippetList(snippets);
  } catch {
    if (elements.snippetList) {
      // XSS対策: DOM APIでdiv要素を作成し、textContentでテキストを設定
      const errorDiv = document.createElement('div');
      errorDiv.className = 'snippet-error';
      errorDiv.textContent = 'スニペットの取得に失敗しました';
      elements.snippetList.replaceChildren(errorDiv);
    }
  }
}

/**
 * スニペット一覧をレンダリング
 */
function renderSnippetList(snippets: Snippet[]): void {
  if (!elements.snippetList) return;

  // XSS対策: クリア目的のinnerHTMLをreplaceChildrenに変更
  elements.snippetList.replaceChildren();

  if (snippets.length === 0) {
    // XSS対策: DOM APIでdiv要素を作成し、textContentでテキストを設定
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'snippet-empty';
    emptyDiv.textContent = 'スニペットがありません';
    elements.snippetList.replaceChildren(emptyDiv);
    return;
  }

  snippets.forEach((snippet) => {
    const item = document.createElement('div');
    item.className = 'snippet-item';

    const info = document.createElement('div');
    info.className = 'snippet-info';

    const label = document.createElement('div');
    label.className = 'snippet-item-label';
    label.textContent = snippet.label;

    const command = document.createElement('div');
    command.className = 'snippet-item-command';
    command.textContent = snippet.command.replace(/\n$/, '');

    info.append(label, command);

    const actions = document.createElement('div');
    actions.className = 'snippet-actions';

    // 実行ボタン
    const execBtn = document.createElement('button');
    execBtn.type = 'button';
    execBtn.className = 'snippet-exec-btn';
    execBtn.textContent = '実行';
    execBtn.addEventListener('click', async () => {
      try {
        const result = await executeSnippet(snippet.id);
        if (result.ok) {
          showToast(result.message, 'success');
        } else {
          showToast(result.message, 'warning');
        }
      } catch {
        showToast('実行に失敗しました', 'error');
      }
    });

    // 削除ボタン
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'snippet-delete-btn';
    deleteBtn.textContent = '削除';
    deleteBtn.addEventListener('click', async () => {
      try {
        await deleteSnippet(snippet.id);
        showToast(`"${snippet.label}" を削除しました`, 'success');
        loadSnippets();
      } catch {
        showToast('削除に失敗しました', 'error');
      }
    });

    actions.append(execBtn, deleteBtn);
    item.append(info, actions);
    elements.snippetList?.appendChild(item);
  });
}

/**
 * スニペットを追加
 */
async function handleAddSnippet(): Promise<void> {
  const label = elements.snippetLabel?.value.trim() || '';
  const command = elements.snippetCommand?.value.trim() || '';

  if (!label) {
    showToast('ラベルを入力してください', 'warning');
    return;
  }
  if (!command) {
    showToast('コマンドを入力してください', 'warning');
    return;
  }

  // コマンドの末尾に改行を追加（実行時にEnter相当）
  const commandWithNewline = command.endsWith('\n') ? command : command + '\n';

  try {
    await addSnippet(label, commandWithNewline);
    showToast(`"${label}" を追加しました`, 'success');

    // フォームをクリア
    if (elements.snippetLabel) elements.snippetLabel.value = '';
    if (elements.snippetCommand) elements.snippetCommand.value = '';

    // 一覧を更新
    loadSnippets();
  } catch {
    showToast('追加に失敗しました', 'error');
  }
}

// ==================================================
// 初期化
// ==================================================

/**
 * スニペットコンポーネントを初期化
 */
export function initSnippets(elems: SnippetElements): void {
  elements = elems;

  // ドロワー表示ボタン
  elements.snippetBtn?.addEventListener('click', showDrawer);

  // ドロワー閉じるボタン
  elements.snippetClose?.addEventListener('click', hideDrawer);

  // オーバーレイクリックで閉じる
  elements.snippetOverlay?.addEventListener('click', hideDrawer);

  // 追加ボタン
  elements.snippetAdd?.addEventListener('click', handleAddSnippet);
}
