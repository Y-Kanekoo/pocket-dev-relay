/**
 * APIルーター
 * /api/config, /api/addresses, /api/qr エンドポイント
 */

import { Router, Request, Response } from 'express';
import path from 'path';

import {
  SessionMode,
  AppConfig,
  AddressesResponse,
  QrResponse,
} from '../types/index.js';
import {
  PORT,
  ROOT_DIR,
  AUTH_TOKEN,
  ALLOW_CUSTOM_COMMANDS,
  ALLOW_FILE_WRITE,
  MAX_FILE_SIZE,
  ENABLE_SESSION_LOGS,
} from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { buildAccessUrls } from '../utils/network.js';
import { PRESETS } from '../services/pty.js';
import { ValidationError } from '../errors/AppError.js';

// QRCodeの型定義（@types/qrcodeがないため独自定義）
interface QRCodeToDataURLOptions {
  margin?: number;
  scale?: number;
  color?: {
    dark?: string;
    light?: string;
  };
}

// QRCode モジュールのインポート（CommonJSモジュール）
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode: {
  toDataURL: (text: string, options?: QRCodeToDataURLOptions) => Promise<string>;
} = require('qrcode');

const router = Router();

/**
 * GET /api/config - アプリケーション設定を取得
 */
router.get('/config', authMiddleware, (_req: Request, res: Response) => {
  const config: AppConfig = {
    workspaceRoot: ROOT_DIR,
    workspaceName: path.basename(ROOT_DIR),
    modes: Object.keys(PRESETS) as SessionMode[],
    allowCustomCommands: ALLOW_CUSTOM_COMMANDS,
    fileWriteEnabled: ALLOW_FILE_WRITE,
    authEnabled: Boolean(AUTH_TOKEN),
    maxFileSize: MAX_FILE_SIZE,
    sessionLogsEnabled: ENABLE_SESSION_LOGS,
  };
  res.json(config);
});

/**
 * GET /api/addresses - アクセスURL一覧を取得
 */
router.get('/addresses', authMiddleware, (_req: Request, res: Response) => {
  const response: AddressesResponse = {
    port: PORT,
    urls: buildAccessUrls(),
  };
  res.json(response);
});

/**
 * GET /api/qr - QRコードを生成
 */
router.get('/qr', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const text = String(req.query.text || '').trim();
  if (!text) {
    throw new ValidationError('テキストが指定されていません');
  }

  const dataUrl = await QRCode.toDataURL(text, {
    margin: 1,
    scale: 6,
    color: {
      dark: '#1f1a14',
      light: '#ffffff',
    },
  });
  const response: QrResponse = { dataUrl };
  res.json(response);
}));

export default router;
