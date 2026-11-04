/**
 * Pocket Dev Relay - Service Worker
 *
 * キャッシュ戦略: ネットワークファースト（タイムアウト付き）
 * - オンライン時は常に最新のリソースを取得
 * - ネットワーク応答が遅い場合はキャッシュにフォールバック
 * - オフライン時はキャッシュから提供
 */

// キャッシュバージョン（更新時にインクリメント）
const CACHE_VERSION = 'pdr-cache-v3';

// キャッシュ名のプレフィックス（古いキャッシュ判定用）
const CACHE_PREFIX = 'pdr-cache-';

// ネットワークタイムアウト（ミリ秒）
const NETWORK_TIMEOUT_MS = 3000;

// キャッシュ対象の静的アセット
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/icon.svg',
  '/manifest.json',
  '/vendor/@xterm/xterm/css/xterm.css',
  '/vendor/@xterm/xterm/lib/xterm.js',
  '/vendor/@xterm/addon-fit/lib/addon-fit.js'
];

// Google Fontsのキャッシュ名
const FONTS_CACHE = 'pdr-fonts-v1';

// 保持するキャッシュ名のセット
const VALID_CACHES = new Set([CACHE_VERSION, FONTS_CACHE]);

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
 * 古いキャッシュを削除（プレフィックスベースで判定）
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] アクティベート中...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // 有効なキャッシュ一覧に含まれないものを削除
              // プレフィックスが一致する古いバージョンも確実に削除
              if (VALID_CACHES.has(cacheName)) {
                return false;
              }
              // pdr-で始まるキャッシュは古いバージョンなので削除
              if (cacheName.startsWith(CACHE_PREFIX) || cacheName.startsWith('pdr-')) {
                return true;
              }
              return false;
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

  // その他のリクエストはネットワークファースト（タイムアウト付き）
  event.respondWith(networkFirst(request));
});

/**
 * ネットワークファースト戦略（タイムアウト付き）
 * 1. ネットワークから取得を試みる（タイムアウトあり）
 * 2. 成功したらキャッシュを更新して返す
 * 3. タイムアウトまたは失敗したらキャッシュから返す
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    // タイムアウト付きでネットワークから取得
    const networkResponse = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);

    // 成功したらキャッシュを更新
    if (networkResponse.ok) {
      // レスポンスをクローンしてキャッシュに保存
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (_error) {
    // ネットワークエラーまたはタイムアウト時はキャッシュから取得
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
 * タイムアウト付きfetch
 * 指定時間内にレスポンスが返らない場合はAbortErrorをスロー
 */
function fetchWithTimeout(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    fetch(request, { signal: controller.signal })
      .then((response) => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

// ============================================================
// プッシュ通知イベント
// ============================================================

/**
 * プッシュイベントハンドラ
 * サーバーからのプッシュ通知を受信して表示
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    // JSON解析に失敗した場合はテキストとして扱う
    data = {
      title: 'Pocket Dev Relay',
      body: event.data.text(),
    };
  }

  const title = data.title || 'Pocket Dev Relay';
  const options = {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || 'pdr-notification',
    data: data,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/**
 * 通知クリックイベントハンドラ
 * 通知をクリックしたときにアプリにフォーカスする
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // 既存のウィンドウがあればフォーカス
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // なければ新しいウィンドウを開く
        if (self.clients.openWindow) {
          return self.clients.openWindow('/');
        }
      })
  );
});

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
  } catch (_error) {
    console.log(`[SW] フォント取得失敗: ${request.url}`);
    // フォントはオプショナルなので空のレスポンスを返す
    return new Response('', { status: 200 });
  }
}
