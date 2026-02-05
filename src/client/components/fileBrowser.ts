/**
 * ファイルブラウザコンポーネント
 * ファイル一覧表示、ファイル内容の読み込み・保存
 */

import type { FileItem, AppConfig } from '../../types/index.js';
import type { AccessUrl } from '../../types/index.js';
import { sessionStore } from '../state/sessionStore.js';
import {
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
};

// コールバック関数
let onAuthRequired: (() => void) | null = null;

// 現在のファイル
const currentFile: { path: string | null } = {
  path: null
};

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

  elements.fileList.innerHTML = '';
  elements.filePath.textContent = currentPath;

  if (currentPath !== '.') {
    const parent = document.createElement('div');
    parent.className = 'file-item';
    parent.innerHTML = '<span>[DIR] ..</span><span>&gt;</span>';
    parent.addEventListener('click', () => {
      loadFiles(parentPath(currentPath));
    });
    elements.fileList.appendChild(parent);
  }

  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'file-item';
    row.innerHTML = `<span>[${item.type === 'dir' ? 'DIR' : 'FILE'}] ${item.name}</span><span>&gt;</span>`;
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
      elements.fileStatus.textContent = error instanceof Error ? `読み込み失敗: ${error.message}` : 'ファイルの読み込みに失敗しました。';
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
      elements.fileStatus.textContent =
        '読み取り専用です（ALLOW_FILE_WRITE=true で保存可）。';
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
      elements.fileStatus.textContent = error instanceof Error ? `保存に失敗しました: ${error.message}` : '保存に失敗しました。';
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

  elements.urlList.innerHTML = '';
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
  }
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
}
