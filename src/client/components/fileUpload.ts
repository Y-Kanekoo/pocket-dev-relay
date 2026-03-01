/**
 * ファイルアップロードコンポーネント
 * ファイルのアップロード処理（ボタン・ドラッグ＆ドロップ）を担当
 */

import type { UploadResponse } from '../../types/index.js';
import { authHeaders } from '../services/api.js';
import { showToast } from './toast.js';
import type { FileBrowserSharedState } from './fileBrowser.js';

// ==================================================
// ファイルアップロード
// ==================================================

/**
 * ファイルをアップロード
 */
export async function uploadFile(
  file: File,
  shared: FileBrowserSharedState,
): Promise<void> {
  if (shared.elements.uploadProgress) {
    shared.elements.uploadProgress.style.display = 'block';
    shared.elements.uploadProgress.textContent = 'アップロード中...';
    shared.elements.uploadProgress.className = 'upload-progress uploading';
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('uploadPath', shared.currentDirPath);

  try {
    const xhr = new XMLHttpRequest();

    // プログレス更新
    xhr.upload.addEventListener('progress', (e: ProgressEvent) => {
      if (e.lengthComputable && shared.elements.uploadProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        shared.elements.uploadProgress.textContent = `アップロード中... ${percent}%`;
      }
    });

    // アップロード完了
    const result = await new Promise<UploadResponse>((resolve, reject) => {
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error('レスポンスの解析に失敗しました'));
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            reject(new Error(errorData.message || `アップロード失敗 (${xhr.status})`));
          } catch {
            reject(new Error(`アップロード失敗 (${xhr.status})`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('ネットワークエラーが発生しました'));
      });

      xhr.open('POST', '/api/upload');

      // 認証ヘッダーを設定
      const headers = authHeaders();
      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.send(formData);
    });

    if (shared.elements.uploadProgress) {
      shared.elements.uploadProgress.textContent = `"${result.fileName}" をアップロードしました`;
      shared.elements.uploadProgress.className = 'upload-progress success';
    }
    showToast(`"${result.fileName}" をアップロードしました`, 'success');

    // ファイル一覧を更新（fileBrowserから注入されるコールバックを使用）
    await shared.onReloadFiles?.(shared.currentDirPath);

    // プログレス表示を3秒後に非表示
    setTimeout(() => {
      if (shared.elements.uploadProgress) {
        shared.elements.uploadProgress.style.display = 'none';
      }
    }, 3000);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'アップロードに失敗しました';
    if (shared.elements.uploadProgress) {
      shared.elements.uploadProgress.textContent = message;
      shared.elements.uploadProgress.className = 'upload-progress error';
    }
    showToast(message, 'error');

    // エラー表示を5秒後に非表示
    setTimeout(() => {
      if (shared.elements.uploadProgress) {
        shared.elements.uploadProgress.style.display = 'none';
      }
    }, 5000);
  }

  // ファイル入力をリセット
  if (shared.elements.uploadInput) {
    shared.elements.uploadInput.value = '';
  }
}

/**
 * ファイルアップロードのイベントリスナーを初期化
 */
export function initFileUploadEvents(shared: FileBrowserSharedState): void {
  // アップロードボタン
  shared.elements.uploadBtn?.addEventListener('click', () => {
    shared.elements.uploadInput?.click();
  });

  // ファイル選択時のアップロード処理
  shared.elements.uploadInput?.addEventListener('change', () => {
    const files = shared.elements.uploadInput?.files;
    if (files && files.length > 0) {
      uploadFile(files[0], shared);
    }
  });

  // ドラッグ&ドロップ対応
  if (shared.elements.uploadArea) {
    shared.elements.uploadArea.addEventListener('dragover', (e: Event) => {
      e.preventDefault();
      (e as DragEvent).stopPropagation();
      shared.elements.uploadArea?.classList.add('drag-over');
    });

    shared.elements.uploadArea.addEventListener('dragleave', (e: Event) => {
      e.preventDefault();
      (e as DragEvent).stopPropagation();
      shared.elements.uploadArea?.classList.remove('drag-over');
    });

    shared.elements.uploadArea.addEventListener('drop', (e: Event) => {
      e.preventDefault();
      (e as DragEvent).stopPropagation();
      shared.elements.uploadArea?.classList.remove('drag-over');
      const dragEvent = e as DragEvent;
      const files = dragEvent.dataTransfer?.files;
      if (files && files.length > 0) {
        uploadFile(files[0], shared);
      }
    });
  }
}
