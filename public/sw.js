/**
 * Pocket Dev Relay - Service Worker
 *
 * キャッシュ戦略: ネットワークファースト
 * - オンライン時は常に最新のリソースを取得
 * - オフライン時はキャッシュから提供
 */

// キャッシュバージョン（更新時にインクリメント）
const CACHE_VERSION = 'pdr-cache-v1';

// キャッシュ対象の静的アセット
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/icon.svg',
  '/manifest.json',
  '/vendor/xterm/css/xterm.css',
  '/vendor/xterm/lib/xterm.js',
  '/vendor/xterm-addon-fit/lib/xterm-addon-fit.js'
];

// Google Fontsのキャッシュ名
const FONTS_CACHE = 'pdr-fonts-v1';

/**
 * インストールイベント
 * 静的アセットをキャッシュにプリロード
 */
self.addEventListener('install', (event) => {
  console.log('[SW] インストール中...');

  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => {
        console.log('[SW] 静的アセットをキャッシュ中...');
        // 個別にキャッシュを試み、失敗しても継続（vendorファイルが存在しない場合など）
        return Promise.allSettled(
          STATIC_ASSETS.map((asset) =>
            cache.add(asset).catch((err) => {
              console.warn(`[SW] キャッシュ失敗: ${asset}`, err);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] インストール完了');
        // 即座にアクティブ化
        return self.skipWaiting();
      })
  );
});

/**
 * アクティベートイベント
 * 古いキャッシュを削除
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] アクティベート中...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // 現在のバージョンとフォントキャッシュ以外を削除
              return cacheName !== CACHE_VERSION && cacheName !== FONTS_CACHE;
            })
            .map((cacheName) => {
              console.log(`[SW] 古いキャッシュを削除: ${cacheName}`);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] アクティベート完了');
        // 全てのクライアントで即座に有効化
        return self.clients.claim();
      })
  );
});

/**
 * フェッチイベント
 * ネットワークファースト戦略を実装
 */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // WebSocketリクエストは無視
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // APIリクエストは常にネットワークから取得（キャッシュしない）
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) {
    return;
  }

  // Google Fontsは別のキャッシュ戦略（キャッシュファースト）
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(handleFontRequest(request));
    return;
  }

  // その他のリクエストはネットワークファースト
  event.respondWith(networkFirst(request));
});

/**
 * ネットワークファースト戦略
 * 1. ネットワークから取得を試みる
 * 2. 成功したらキャッシュを更新して返す
 * 3. 失敗したらキャッシュから返す
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    // ネットワークから取得
    const networkResponse = await fetch(request);

    // 成功したらキャッシュを更新
    if (networkResponse.ok) {
      // レスポンスをクローンしてキャッシュに保存
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    // ネットワークエラー時はキャッシュから取得
    console.log(`[SW] ネットワークエラー、キャッシュから取得: ${request.url}`);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // ナビゲーションリクエストでキャッシュがない場合、index.htmlを返す
    if (request.mode === 'navigate') {
      const indexResponse = await cache.match('/index.html');
      if (indexResponse) {
        return indexResponse;
      }
    }

    // キャッシュにもない場合はオフラインエラーを返す
    return new Response('オフラインです。ネットワーク接続を確認してください。', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/**
 * フォント用キャッシュファースト戦略
 * フォントは変更が少ないのでキャッシュを優先
 */
async function handleFontRequest(request) {
  const cache = await caches.open(FONTS_CACHE);

  // まずキャッシュを確認
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // キャッシュにない場合はネットワークから取得
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log(`[SW] フォント取得失敗: ${request.url}`);
    // フォントはオプショナルなので空のレスポンスを返す
    return new Response('', { status: 200 });
  }
}
