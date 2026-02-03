const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const QRCode = require('qrcode');
const { nanoid } = require('nanoid');

require('dotenv').config();

const PORT = parseInt(process.env.PORT || '4173', 10);
const ROOT_DIR = path.resolve(process.env.WORKSPACE_ROOT || process.cwd());
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const ALLOW_CUSTOM_COMMANDS = process.env.ALLOW_CUSTOM_COMMANDS === 'true';
const ALLOW_FILE_WRITE = process.env.ALLOW_FILE_WRITE === 'true';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '1048576', 10);
const ENABLE_SESSION_LOGS = process.env.ENABLE_SESSION_LOGS === 'true';
const LOG_DIR = path.resolve(process.env.LOG_DIR || path.join(ROOT_DIR, 'logs'));

const SHELL_CMD = process.env.SHELL_CMD || process.env.SHELL || 'zsh';

// セッションログ用のメタデータを保存
const sessionLogs = new Map();

// ログディレクトリの初期化
async function initLogDir() {
  if (!ENABLE_SESSION_LOGS) return;
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (error) {
    console.error('ログディレクトリの作成に失敗しました:', error.message);
  }
}

// ログファイル名を生成
function generateLogFileName(sessionId, mode) {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `session-${timestamp}-${mode}-${sessionId}.log`;
}

// ANSIエスケープシーケンスを除去
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

function parseArgs(input) {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch (error) {
    // Fall through to split parser.
  }
  return splitArgs(input);
}

function splitArgs(input) {
  const args = [];
  let current = '';
  let quote = null;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === '\\' && i + 1 < input.length) {
        i += 1;
        current += input[i];
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    if (char === '\\' && i + 1 < input.length) {
      i += 1;
      current += input[i];
      continue;
    }

    current += char;
  }

  if (current) args.push(current);
  return args;
}

const PRESETS = {
  codex: {
    label: 'Codex CLI',
    command: process.env.CODEX_CMD || 'codex',
    args: parseArgs(process.env.CODEX_ARGS)
  },
  claude: {
    label: 'Claude Code',
    command: process.env.CLAUDE_CMD || 'claude',
    args: parseArgs(process.env.CLAUDE_ARGS)
  },
  shell: {
    label: 'Shell',
    command: SHELL_CMD,
    args: parseArgs(process.env.SHELL_ARGS)
  }
};

function isAuthorizedHeader(header) {
  if (!AUTH_TOKEN) return true;
  return header === `Bearer ${AUTH_TOKEN}`;
}

function authMiddleware(req, res, next) {
  if (!AUTH_TOKEN) return next();
  if (isAuthorizedHeader(req.headers.authorization)) return next();
  res.status(401).json({ error: 'unauthorized' });
}

function resolvePath(relativePath) {
  const safePath = path.resolve(ROOT_DIR, relativePath || '.');
  const relative = path.relative(ROOT_DIR, safePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path outside workspace root');
  }
  return safePath;
}

function respondFsError(res, error, fallback) {
  if (error && error.message === 'Path outside workspace root') {
    return res.status(400).json({ error: 'invalid-path' });
  }
  if (error && error.code === 'ENOENT') {
    return res.status(404).json({ error: 'not-found' });
  }
  return res.status(500).json({ error: fallback || 'server-error' });
}

function listInterfaceAddresses() {
  const entries = [];
  const nets = os.networkInterfaces();
  Object.entries(nets).forEach(([name, ifaceList]) => {
    ifaceList.forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        entries.push({ name, address: iface.address });
      }
    });
  });
  return entries;
}

function normalizeMdns(hostname) {
  if (!hostname) return '';
  return hostname.includes('.') ? hostname : `${hostname}.local`;
}

