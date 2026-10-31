/**
 * ファイル一覧表示コンポーネント
 * ディレクトリ一覧の表示・ナビゲーションを担当
 */

import type { FileItem } from '../../types/index.js';
import { fetchFileList } from '../services/api.js';
import type { FileBrowserSharedState } from './fileBrowser.js';
import { joinPath, parentPath } from '../../utils/filepath.js';
// joinPath, parentPath は src/utils/filepath.ts に一元化。再エクスポート
export { joinPath, parentPath } from '../../utils/filepath.js';

// ==================================================
// ファイル一覧表示
// ==================================================

/**
 * ファイル一覧をレンダリング
 */
export function renderFileList(
  items: FileItem[],
  currentPath: string,
  shared: FileBrowserSharedState,
): void {
  const { elements } = shared;
  if (!elements.fileList || !elements.filePath) return;

  // XSS対策: クリア目的のinnerHTMLをreplaceChildrenに変更
  elements.fileList.replaceChildren();
  elements.filePath.textContent = currentPath;
  shared.currentDirPath = currentPath;

  if (currentPath !== '.') {
    const parent = document.createElement('div');
    parent.className = 'file-item';
    // XSS対策: DOM APIでspan要素を作成し、textContentでテキストを設定
    const parentLabel = document.createElement('span');
    parentLabel.textContent = '[DIR] ..';
    const parentArrow = document.createElement('span');
    parentArrow.textContent = '>';
    parent.append(parentLabel, parentArrow);
    parent.addEventListener('click', () => {
      loadFiles(parentPath(currentPath), shared);
    });
    elements.fileList.appendChild(parent);
  }

  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'file-item';
    // XSS対策: item.nameはユーザー制御可能な値のため、textContentで安全に設定
    const itemLabel = document.createElement('span');
    itemLabel.textContent = `[${item.type === 'dir' ? 'DIR' : 'FILE'}] ${item.name}`;
    const itemArrow = document.createElement('span');
    itemArrow.textContent = '>';
    row.append(itemLabel, itemArrow);
    row.addEventListener('click', () => {
      if (item.type === 'dir') {
        loadFiles(joinPath(currentPath, item.name), shared);
      } else {
        // ファイル読み込みはfileBrowserから注入されるコールバックを使用
        shared.onLoadFile?.(joinPath(currentPath, item.name));
      }
    });
    elements.fileList?.appendChild(row);
  });
}

/**
 * ファイル一覧を読み込み
 */
export async function loadFiles(path: string, shared: FileBrowserSharedState): Promise<void> {
  try {
    const data = await fetchFileList(path);
    renderFileList(data.items, data.path, shared);
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      shared.onAuthRequired?.();
      return;
    }
    if (shared.elements.fileStatus) {
      shared.elements.fileStatus.textContent = 'ファイル一覧の取得に失敗しました。';
    }
  }
}
