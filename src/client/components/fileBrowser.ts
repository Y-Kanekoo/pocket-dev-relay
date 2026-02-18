/**
 * ファイルブラウザコンポーネント
 * ファイル一覧表示、ファイル内容の読み込み・保存
 */

import type { FileItem, UploadResponse } from '../../types/index.js';
import type { AccessUrl } from '../../types/index.js';
import { sessionStore } from '../state/sessionStore.js';
import { showToast } from './toast.js';
import {
  authHeaders,
  fetchFileList,
  fetchFileContent,
  saveFile as saveFileApi,
  fetchAddresses,
  fetchQrCode,
  pickBestUrl,
  labelForUrl,
  copyText,
} from '../services/api.js';

// ==================================================
// DOM要素の参照
// ==================================================

interface FileBrowserElements {
  fileList: HTMLElement | null;
  filePath: HTMLElement | null;
  fileName: HTMLElement | null;
  fileContent: HTMLTextAreaElement | null;
  fileStatus: HTMLElement | null;
  saveFile: HTMLButtonElement | null;
  urlList: HTMLElement | null;
  qrImage: HTMLImageElement | null;
  qrLabel: HTMLElement | null;
  uploadBtn: HTMLButtonElement | null;
  uploadInput: HTMLInputElement | null;
  uploadArea: HTMLElement | null;
  uploadProgress: HTMLElement | null;
}

let elements: FileBrowserElements = {
  fileList: null,
  filePath: null,
  fileName: null,
  fileContent: null,
  fileStatus: null,
  saveFile: null,
  urlList: null,
  qrImage: null,
  qrLabel: null,
  uploadBtn: null,
  uploadInput: null,
  uploadArea: null,
  uploadProgress: null,
};

// コールバック関数
let onAuthRequired: (() => void) | null = null;

// 現在のファイル
const currentFile: { path: string | null } = {
  path: null,
};

// 現在のディレクトリパス（アップロード先として使用）
let currentDirPath = '.';

// ==================================================
// パス操作ユーティリティ
// ==================================================

/**
 * パスを結合
 */
function joinPath(base: string, name: string): string {
  if (!base || base === '.') return name;
  return `${base}/${name}`;
}

/**
 * 親パスを取得
 */
function parentPath(current: string): string {
  if (!current || current === '.') return '.';
  const parts = current.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? parts.join('/') : '.';
}

// ==================================================
// ファイル一覧表示
// ==================================================

/**
 * ファイル一覧をレンダリング
 */
function renderFileList(items: FileItem[], currentPath: string): void {
  if (!elements.fileList || !elements.filePath) return;

  // XSS対策: クリア目的のinnerHTMLをreplaceChildrenに変更
  elements.fileList.replaceChildren();
  elements.filePath.textContent = currentPath;
  currentDirPath = currentPath;

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
      loadFiles(parentPath(currentPath));
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
        loadFiles(joinPath(currentPath, item.name));
      } else {
        loadFile(joinPath(currentPath, item.name));
      }
    });
    elements.fileList?.appendChild(row);
  });
}

/**
 * ファイル一覧を読み込み
 */
export async function loadFiles(path: string): Promise<void> {
  try {
    const data = await fetchFileList(path);
    renderFileList(data.items, data.path);
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      onAuthRequired?.();
      return;
    }
    if (elements.fileStatus) {
      elements.fileStatus.textContent = 'ファイル一覧の取得に失敗しました。';
    }
  }
}

/**
 * ファイル内容を読み込み
 */
export async function loadFile(path: string): Promise<void> {
  try {
    const data = await fetchFileContent(path);
    currentFile.path = data.path;
    if (elements.fileName) {
      elements.fileName.textContent = data.path;
    }
    if (elements.fileContent) {
      elements.fileContent.value = data.content;
    }
    updateFileEditor();
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      onAuthRequired?.();
      return;
    }
    if (elements.fileStatus) {
      elements.fileStatus.textContent =
        error instanceof Error
          ? `読み込み失敗: ${error.message}`
          : 'ファイルの読み込みに失敗しました。';
    }
  }
}

/**
 * ファイルエディタUIを更新
 */
export function updateFileEditor(): void {
  const config = sessionStore.getConfig();
  if (!config) return;
  const writable = Boolean(config.fileWriteEnabled);
  if (elements.fileContent) {
    elements.fileContent.readOnly = !writable;
  }
  if (elements.saveFile) {
    elements.saveFile.disabled = !writable || !elements.fileContent?.value;
  }
  if (elements.fileStatus) {
    if (!writable) {
      elements.fileStatus.textContent = '読み取り専用です（ALLOW_FILE_WRITE=true で保存可）。';
    } else {
      elements.fileStatus.textContent = '';
    }
  }
}

/**
 * ファイルを保存
 */
async function saveCurrentFile(): Promise<void> {
  if (!currentFile.path || !elements.saveFile) return;
  elements.saveFile.disabled = true;
  try {
    await saveFileApi(currentFile.path, elements.fileContent?.value || '');
    if (elements.fileStatus) {
      elements.fileStatus.textContent = '保存しました。';
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      onAuthRequired?.();
      return;
    }
    if (elements.fileStatus) {
      elements.fileStatus.textContent =
        error instanceof Error ? `保存に失敗しました: ${error.message}` : '保存に失敗しました。';
    }
  } finally {
    if (elements.saveFile) {
      elements.saveFile.disabled = false;
    }
  }
}

// ==================================================
// URL一覧・QRコード表示
// ==================================================

/**
 * URL一覧をレンダリング
 */
