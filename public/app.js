(() => {
  const state = {
    mode: 'codex',
    ws: null,
    sessionActive: false,
    sessionLabel: '',
    sessionCwd: '',
    config: null,
    token: localStorage.getItem('pdr_token') || '',
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
    toastContainer: document.getElementById('toast-container')
  };

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

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
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
  term.open(document.getElementById('terminal'));
  fitAddon.fit();

  window.addEventListener('resize', () => {
    fitAddon.fit();
    sendResize();
  });

  term.onData((data) => {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(JSON.stringify({ type: 'input', data }));
  });

  function setStatus(text, color) {
    elements.statusText.textContent = text;
    elements.wsDot.style.background = color;
    elements.wsDot.style.boxShadow = `0 0 12px ${color}`;
  }

  function setSessionMeta() {
    if (!state.sessionActive) {
      elements.sessionMeta.textContent = 'セッション未開始';
      return;
    }
    elements.sessionMeta.textContent = `${state.sessionLabel} - ${state.sessionCwd}`;
  }

  function updateButtons() {
    elements.startBtn.disabled = state.sessionActive;
    elements.stopBtn.disabled = !state.sessionActive;
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

    if (payload.type === 'data') {
      term.write(payload.data);
      return;
    }

    if (payload.type === 'started') {
      state.sessionActive = true;
      state.sessionLabel = payload.label || payload.mode;
      state.sessionCwd = payload.cwd || '.';
      setSessionMeta();
      updateButtons();
      sendResize();
      return;
    }

    if (payload.type === 'exit' || payload.type === 'stopped') {
      state.sessionActive = false;
      setSessionMeta();
      updateButtons();
      return;
    }

    if (payload.type === 'error') {
      term.writeln(`\r\n[エラー] ${payload.message}`);
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
        state.sessionActive = false;
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

  function sendResize() {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(
      JSON.stringify({
        type: 'resize',
        cols: term.cols,
        rows: term.rows
      })
    );
  }

  async function startSession() {
    try {
      await connectWebSocket();
      state.ws.send(
        JSON.stringify({
          type: 'start',
          mode: state.mode,
          cwd: elements.cwdInput.value.trim() || '.',
          command: elements.commandInput.value.trim()
        })
      );
    } catch (error) {
      term.writeln('\r\n[エラー] サーバーに接続できません');
    }
  }

  function stopSession() {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    // 手動停止なので再接続しない
    state.reconnect.manualDisconnect = true;
    state.ws.send(JSON.stringify({ type: 'stop' }));
  }

  function clearTerminal() {
    term.clear();
  }

  elements.modeGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mode]');
    if (!button || button.disabled) return;
    state.mode = button.dataset.mode;
    updateModeUI();
  });

  elements.startBtn.addEventListener('click', startSession);
  elements.stopBtn.addEventListener('click', stopSession);
  elements.clearBtn.addEventListener('click', clearTerminal);

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
    fitAddon.fit();
    sendResize();
  });

  async function init() {
    try {
      await fetchConfig();
      updateModeUI();
      await loadAddresses();
      await loadFiles('.');
      elements.terminalPanel.classList.add('active');
    } catch (error) {
      // Auth prompts are handled elsewhere.
    }
  }

  setStatus('未接続', '#d95a2b');
  updateButtons();
  init();
})();
