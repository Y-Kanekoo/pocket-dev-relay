/**
 * APIルーター統合モジュール
 * 全APIルーターを結合して単一のルーターとしてエクスポート
 */

import { Router } from 'express';
import apiRouter from './api.js';
import filesRouter from './files.js';
import logsRouter from './logs.js';
import clipboardRouter from './clipboard.js';
import snippetsRouter from './snippets.js';
import aiRouter from './ai.js';

const combinedRouter = Router();

// 各APIルーターを統合
combinedRouter.use(apiRouter);
combinedRouter.use(filesRouter);
combinedRouter.use(logsRouter);
combinedRouter.use(clipboardRouter);
combinedRouter.use(snippetsRouter);
combinedRouter.use(aiRouter);

export default combinedRouter;
