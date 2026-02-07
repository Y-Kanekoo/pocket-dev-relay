/**
 * Pocket Dev Relay サーバー
 * エントリポイント - モジュールを組み立てて起動
 */

import express from 'express';
import http from 'http';
import https from 'https';
import fsSync from 'fs';
import path from 'path';
import { WebSocketServer } from 'ws';

import {
  PORT,
  ENABLE_HTTPS,
  SSL_KEY_PATH,
  SSL_CERT_PATH,
  ENABLE_SESSION_LOGS,
  LOG_DIR,
} from './config.js';
import { buildAccessUrls } from './utils/network.js';
import { initLogDir, cleanupAllSessions } from './services/session.js';
import { setupWebSocketHandlers } from './services/websocket.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { securityHeaders } from './middleware/security.js';
import healthRouter from './routes/health.js';
import apiRouter from './routes/api.js';
import filesRouter from './routes/files.js';
import logsRouter from './routes/logs.js';
import clipboardRouter from './routes/clipboard.js';
import snippetsRouter from './routes/snippets.js';
import aiRouter from './routes/ai.js';

// Expressアプリケーション
const app = express();

// HTTPSまたはHTTPサーバーを作成
let server: http.Server | https.Server;
if (ENABLE_HTTPS) {
  if (!SSL_KEY_PATH || !SSL_CERT_PATH) {
    console.error(
      'エラー: HTTPS が有効ですが、SSL_KEY_PATH または SSL_CERT_PATH が設定されていません。',
    );
    process.exit(1);
  }
  if (!fsSync.existsSync(SSL_KEY_PATH)) {
    console.error(`エラー: 秘密鍵ファイルが見つかりません: ${SSL_KEY_PATH}`);
    process.exit(1);
  }
  if (!fsSync.existsSync(SSL_CERT_PATH)) {
    console.error(`エラー: 証明書ファイルが見つかりません: ${SSL_CERT_PATH}`);
    process.exit(1);
  }
  try {
    const httpsOptions: https.ServerOptions = {
      key: fsSync.readFileSync(SSL_KEY_PATH),
      cert: fsSync.readFileSync(SSL_CERT_PATH),
    };
    server = https.createServer(httpsOptions, app);
    console.log('HTTPS モードで起動します');
  } catch (error) {
    const err = error as Error;
    console.error(`エラー: SSL証明書の読み込みに失敗しました: ${err.message}`);
    process.exit(1);
  }
} else {
  server = http.createServer(app);
}

// WebSocketサーバー
const wss = new WebSocketServer({ server, path: '/ws' });
setupWebSocketHandlers(wss);

// セキュリティヘッダー（全リクエストに適用）
app.use(securityHeaders);

// ミドルウェア
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor', express.static(path.join(__dirname, '..', 'node_modules')));

// ヘルスチェック（認証・レート制限の前に配置）
app.use(healthRouter);

// APIレート制限
app.use('/api', createRateLimiter());

// ルーター
app.use('/api', apiRouter);
app.use('/api', filesRouter);
app.use('/api', logsRouter);
app.use('/api', clipboardRouter);
app.use('/api', snippetsRouter);
app.use('/api', aiRouter);

// エラーハンドリング
app.use(notFoundHandler);
app.use(errorHandler);

// サーバー起動
server.listen(PORT, '0.0.0.0', async () => {
  if (ENABLE_SESSION_LOGS) {
    await initLogDir();
    console.log(`セッションログ: 有効 (${LOG_DIR})`);
  }

  const protocol = ENABLE_HTTPS ? 'https' : 'http';
  console.log('Pocket Dev Relay is running.');
  console.log(`Local: ${protocol}://localhost:${PORT}`);
  buildAccessUrls()
    .filter((entry) => entry.type === 'lan')
    .forEach((entry) => {
      console.log(`LAN (${entry.name}): ${entry.url}`);
    });
});

// シグナルハンドラ
process.on('SIGINT', () => {
  cleanupAllSessions();
  process.exit(0);
});