function buildAccessUrls() {
  const urls = [];
  const hostname = os.hostname();
  const mdnsHost = normalizeMdns(hostname);

  if (mdnsHost) {
    urls.push({
      type: 'mdns',
      name: hostname,
      host: mdnsHost,
      url: `http://${mdnsHost}:${PORT}`
    });
  }

  listInterfaceAddresses().forEach((entry) => {
    urls.push({
      type: 'lan',
      name: entry.name,
      host: entry.address,
      url: `http://${entry.address}:${PORT}`
    });
  });

  urls.push({
    type: 'local',
    name: 'localhost',
    host: 'localhost',
    url: `http://localhost:${PORT}`
  });

  const seen = new Set();
  return urls.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules')));

app.get('/api/config', authMiddleware, (req, res) => {
  res.json({
    workspaceRoot: ROOT_DIR,
    workspaceName: path.basename(ROOT_DIR),
    modes: Object.keys(PRESETS),
    allowCustomCommands: ALLOW_CUSTOM_COMMANDS,
    fileWriteEnabled: ALLOW_FILE_WRITE,
    authEnabled: Boolean(AUTH_TOKEN),
    maxFileSize: MAX_FILE_SIZE,
    sessionLogsEnabled: ENABLE_SESSION_LOGS
  });
});

app.get('/api/addresses', authMiddleware, (req, res) => {
  res.json({
    port: PORT,
    urls: buildAccessUrls()
  });
});

app.get('/api/qr', authMiddleware, async (req, res) => {
  const text = String(req.query.text || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'missing-text' });
  }
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      margin: 1,
      scale: 6,
      color: {
        dark: '#1f1a14',
        light: '#ffffff'
      }
    });
    res.json({ dataUrl });
  } catch (error) {
    res.status(500).json({ error: 'failed-to-generate' });
  }
});

app.get('/api/files', authMiddleware, async (req, res) => {
  try {
    const relativePath = req.query.path || '.';
    const targetPath = resolvePath(relativePath);
    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'not-a-directory' });
    }

    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const items = entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'dir' : 'file'
    }));

    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      path: path.relative(ROOT_DIR, targetPath) || '.',
      items
    });
  } catch (error) {
    respondFsError(res, error, 'failed-to-list');
  }
});

app.get('/api/file', authMiddleware, async (req, res) => {
  try {
    const relativePath = req.query.path || '';
    const targetPath = resolvePath(relativePath);
    const stats = await fs.stat(targetPath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'not-a-file' });
    }
    if (stats.size > MAX_FILE_SIZE) {
      return res.status(413).json({
        error: 'file-too-large',
        size: stats.size,
        maxSize: MAX_FILE_SIZE
      });
    }

    const content = await fs.readFile(targetPath, 'utf8');
    res.json({
      path: path.relative(ROOT_DIR, targetPath) || '.',
      content
    });
  } catch (error) {
    respondFsError(res, error, 'failed-to-read');
  }
});

app.post('/api/file', authMiddleware, async (req, res) => {
  if (!ALLOW_FILE_WRITE) {
    return res.status(403).json({ error: 'file-write-disabled' });
  }

  try {
    const relativePath = req.body.path || '';
    const content = req.body.content;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'invalid-content' });
    }

    const targetPath = resolvePath(relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, 'utf8');
    res.json({ ok: true });
  } catch (error) {
    respondFsError(res, error, 'failed-to-write');
  }
});

// セッションログ一覧を取得
app.get('/api/logs', authMiddleware, async (req, res) => {
  if (!ENABLE_SESSION_LOGS) {
    return res.status(403).json({ error: 'session-logs-disabled' });
  }

  try {
    // ディスク上のログファイルを取得
    const files = await fs.readdir(LOG_DIR).catch(() => []);
    const logFiles = files
      .filter((f) => f.startsWith('session-') && f.endsWith('.log'))
      .sort()
      .reverse();

    // メタデータとマージ
    const logs = await Promise.all(
      logFiles.map(async (fileName) => {
        // メモリ上のメタデータを検索
        for (const [, meta] of sessionLogs) {
          if (meta.fileName === fileName) {
            return meta;
          }
        }
        // メタデータがない場合はファイル情報から生成
        const filePath = path.join(LOG_DIR, fileName);
        const stats = await fs.stat(filePath).catch(() => null);
        return {
          fileName,
          startedAt: stats ? stats.birthtime.toISOString() : null,
          size: stats ? stats.size : 0
        };
      })
    );

    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'failed-to-list-logs' });
  }
});

