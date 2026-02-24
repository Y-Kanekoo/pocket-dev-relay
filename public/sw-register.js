/**
 * Service Worker 登録スクリプト
 * CSP script-src 'unsafe-inline' を除去するため、インラインスクリプトから外部ファイルに分離
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      console.log('[PWA] Service Worker 登録成功:', registration.scope);

      // 更新があった場合の処理
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        console.log('[PWA] 新しい Service Worker を検出');

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // 新しいバージョンが利用可能
            console.log('[PWA] 新しいバージョンが利用可能です');
          }
        });
      });
    } catch (error) {
      console.error('[PWA] Service Worker 登録失敗:', error);
    }
  });
}
