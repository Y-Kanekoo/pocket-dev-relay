(() => {
  // ==================================================
  // 定数定義
  // ==================================================

  // 最大セッション数
  const MAX_SESSIONS = 5;

  // フォントサイズ設定
  const FONT_SIZE_MIN = 10;
  const FONT_SIZE_MAX = 24;
  const FONT_SIZE_DEFAULT = 13;
  const FONT_SIZE_KEY = 'pdr_terminal_font_size';

  // テーマ設定
  const THEME_STORAGE_KEY = 'pdr_theme';

  // ==================================================
  // 状態管理
  // ==================================================

  const state = {
    mode: 'codex',
    ws: null,
    config: null,
    token: localStorage.getItem('pdr_token') || '',
    // 複数セッション管理
    sessions: new Map(), // sessionId -> セッション情報
    activeSessionId: null, // 現在アクティブなセッションID
    nextSessionNum: 1, // 次のセッション番号
    // 自動再接続用の状態
    reconnect: {
      enabled: true,
      attempts: 0,
      maxAttempts: 10,
      baseDelay: 1000,
      maxDelay: 30000,
      timer: null,
      manualDisconnect: false
    }
  };

  // セッション情報の構造
  // {
  //   id: string,           // ユニークID
  //   num: number,          // セッション番号（表示用）
  //   term: Terminal,       // xtermインスタンス
  //   fitAddon: FitAddon,   // FitAddonインスタンス
  //   element: HTMLElement, // ターミナル用のDOM要素
  //   tabElement: HTMLElement, // タブ用のDOM要素
  //   active: boolean,      // セッションがサーバー側でアクティブか
  //   label: string,        // セッションラベル
  //   cwd: string           // 作業ディレクトリ
  // }

  // ==================================================
  // DOM要素の参照
  // ==================================================

  const elements = {
    modeGrid: document.getElementById('mode-grid'),
    customMode: document.getElementById('custom-mode'),
    cwdInput: document.getElementById('cwd-input'),
    commandRow: document.getElementById('custom-command-row'),
    commandInput: document.getElementById('command-input'),
    startBtn: document.getElementById('start-btn'),
    stopBtn: document.getElementById('stop-btn'),
    clearBtn: document.getElementById('clear-btn'),
    terminalPanel: document.getElementById('terminal-panel'),
    filesPanel: document.getElementById('files-panel'),
    tabs: document.getElementById('tabs'),
    sessionMeta: document.getElementById('session-meta'),
    wsDot: document.getElementById('ws-dot'),
    statusText: document.getElementById('status-text'),
    urlList: document.getElementById('url-list'),
    qrImage: document.getElementById('qr-image'),
    qrLabel: document.getElementById('qr-label'),
    fileList: document.getElementById('file-list'),
    filePath: document.getElementById('file-path'),
    fileName: document.getElementById('file-name'),
    fileContent: document.getElementById('file-content'),
    fileStatus: document.getElementById('file-status'),
    saveFile: document.getElementById('save-file'),
    authOverlay: document.getElementById('auth-overlay'),
    authInput: document.getElementById('auth-input'),
    authSave: document.getElementById('auth-save'),
    toastContainer: document.getElementById('toast-container'),
    themeToggle: document.getElementById('theme-toggle'),
    // セッションタブ関連
    sessionTabs: document.getElementById('session-tabs'),
    sessionTabList: document.getElementById('session-tab-list'),
    sessionAddBtn: document.getElementById('session-add-btn'),
    terminalContainer: document.getElementById('terminal-container')
  };

  // ==================================================
  // テーマ管理
  // ==================================================

  // 現在のテーマを取得（light / dark）
  function getCurrentTheme() {
    // LocalStorageに保存された設定を優先
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    // システム設定に追従
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  // テーマを適用
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // meta theme-color も更新（PWA対応）
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#1a1a1a' : '#f4efe8');
    }
  }

  // テーマを切り替え
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    // 手動切替なのでLocalStorageに保存
    localStorage.setItem(THEME_STORAGE_KEY, next);
  }

  // システム設定の変更を監視
  function watchSystemTheme() {
    if (!window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      // LocalStorageに保存された設定がなければシステム設定に追従
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (!saved) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  // テーマ初期化
  function initTheme() {
    const theme = getCurrentTheme();
    applyTheme(theme);
    watchSystemTheme();

    // テーマ切替ボタンのイベントリスナー
    if (elements.themeToggle) {
      elements.themeToggle.addEventListener('click', toggleTheme);
    }
  }

  // 即座にテーマを適用（FOUC防止）
  initTheme();

  // ==================================================
  // トースト通知
  // ==================================================

  // トースト通知を表示
  function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
      success: '✓',
      error: '✕',
      warning: '!',
      info: 'i'
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${message}</span>
    `;

    elements.toastContainer.appendChild(toast);

    // 自動で消える
    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);

    return toast;
  }

  // ==================================================
  // フォントサイズ管理
  // ==================================================

  // LocalStorageからフォントサイズを取得
  function getStoredFontSize() {
    const stored = localStorage.getItem(FONT_SIZE_KEY);
    if (stored) {
      const size = parseInt(stored, 10);
      if (!isNaN(size) && size >= FONT_SIZE_MIN && size <= FONT_SIZE_MAX) {
        return size;
      }
    }
    return FONT_SIZE_DEFAULT;
  }

  // フォントサイズをLocalStorageに保存
  function saveFontSize(size) {
    localStorage.setItem(FONT_SIZE_KEY, String(size));
  }

  // 現在のフォントサイズ
  let currentFontSize = getStoredFontSize();

  // フォントサイズコントロールの要素取得
  const fontDecreaseBtn = document.getElementById('font-decrease');
  const fontIncreaseBtn = document.getElementById('font-increase');
  const fontSizeLabel = document.getElementById('font-size-label');

  // フォントサイズのUI更新
  function updateFontSizeUI() {
    if (fontSizeLabel) {
      fontSizeLabel.textContent = `${currentFontSize}px`;
    }
    // ボタンの有効/無効を更新
    if (fontDecreaseBtn) {
      fontDecreaseBtn.disabled = currentFontSize <= FONT_SIZE_MIN;
    }
    if (fontIncreaseBtn) {
      fontIncreaseBtn.disabled = currentFontSize >= FONT_SIZE_MAX;
    }
  }

  // フォントサイズ変更（全セッションに適用）
  function changeFontSize(delta) {
    const newSize = currentFontSize + delta;
    if (newSize < FONT_SIZE_MIN || newSize > FONT_SIZE_MAX) {
      return;
    }
    currentFontSize = newSize;
    saveFontSize(currentFontSize);

    // 全セッションのターミナルにフォントサイズを適用
    state.sessions.forEach((session) => {
      session.term.options.fontSize = currentFontSize;
      session.fitAddon.fit();
    });

    // アクティブなセッションのリサイズを送信
    sendResize();
    updateFontSizeUI();
  }

  // フォントサイズボタンのイベントリスナー
  if (fontDecreaseBtn) {
    fontDecreaseBtn.addEventListener('click', () => changeFontSize(-1));
  }
  if (fontIncreaseBtn) {
    fontIncreaseBtn.addEventListener('click', () => changeFontSize(1));
  }

  // 初期状態のUI更新
  updateFontSizeUI();

  // ==================================================
  // 複数セッション管理
  // ==================================================

  // ユニークなセッションIDを生成
  function generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // 新しいセッションを作成
  function createSession() {
    if (state.sessions.size >= MAX_SESSIONS) {
      showToast(`最大${MAX_SESSIONS}セッションまでです`, 'warning');
      return null;
    }

    const sessionId = generateSessionId();
    const sessionNum = state.nextSessionNum++;

    // ターミナル用のDOM要素を作成
    const terminalElement = document.createElement('div');
    terminalElement.className = 'terminal-shell';
    terminalElement.id = `terminal-${sessionId}`;
    elements.terminalContainer.appendChild(terminalElement);

    // xtermインスタンスを作成
    const term = new Terminal({
      cursorBlink: true,
      fontSize: currentFontSize,
      fontFamily: '"JetBrains Mono", "Menlo", monospace',
      theme: {
        background: '#14110d',
        foreground: '#f5efe6',
        cursor: '#f0b94b',
        selection: 'rgba(240, 185, 75, 0.3)'
      }
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalElement);
    fitAddon.fit();

    // 入力をWebSocketに送信（セッションIDを含める）
    term.onData((data) => {
      if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
      state.ws.send(JSON.stringify({
        type: 'input',
        sessionId: sessionId,
        data
      }));
    });

    // タブ要素を作成
    const tabElement = document.createElement('div');
    tabElement.className = 'session-tab';
    tabElement.dataset.sessionId = sessionId;
    tabElement.innerHTML = `
      <span class="session-tab-label">セッション ${sessionNum}</span>
      <button class="session-tab-close" title="セッションを閉じる">×</button>
    `;

    // タブクリックでセッション切り替え
    tabElement.addEventListener('click', (e) => {
      if (!e.target.classList.contains('session-tab-close')) {
        switchSession(sessionId);
      }
    });

    // 閉じるボタン
    const closeBtn = tabElement.querySelector('.session-tab-close');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeSession(sessionId);
    });

    elements.sessionTabList.appendChild(tabElement);

    // セッション情報を保存
    const session = {
      id: sessionId,
      num: sessionNum,
      term,
      fitAddon,
      element: terminalElement,
      tabElement,
      active: false,
      label: `セッション ${sessionNum}`,
      cwd: '.'
    };

    state.sessions.set(sessionId, session);

    // セッション追加ボタンの有効/無効を更新
    updateAddButtonState();

    return session;
  }

  // セッションを切り替え
  function switchSession(sessionId) {
    const session = state.sessions.get(sessionId);
    if (!session) return;

    // 以前のアクティブセッションを非アクティブに
    if (state.activeSessionId) {
      const prevSession = state.sessions.get(state.activeSessionId);
      if (prevSession) {
        prevSession.element.classList.remove('active');
        prevSession.tabElement.classList.remove('active');
      }
    }

    // 新しいセッションをアクティブに
    session.element.classList.add('active');
    session.tabElement.classList.add('active');
    state.activeSessionId = sessionId;

    // フィットとリサイズ
    session.fitAddon.fit();
    sendResize();

    // セッションメタ情報を更新
    updateSessionMeta();

    // ボタン状態を更新
    updateButtons();
  }

  // セッションを閉じる
  function closeSession(sessionId) {
    const session = state.sessions.get(sessionId);
    if (!session) return;

    // サーバー側のセッションを停止
    if (session.active && state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({
        type: 'stop',
        sessionId: sessionId
      }));
    }

    // DOM要素を削除
    session.element.remove();
    session.tabElement.remove();

    // ターミナルを破棄
    session.term.dispose();

    // セッションを削除
    state.sessions.delete(sessionId);

    // アクティブセッションが閉じられた場合、別のセッションに切り替え
    if (state.activeSessionId === sessionId) {
      state.activeSessionId = null;
      const remainingSessions = Array.from(state.sessions.keys());
      if (remainingSessions.length > 0) {
        switchSession(remainingSessions[remainingSessions.length - 1]);
      } else {
        updateSessionMeta();
        updateButtons();
      }
    }

    // セッション追加ボタンの有効/無効を更新
    updateAddButtonState();
  }

  // セッション追加ボタンの状態を更新
  function updateAddButtonState() {
    if (elements.sessionAddBtn) {
      elements.sessionAddBtn.disabled = state.sessions.size >= MAX_SESSIONS;
    }
  }

  // 初期セッションを作成
  function initSessions() {
    const session = createSession();
    if (session) {
      switchSession(session.id);
    }
  }

  // ==================================================
  // UI更新関数
  // ==================================================

  function setStatus(text, color) {
    elements.statusText.textContent = text;
    elements.wsDot.style.background = color;
    elements.wsDot.style.boxShadow = `0 0 12px ${color}`;
  }

  function updateSessionMeta() {
    if (!state.activeSessionId) {
      elements.sessionMeta.textContent = 'セッション未開始';
      return;
    }

    const session = state.sessions.get(state.activeSessionId);
    if (!session) {
      elements.sessionMeta.textContent = 'セッション未開始';
      return;
    }

    if (session.active) {
      elements.sessionMeta.textContent = `${session.label} - ${session.cwd}`;
    } else {
      elements.sessionMeta.textContent = `${session.label} - 未開始`;
    }
  }

  function updateButtons() {
    const session = state.activeSessionId ? state.sessions.get(state.activeSessionId) : null;
    const sessionActive = session ? session.active : false;

    elements.startBtn.disabled = sessionActive;
    elements.stopBtn.disabled = !sessionActive;
  }

  function updateModeUI() {
    const buttons = elements.modeGrid.querySelectorAll('[data-mode]');
    buttons.forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === state.mode);
    });
    elements.commandRow.style.display = state.mode === 'custom' ? 'grid' : 'none';
  }

  function updateFileEditor() {
    if (!state.config) return;
    const writable = Boolean(state.config.fileWriteEnabled);
    elements.fileContent.readOnly = !writable;
    elements.saveFile.disabled = !writable || !elements.fileContent.value;
    if (!writable) {
      elements.fileStatus.textContent =
        '読み取り専用です（ALLOW_FILE_WRITE=true で保存可）。';
    } else {
      elements.fileStatus.textContent = '';
    }
  }

  // タブのラベルを更新
  function updateTabLabel(sessionId, label) {
    const session = state.sessions.get(sessionId);
    if (!session) return;

    session.label = label;
    const labelElement = session.tabElement.querySelector('.session-tab-label');
    if (labelElement) {
      labelElement.textContent = label;
      labelElement.title = label;
    }
  }

  // ==================================================
  // URL・QR関連
  // ==================================================

  function labelForUrl(entry) {
    if (entry.type === 'mdns') return `mDNS (${entry.host})`;
    if (entry.type === 'lan') return `LAN (${entry.name})`;
    if (entry.type === 'local') return 'このPC (localhost)';
    return entry.host || entry.url || 'URL';
  }

  async function copyText(text, button) {
    const original = button.textContent;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      button.textContent = 'コピー済み';
      button.classList.add('success');
    } catch (error) {
      button.textContent = '失敗';
    }
    window.setTimeout(() => {
      button.textContent = original;
      button.classList.remove('success');
    }, 1600);
  }

  function pickBestUrl(urls) {
    return urls.find((entry) => entry.type !== 'local') || urls[0];
  }

  function renderUrlList(urls) {
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

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'copy-btn';
      copyBtn.textContent = 'コピー';
      copyBtn.addEventListener('click', () => copyText(entry.url, copyBtn));

      meta.append(label, text);
      row.append(meta, copyBtn);
      elements.urlList.appendChild(row);
    });
  }

  async function loadQr(url) {
    if (!url) return;
    elements.qrLabel.textContent = url;
    try {
      const res = await fetch(`/api/qr?text=${encodeURIComponent(url)}`, {
        headers: authHeaders()
      });
      if (res.status === 401) {
        showAuth();
        return;
      }
      if (!res.ok) {
        elements.qrLabel.textContent = 'QRの生成に失敗しました。';
        return;
      }
      const data = await res.json();
      elements.qrImage.src = data.dataUrl;
    } catch (error) {
      elements.qrLabel.textContent = 'QRの生成に失敗しました。';
    }
  }

  async function loadAddresses() {
    try {
      const res = await fetch('/api/addresses', { headers: authHeaders() });
      if (res.status === 401) {
        showAuth();
        return;
      }
      const data = await res.json();
      const urls = Array.isArray(data.urls) ? data.urls : [];
      renderUrlList(urls);
      const best = pickBestUrl(urls);
      if (best) {
        await loadQr(best.url);
      }
    } catch (error) {
      elements.urlList.textContent = '接続URLの取得に失敗しました。';
    }
  }

  // ==================================================
  // 認証関連
  // ==================================================

  function authHeaders() {
    if (!state.token) return {};
    return { Authorization: `Bearer ${state.token}` };
  }

  async function fetchConfig() {
    const res = await fetch('/api/config', { headers: authHeaders() });
    if (res.status === 401) {
      showAuth();
      throw new Error('unauthorized');
    }
    const config = await res.json();
    state.config = config;

    const allowedModes = new Set(config.modes || []);
    elements.modeGrid.querySelectorAll('[data-mode]').forEach((button) => {
      const mode = button.dataset.mode;
      const allowed = allowedModes.has(mode);
      button.disabled = !allowed || (mode === 'custom' && !config.allowCustomCommands);
      if (!allowed && state.mode === mode) {
        state.mode = allowedModes.values().next().value || 'shell';
      }
    });

    if (!config.allowCustomCommands) {
      elements.customMode.style.display = 'none';
    }

    updateModeUI();
    updateFileEditor();
  }

  function showAuth() {
    elements.authOverlay.classList.remove('hidden');
  }

  function hideAuth() {
    elements.authOverlay.classList.add('hidden');
  }

  elements.authSave.addEventListener('click', () => {
    const token = elements.authInput.value.trim();
    if (!token) return;
    state.token = token;
    localStorage.setItem('pdr_token', token);
    hideAuth();
    init();
  });

  // ==================================================
  // WebSocket管理
  // ==================================================

  function getWsUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const token = state.token ? `?token=${encodeURIComponent(state.token)}` : '';
    return `${protocol}://${window.location.host}/ws${token}`;
  }

  function handleWsMessage(event) {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch (error) {
      return;
    }

    // sessionIdが含まれている場合は該当セッションに振り分け
    const sessionId = payload.sessionId;

    if (payload.type === 'data') {
      // セッションIDがある場合は該当セッションに出力
      if (sessionId) {
        const session = state.sessions.get(sessionId);
        if (session) {
          session.term.write(payload.data);
        }
      } else {
        // 後方互換性: sessionIdがない場合はアクティブセッションに出力
        const activeSession = state.sessions.get(state.activeSessionId);
        if (activeSession) {
          activeSession.term.write(payload.data);
        }
      }
      return;
    }

    if (payload.type === 'started') {
      // セッション開始通知
      const targetSessionId = sessionId || state.activeSessionId;
      const session = state.sessions.get(targetSessionId);
      if (session) {
        session.active = true;
        session.label = payload.label || payload.mode || `セッション ${session.num}`;
        session.cwd = payload.cwd || '.';
        updateTabLabel(targetSessionId, session.label);
        if (targetSessionId === state.activeSessionId) {
          updateSessionMeta();
          updateButtons();
          sendResize();
        }
      }
      return;
    }

    if (payload.type === 'exit' || payload.type === 'stopped') {
      // セッション終了通知
      const targetSessionId = sessionId || state.activeSessionId;
      const session = state.sessions.get(targetSessionId);
      if (session) {
        session.active = false;
        if (targetSessionId === state.activeSessionId) {
          updateSessionMeta();
          updateButtons();
        }
      }
      return;
    }

    if (payload.type === 'error') {
      // エラー通知
      const targetSessionId = sessionId || state.activeSessionId;
      const session = state.sessions.get(targetSessionId);
      if (session) {
        session.term.writeln(`\r\n[エラー] ${payload.message}`);
      }
    }
  }

  // 再接続の遅延時間を計算（指数バックオフ）
  function getReconnectDelay() {
    const delay = Math.min(
      state.reconnect.baseDelay * Math.pow(2, state.reconnect.attempts),
      state.reconnect.maxDelay
    );
    return delay;
  }

  // 再接続をスケジュール
  function scheduleReconnect() {
    if (!state.reconnect.enabled || state.reconnect.manualDisconnect) {
      return;
    }

    if (state.reconnect.attempts >= state.reconnect.maxAttempts) {
      showToast('再接続の上限に達しました。手動で再接続してください。', 'error', 5000);
      return;
    }

    const delay = getReconnectDelay();
    state.reconnect.attempts += 1;

    showToast(`再接続中... (${state.reconnect.attempts}/${state.reconnect.maxAttempts})`, 'warning', delay);
    setStatus(`再接続中 (${Math.round(delay / 1000)}秒後)`, '#f0b94b');

    state.reconnect.timer = setTimeout(() => {
      connectWebSocket().catch(() => {
        // エラーはcloseイベントで処理される
      });
    }, delay);
  }

  // 再接続をキャンセル
  function cancelReconnect() {
    if (state.reconnect.timer) {
      clearTimeout(state.reconnect.timer);
      state.reconnect.timer = null;
    }
  }

  // 再接続状態をリセット
  function resetReconnect() {
    cancelReconnect();
    state.reconnect.attempts = 0;
    state.reconnect.manualDisconnect = false;
  }

  function connectWebSocket() {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    // 既存の接続があれば閉じる
    if (state.ws) {
      state.reconnect.manualDisconnect = true;
      state.ws.close();
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(getWsUrl());
      state.ws = ws;

      ws.addEventListener('open', () => {
        setStatus('接続済み', '#0b8f7a');
        // 再接続成功時
        if (state.reconnect.attempts > 0) {
          showToast('接続しました', 'success');
        }
        resetReconnect();
        resolve();
      });

      ws.addEventListener('message', handleWsMessage);

      ws.addEventListener('close', (event) => {
        setStatus('未接続', '#d95a2b');

        // 全セッションを非アクティブに
        state.sessions.forEach((session) => {
          session.active = false;
        });
        updateButtons();

        // 意図しない切断の場合は再接続を試みる
        if (!state.reconnect.manualDisconnect && state.reconnect.enabled) {
          if (state.reconnect.attempts === 0) {
            showToast('接続が切れました', 'error');
          }
          scheduleReconnect();
        }
      });

      ws.addEventListener('error', () => {
        setStatus('エラー', '#d95a2b');
        reject(new Error('ws-error'));
      });
    });
  }

  // リサイズ情報を送信（アクティブセッション）
  function sendResize() {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    if (!state.activeSessionId) return;

    const session = state.sessions.get(state.activeSessionId);
    if (!session) return;

    state.ws.send(
      JSON.stringify({
        type: 'resize',
        sessionId: state.activeSessionId,
        cols: session.term.cols,
        rows: session.term.rows
      })
    );
  }

  // ウィンドウリサイズ時の処理
  window.addEventListener('resize', () => {
    // アクティブセッションをフィット
    if (state.activeSessionId) {
      const session = state.sessions.get(state.activeSessionId);
      if (session) {
        session.fitAddon.fit();
        sendResize();
      }
    }
  });

  // ==================================================
  // セッション操作
  // ==================================================

  async function startSession() {
    if (!state.activeSessionId) {
      showToast('セッションを選択してください', 'warning');
      return;
    }

    const session = state.sessions.get(state.activeSessionId);
    if (!session) return;

    if (session.active) {
      showToast('このセッションは既に開始しています', 'warning');
      return;
    }

    try {
      await connectWebSocket();
      state.ws.send(
        JSON.stringify({
          type: 'start',
          sessionId: state.activeSessionId,
          mode: state.mode,
          cwd: elements.cwdInput.value.trim() || '.',
          command: elements.commandInput.value.trim()
        })
      );
    } catch (error) {
      session.term.writeln('\r\n[エラー] サーバーに接続できません');
    }
  }

  function stopSession() {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    if (!state.activeSessionId) return;

    const session = state.sessions.get(state.activeSessionId);
    if (!session || !session.active) return;

    state.ws.send(JSON.stringify({
      type: 'stop',
      sessionId: state.activeSessionId
    }));
  }

  function clearTerminal() {
    if (!state.activeSessionId) return;
    const session = state.sessions.get(state.activeSessionId);
    if (session) {
      session.term.clear();
    }
  }

  // ==================================================
  // イベントリスナー
  // ==================================================

  elements.modeGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mode]');
    if (!button || button.disabled) return;
    state.mode = button.dataset.mode;
    updateModeUI();
  });

  elements.startBtn.addEventListener('click', startSession);
  elements.stopBtn.addEventListener('click', stopSession);
  elements.clearBtn.addEventListener('click', clearTerminal);

  // セッション追加ボタン
  if (elements.sessionAddBtn) {
    elements.sessionAddBtn.addEventListener('click', () => {
      const session = createSession();
      if (session) {
        switchSession(session.id);
      }
    });
  }

  // ==================================================
  // ファイル管理
  // ==================================================

  const currentFile = {
    path: null
  };

  function renderFileList(items, currentPath) {
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
      elements.fileList.appendChild(row);
    });
  }

  function joinPath(base, name) {
    if (!base || base === '.') return name;
    return `${base}/${name}`;
  }

  function parentPath(current) {
    if (!current || current === '.') return '.';
    const parts = current.split('/').filter(Boolean);
    parts.pop();
    return parts.length ? parts.join('/') : '.';
  }

  async function loadFiles(path) {
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(path || '.')}`,
        { headers: authHeaders() }
      );
      if (res.status === 401) {
        showAuth();
        return;
      }
      const data = await res.json();
      renderFileList(data.items || [], data.path || '.');
    } catch (error) {
      elements.fileStatus.textContent = 'ファイル一覧の取得に失敗しました。';
    }
  }

  async function loadFile(path) {
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`,
        { headers: authHeaders() }
      );
      if (res.status === 401) {
        showAuth();
        return;
      }
      if (!res.ok) {
        const info = await res.json();
        elements.fileStatus.textContent = `読み込み失敗: ${info.error || 'unknown'}`;
        return;
      }
      const data = await res.json();
      currentFile.path = data.path;
      elements.fileName.textContent = data.path;
      elements.fileContent.value = data.content || '';
      updateFileEditor();
    } catch (error) {
      elements.fileStatus.textContent = 'ファイルの読み込みに失敗しました。';
    }
  }

  elements.fileContent.addEventListener('input', () => {
    if (!state.config || !state.config.fileWriteEnabled) return;
    elements.saveFile.disabled = !elements.fileContent.value;
  });

  elements.saveFile.addEventListener('click', async () => {
    if (!currentFile.path) return;
    elements.saveFile.disabled = true;
    try {
      const res = await fetch('/api/file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify({
          path: currentFile.path,
          content: elements.fileContent.value
        })
      });
      if (res.status === 401) {
        showAuth();
        return;
      }
      if (!res.ok) {
        const info = await res.json();
        elements.fileStatus.textContent = `保存に失敗しました: ${info.error || 'unknown'}`;
      } else {
        elements.fileStatus.textContent = '保存しました。';
      }
    } catch (error) {
      elements.fileStatus.textContent = '保存に失敗しました。';
    } finally {
      elements.saveFile.disabled = false;
    }
  });

  // タブ切り替え（ターミナル/ファイル）
  elements.tabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    const tab = button.dataset.tab;
    elements.tabs.querySelectorAll('.tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    if (tab === 'terminal') {
      elements.terminalPanel.classList.add('active');
      elements.filesPanel.classList.remove('active');
    } else {
      elements.filesPanel.classList.add('active');
      elements.terminalPanel.classList.remove('active');
    }
    // アクティブセッションをフィット
    if (state.activeSessionId) {
      const session = state.sessions.get(state.activeSessionId);
      if (session) {
        session.fitAddon.fit();
        sendResize();
      }
    }
  });

  // ==================================================
  // 初期化
  // ==================================================

  async function init() {
    try {
      await fetchConfig();
      updateModeUI();
      await loadAddresses();
      await loadFiles('.');
      elements.terminalPanel.classList.add('active');

      // 初期セッションを作成
      initSessions();
    } catch (error) {
      // Auth prompts are handled elsewhere.
    }
  }

  setStatus('未接続', '#d95a2b');
  updateButtons();
  init();
})();