// セッションログ内容を取得
app.get('/api/log/:fileName', authMiddleware, async (req, res) => {
  if (!ENABLE_SESSION_LOGS) {
    return res.status(403).json({ error: 'session-logs-disabled' });
  }

  try {
    const fileName = req.params.fileName;
    // ディレクトリトラバーサル防止
    if (fileName.includes('/') || fileName.includes('..')) {
      return res.status(400).json({ error: 'invalid-filename' });
    }
    if (!fileName.startsWith('session-') || !fileName.endsWith('.log')) {
      return res.status(400).json({ error: 'invalid-filename' });
    }

    const logPath = path.join(LOG_DIR, fileName);
    const content = await fs.readFile(logPath, 'utf8');
    res.json({ fileName, content });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'log-not-found' });
    }
    res.status(500).json({ error: 'failed-to-read-log' });
  }
});

const sessions = new Map();

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function getTokenFromRequest(req) {
  const url = new URL(req.url, 'http://localhost');
  return url.searchParams.get('token') || '';
}

function authorizeWebSocket(req) {
  if (!AUTH_TOKEN) return true;
  return getTokenFromRequest(req) === AUTH_TOKEN;
}

function resolveCwd(requested) {
  if (!requested) return ROOT_DIR;
  return resolvePath(requested);
}

function spawnForMode(mode, customCommand) {
  if (mode === 'custom') {
    if (!ALLOW_CUSTOM_COMMANDS) {
      throw new Error('custom-commands-disabled');
    }
    const parts = splitArgs(customCommand || '');
    const command = parts.shift();
    if (!command) {
      throw new Error('missing-command');
    }
    return { command, args: parts, label: 'Custom' };
  }

  const preset = PRESETS[mode];
  if (!preset) {
    throw new Error('unknown-mode');
  }

  return { command: preset.command, args: preset.args, label: preset.label };
}

async function startSession({ mode, cwd, customCommand }, ws) {
  const spawnConfig = spawnForMode(mode, customCommand);
  const sessionId = nanoid(10);
  const startDir = resolveCwd(cwd || '.');

  const ptyProcess = pty.spawn(spawnConfig.command, spawnConfig.args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: startDir,
    env: { ...process.env, TERM: 'xterm-256color' }
  });

  // ログファイルのセットアップ
  let logStream = null;
  let logFileName = null;
  if (ENABLE_SESSION_LOGS) {
    logFileName = generateLogFileName(sessionId, mode);
    const logPath = path.join(LOG_DIR, logFileName);
    try {
      const { createWriteStream } = await import('fs');
      logStream = createWriteStream(logPath, { flags: 'a' });
      // ログヘッダーを書き込み
      const header = `=== セッション開始 ===\n日時: ${new Date().toISOString()}\nモード: ${spawnConfig.label}\nディレクトリ: ${startDir}\nコマンド: ${spawnConfig.command} ${spawnConfig.args.join(' ')}\n${'='.repeat(40)}\n\n`;
      logStream.write(header);
      // メタデータを保存
      sessionLogs.set(sessionId, {
        id: sessionId,
        fileName: logFileName,
        mode,
        label: spawnConfig.label,
        cwd: path.relative(ROOT_DIR, startDir) || '.',
        startedAt: new Date().toISOString(),
        endedAt: null
      });
    } catch (error) {
      console.error('ログファイルの作成に失敗しました:', error.message);
    }
  }

  const session = {
    id: sessionId,
    mode,
    cwd: path.relative(ROOT_DIR, startDir) || '.',
    label: spawnConfig.label,
    pty: ptyProcess,
    ws,
    logStream,
    logFileName
  };

  sessions.set(sessionId, session);

  ptyProcess.onData((data) => {
    send(ws, { type: 'data', data });
    // ログに書き込み（ANSIコードを除去）
    if (logStream) {
      logStream.write(stripAnsi(data));
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    send(ws, { type: 'exit', exitCode, signal });
    // ログを閉じる
    if (logStream) {
      const footer = `\n${'='.repeat(40)}\n=== セッション終了 ===\n日時: ${new Date().toISOString()}\n終了コード: ${exitCode}\nシグナル: ${signal || 'なし'}\n`;
      logStream.write(footer);
      logStream.end();
      // メタデータを更新
      const logMeta = sessionLogs.get(sessionId);
      if (logMeta) {
        logMeta.endedAt = new Date().toISOString();
        logMeta.exitCode = exitCode;
      }
    }
    sessions.delete(sessionId);
  });

  return session;
}

