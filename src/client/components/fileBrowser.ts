/**
 * ファイルブラウザコンポーネント（ハブモジュール）
 * 各サブモジュール（fileList, fileEditor, fileUpload）を統合し、
 * 共有状態を管理する。既存のエクスポートインターフェースを維持。
 */

import type { AccessUrl } from '../../types/index.js';
import {
  fetchAddresses,
  fetchQrCode,
  pickBestUrl,
  labelForUrl,
  copyText,
} from '../services/api.js';
import { loadFiles as loadFilesInternal } from './fileList.js';
import {
  loadFile as loadFileInternal,
  updateFileEditor as updateFileEditorInternal,
  initFileEditorEvents,
} from './fileEditor.js';
import { initFileUploadEvents } from './fileUpload.js';

// サブモジュールのre-export
export { joinPath, parentPath } from './fileList.js';

// ==================================================
// 共有状態の型定義
// ==================================================

/** DOM要素の参照 */
export interface FileBrowserElements {
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

/** サブモジュール間で共有する状態 */
export interface FileBrowserSharedState {
  elements: FileBrowserElements;
  onAuthRequired: (() => void) | null;
  currentFile: { path: string | null };
  currentDirPath: string;
  /** ファイル読み込みコールバック（fileListからfileEditorを呼ぶため） */
  onLoadFile?: (path: string) => Promise<void>;
  /** ファイル一覧再読み込みコールバック（fileUploadからfileListを呼ぶため） */
  onReloadFiles?: (path: string) => Promise<void>;
}

// ==================================================
// 共有状態のインスタンス
// ==================================================

const sharedState: FileBrowserSharedState = {
  elements: {
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
  },
  onAuthRequired: null,
  currentFile: { path: null },
  currentDirPath: '.',
};

// ==================================================
// URL一覧・QRコード表示
// ==================================================

/**
 * URL一覧をレンダリング
 */
function renderUrlList(urls: AccessUrl[]): void {
  if (!sharedState.elements.urlList) return;

  // XSS対策: クリア目的のinnerHTMLをreplaceChildrenに変更
  sharedState.elements.urlList.replaceChildren();
  if (!urls.length) {
    sharedState.elements.urlList.textContent = '接続URLが見つかりません。';
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

    // トンネルURLにバッジを追加
    if (entry.type === 'tunnel') {
      const badge = document.createElement('span');
      badge.className = 'tunnel-badge';
      badge.textContent = '外部';
      label.appendChild(badge);
    }

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
    sharedState.elements.urlList?.appendChild(row);
  });
}

/**
 * QRコードを読み込み
 */
async function loadQr(url: string): Promise<void> {
  if (!url) return;
  if (sharedState.elements.qrLabel) {
    sharedState.elements.qrLabel.textContent = url;
  }
  try {
    const dataUrl = await fetchQrCode(url);
    if (sharedState.elements.qrImage) {
      sharedState.elements.qrImage.src = dataUrl;
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      sharedState.onAuthRequired?.();
      return;
    }
    if (sharedState.elements.qrLabel) {
      sharedState.elements.qrLabel.textContent = 'QRの生成に失敗しました。';
    }
  }
}

// ==================================================
// エクスポートAPI（後方互換性維持）
// ==================================================

/**
 * ファイル一覧を読み込み
 */
export async function loadFiles(path: string): Promise<void> {
  return loadFilesInternal(path, sharedState);
}

/**
 * ファイル内容を読み込み
 */
export async function loadFile(path: string): Promise<void> {
  return loadFileInternal(path, sharedState);
}

/**
 * ファイルエディタUIを更新
 */
export function updateFileEditor(): void {
  return updateFileEditorInternal(sharedState);
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
      sharedState.onAuthRequired?.();
      return;
    }
    if (sharedState.elements.urlList) {
      sharedState.elements.urlList.textContent = '接続URLの取得に失敗しました。';
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
  sharedState.elements = elems;
  sharedState.onAuthRequired = callbacks.onAuthRequired;

  // サブモジュール間のコールバックを設定
  sharedState.onLoadFile = (path: string) => loadFileInternal(path, sharedState);
  sharedState.onReloadFiles = (path: string) => loadFilesInternal(path, sharedState);

  // ファイルエディタのイベント初期化
  initFileEditorEvents(sharedState);

  // ファイルアップロードのイベント初期化
  initFileUploadEvents(sharedState);
}