function renderUrlList(urls: AccessUrl[]): void {
  if (!elements.urlList) return;

  // XSS対策: クリア目的のinnerHTMLをreplaceChildrenに変更
  elements.urlList.replaceChildren();
  if (!urls.length) {
    elements.urlList.textContent = '接続URLが見つかりません。';
    return;
  }

  urls.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'url-item';

    const meta = document.createElement('div');
    meta.className = 'url-meta';

    const label = document.createElement('div');
    label.className = 'url-label';
    label.textContent = labelForUrl(entry);

    const text = document.createElement('div');
    text.className = 'url-text';
    text.textContent = entry.url;

    const copyBtn = document.createElement('button') as HTMLButtonElement;
    copyBtn.type = 'button';
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'コピー';
    copyBtn.addEventListener('click', () => copyText(entry.url, copyBtn));

    meta.append(label, text);
    row.append(meta, copyBtn);
    elements.urlList?.appendChild(row);
  });
}

/**
 * QRコードを読み込み
 */
async function loadQr(url: string): Promise<void> {
  if (!url) return;
  if (elements.qrLabel) {
    elements.qrLabel.textContent = url;
  }
  try {
    const dataUrl = await fetchQrCode(url);
    if (elements.qrImage) {
      elements.qrImage.src = dataUrl;
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      onAuthRequired?.();
      return;
    }
    if (elements.qrLabel) {
      elements.qrLabel.textContent = 'QRの生成に失敗しました。';
    }
  }
}

/**
 * アドレス一覧を読み込み
 */
export async function loadAddresses(): Promise<void> {
  try {
    const urls = await fetchAddresses();
    renderUrlList(urls);
    const best = pickBestUrl(urls);
    if (best) {
      await loadQr(best.url);
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      onAuthRequired?.();
      return;
    }
    if (elements.urlList) {
      elements.urlList.textContent = '接続URLの取得に失敗しました。';
    }
  }
}

// ==================================================
// 初期化
// ==================================================

/**
 * ファイルブラウザを初期化
 */
export function initFileBrowser(
  elems: FileBrowserElements,
  callbacks: {
    onAuthRequired: () => void;
  },
): void {
  elements = elems;
  onAuthRequired = callbacks.onAuthRequired;

  // ファイル内容の入力イベント
  elements.fileContent?.addEventListener('input', () => {
    const config = sessionStore.getConfig();
    if (!config || !config.fileWriteEnabled) return;
    if (elements.saveFile) {
      elements.saveFile.disabled = !elements.fileContent?.value;
    }
  });

  // ファイル保存ボタン
  elements.saveFile?.addEventListener('click', saveCurrentFile);

  // アップロードボタン
  elements.uploadBtn?.addEventListener('click', () => {
    elements.uploadInput?.click();
  });

  // ファイル選択時のアップロード処理
  elements.uploadInput?.addEventListener('change', () => {
    const files = elements.uploadInput?.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  });

  // ドラッグ&ドロップ対応
  if (elements.uploadArea) {
    elements.uploadArea.addEventListener('dragover', (e: Event) => {
      e.preventDefault();
      (e as DragEvent).stopPropagation();
      elements.uploadArea?.classList.add('drag-over');
    });

    elements.uploadArea.addEventListener('dragleave', (e: Event) => {
      e.preventDefault();
      (e as DragEvent).stopPropagation();
      elements.uploadArea?.classList.remove('drag-over');
    });

    elements.uploadArea.addEventListener('drop', (e: Event) => {
      e.preventDefault();
      (e as DragEvent).stopPropagation();
      elements.uploadArea?.classList.remove('drag-over');
      const dragEvent = e as DragEvent;
      const files = dragEvent.dataTransfer?.files;
      if (files && files.length > 0) {
        uploadFile(files[0]);
      }
    });
  }
}

// ==================================================
// ファイルアップロード
// ==================================================

/**
 * ファイルをアップロード
 */
async function uploadFile(file: File): Promise<void> {
  if (elements.uploadProgress) {
    elements.uploadProgress.style.display = 'block';
    elements.uploadProgress.textContent = 'アップロード中...';
    elements.uploadProgress.className = 'upload-progress uploading';
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('uploadPath', currentDirPath);

  try {
    const xhr = new XMLHttpRequest();

    // プログレス更新
    xhr.upload.addEventListener('progress', (e: ProgressEvent) => {
      if (e.lengthComputable && elements.uploadProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        elements.uploadProgress.textContent = `アップロード中... ${percent}%`;
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

    if (elements.uploadProgress) {
      elements.uploadProgress.textContent = `"${result.fileName}" をアップロードしました`;
      elements.uploadProgress.className = 'upload-progress success';
    }
    showToast(`"${result.fileName}" をアップロードしました`, 'success');

    // ファイル一覧を更新
    await loadFiles(currentDirPath);

    // プログレス表示を3秒後に非表示
    setTimeout(() => {
      if (elements.uploadProgress) {
        elements.uploadProgress.style.display = 'none';
      }
    }, 3000);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'アップロードに失敗しました';
    if (elements.uploadProgress) {
      elements.uploadProgress.textContent = message;
      elements.uploadProgress.className = 'upload-progress error';
    }
    showToast(message, 'error');

    // エラー表示を5秒後に非表示
    setTimeout(() => {
      if (elements.uploadProgress) {
        elements.uploadProgress.style.display = 'none';
      }
    }, 5000);
  }

  // ファイル入力をリセット
  if (elements.uploadInput) {
    elements.uploadInput.value = '';
  }
}