function stopSession(sessionId, reason) {
  const session = sessions.get(sessionId);
  if (!session) return;
  try {
    session.pty.kill();
  } catch (error) {
    // Ignore kill errors.
  }
  // ログストリームを閉じる
  if (session.logStream) {
    const footer = `\n${'='.repeat(40)}\n=== セッション停止 ===\n日時: ${new Date().toISOString()}\n理由: ${reason}\n`;
    session.logStream.write(footer);
    session.logStream.end();
    // メタデータを更新
    const logMeta = sessionLogs.get(sessionId);
    if (logMeta) {
      logMeta.endedAt = new Date().toISOString();
      logMeta.stopReason = reason;
    }
  }
  sessions.delete(sessionId);
  if (session.ws) {
    send(session.ws, { type: 'stopped', reason });
  }
}

wss.on('connection', (ws, req) => {
  if (!authorizeWebSocket(req)) {
    ws.close(4001, 'unauthorized');
    return;
  }

  let activeSessionId = null;

  ws.on('message', (message) => {
    let payload;
    try {
      payload = JSON.parse(message);
    } catch (error) {
      return;
    }

    if (payload.type === 'start') {
      if (activeSessionId) {
        send(ws, { type: 'error', message: 'session-already-running' });
        return;
      }

      try {
        const session = startSession(
          {
            mode: payload.mode,
            cwd: payload.cwd,
            customCommand: payload.command
          },
          ws
        );
        activeSessionId = session.id;
        send(ws, {
          type: 'started',
          sessionId: session.id,
          mode: session.mode,
          cwd: session.cwd,
          label: session.label
        });
      } catch (error) {
        send(ws, { type: 'error', message: error.message || 'failed-to-start' });
      }
      return;
    }

    if (!activeSessionId) return;

    const session = sessions.get(activeSessionId);
    if (!session) return;

    if (payload.type === 'input' && typeof payload.data === 'string') {
      session.pty.write(payload.data);
    } else if (payload.type === 'resize') {
      const cols = Number(payload.cols);
      const rows = Number(payload.rows);
      if (Number.isInteger(cols) && Number.isInteger(rows)) {
        session.pty.resize(cols, rows);
      }
    } else if (payload.type === 'stop') {
      stopSession(activeSessionId, 'client-stop');
      activeSessionId = null;
    }
  });

  ws.on('close', () => {
    if (activeSessionId) {
      stopSession(activeSessionId, 'client-disconnect');
    }
  });
});

server.listen(PORT, '0.0.0.0', async () => {
  // ログディレクトリを初期化
  if (ENABLE_SESSION_LOGS) {
    await initLogDir();
    console.log(`セッションログ: 有効 (${LOG_DIR})`);
  }

  console.log('Pocket Dev Relay is running.');
  console.log(`Local: http://localhost:${PORT}`);
  buildAccessUrls()
    .filter((entry) => entry.type === 'lan')
    .forEach((entry) => {
      console.log(`LAN (${entry.name}): ${entry.url}`);
    });
});

process.on('SIGINT', () => {
  sessions.forEach((session) => {
    try {
      session.pty.kill();
    } catch (error) {
      // Ignore cleanup errors.
    }
  });
  process.exit(0);
});
