/**
 * ファイルエディタコンポーネント
 * ファイル内容の表示・編集・保存を担当
 */

import { sessionStore } from '../state/sessionStore.js';
import { fetchFileContent, saveFile as saveFileApi } from '../services/api.js';
import type { FileBrowserSharedState } from './fileBrowser.js';

// ==================================================
// ファイル内容表示・編集
// ==================================================

/**
 * ファイル内容を読み込み
 */
export async function loadFile(
  path: string,
  shared: FileBrowserSharedState,
): Promise<void> {
  try {
    const data = await fetchFileContent(path);
    shared.currentFile.path = data.path;
    if (shared.elements.fileName) {
      shared.elements.fileName.textContent = data.path;
    }
    if (shared.elements.fileContent) {
      shared.elements.fileContent.value = data.content;
    }
    updateFileEditor(shared);
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      shared.onAuthRequired?.();
      return;
    }
    if (shared.elements.fileStatus) {
      shared.elements.fileStatus.textContent =
        error instanceof Error
          ? `読み込み失敗: ${error.message}`
          : 'ファイルの読み込みに失敗しました。';
    }
  }
}

/**
 * ファイルエディタUIを更新
 */
export function updateFileEditor(shared: FileBrowserSharedState): void {
  const config = sessionStore.getConfig();
  if (!config) return;
  const writable = Boolean(config.fileWriteEnabled);
  if (shared.elements.fileContent) {
    shared.elements.fileContent.readOnly = !writable;
  }
  if (shared.elements.saveFile) {
    shared.elements.saveFile.disabled = !writable || !shared.elements.fileContent?.value;
  }
  if (shared.elements.fileStatus) {
    if (!writable) {
      shared.elements.fileStatus.textContent = '読み取り専用です（ALLOW_FILE_WRITE=true で保存可）。';
    } else {
      shared.elements.fileStatus.textContent = '';
    }
  }
}

/**
 * ファイルを保存
 */
export async function saveCurrentFile(shared: FileBrowserSharedState): Promise<void> {
  if (!shared.currentFile.path || !shared.elements.saveFile) return;
  shared.elements.saveFile.disabled = true;
  try {
    await saveFileApi(shared.currentFile.path, shared.elements.fileContent?.value || '');
    if (shared.elements.fileStatus) {
      shared.elements.fileStatus.textContent = '保存しました。';
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      shared.onAuthRequired?.();
      return;
    }
    if (shared.elements.fileStatus) {
      shared.elements.fileStatus.textContent =
        error instanceof Error ? `保存に失敗しました: ${error.message}` : '保存に失敗しました。';
    }
  } finally {
    if (shared.elements.saveFile) {
      shared.elements.saveFile.disabled = false;
    }
  }
}

/**
 * ファイルエディタのイベントリスナーを初期化
 */
export function initFileEditorEvents(shared: FileBrowserSharedState): void {
  // ファイル内容の入力イベント
  shared.elements.fileContent?.addEventListener('input', () => {
    const config = sessionStore.getConfig();
    if (!config || !config.fileWriteEnabled) return;
    if (shared.elements.saveFile) {
      shared.elements.saveFile.disabled = !shared.elements.fileContent?.value;
    }
  });

  // ファイル保存ボタン
  shared.elements.saveFile?.addEventListener('click', () => saveCurrentFile(shared));
}
