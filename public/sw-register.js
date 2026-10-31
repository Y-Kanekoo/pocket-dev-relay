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
        if (!newWorker) return;

        console.log('[PWA] 新しい Service Worker を検出');

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // 新しいバージョンが利用可能（既存のSWが制御中 = 初回インストールではない）
            console.log('[PWA] 新しいバージョンが利用可能です');
            showUpdateNotification();
          }
        });
      });
    } catch (error) {
      console.error('[PWA] Service Worker 登録失敗:', error);
    }
  });
}

/**
 * SW更新通知バナーを表示する
 * クライアントバンドル内のトーストシステムとは独立したDOM操作で実装
 */
function showUpdateNotification() {
  // 既に表示中なら重複作成しない
  if (document.getElementById('sw-update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.setAttribute('role', 'alert');

  // スタイル設定
  Object.assign(banner.style, {
    position: 'fixed',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '10000',
    background: '#1a1a2e',
    color: '#e0e0e0',
    padding: '12px 20px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '14px',
    fontFamily: 'system-ui, sans-serif',
    maxWidth: '90vw',
  });

  // メッセージテキスト
  const message = document.createElement('span');
  message.textContent = '新バージョンが利用可能です。再読み込みしてください。';
  banner.appendChild(message);

  // 再読み込みボタン
  const reloadBtn = document.createElement('button');
  reloadBtn.textContent = '再読み込み';
  Object.assign(reloadBtn.style, {
    background: '#077363',
    color: '#fff',
    border: 'none',
    padding: '6px 14px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
  });
  reloadBtn.addEventListener('click', () => {
    window.location.reload();
  });
  banner.appendChild(reloadBtn);

  // 閉じるボタン
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u00d7';
  closeBtn.setAttribute('aria-label', '閉じる');
  Object.assign(closeBtn.style, {
    background: 'none',
    color: '#999',
    border: 'none',
    padding: '4px 8px',
    cursor: 'pointer',
    fontSize: '18px',
    lineHeight: '1',
  });
  closeBtn.addEventListener('click', () => {
    banner.remove();
  });
  banner.appendChild(closeBtn);

  document.body.appendChild(banner);
}
