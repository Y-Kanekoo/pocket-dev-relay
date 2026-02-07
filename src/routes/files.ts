/**
 * ファイルルーター
 * /api/files, /api/file エンドポイント
 */

import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';

import { FileItem, FileListResponse, FileContentResponse } from '../types/index.js';
import { ROOT_DIR, ALLOW_FILE_WRITE, MAX_FILE_SIZE } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolvePath, convertFsError } from '../utils/path.js';
import {
  FileTypeError,
  FileTooLargeError,
  FeatureDisabledError,
  ValidationError,
} from '../errors/AppError.js';

const router = Router();

/**
 * GET /api/files - ディレクトリ一覧を取得
 */
router.get(
  '/files',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const relativePath = (req.query.path as string) || '.';
    let targetPath: string;

    try {
      targetPath = resolvePath(relativePath);
    } catch (error) {
      throw convertFsError(error, 'パス');
    }

    let stats;
    try {
      stats = await fs.stat(targetPath);
    } catch (error) {
      throw convertFsError(error, 'ディレクトリ');
    }

    if (!stats.isDirectory()) {
      throw new FileTypeError('directory', 'file');
    }

    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const items: FileItem[] = entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'dir' : 'file',
    }));

    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const response: FileListResponse = {
      path: path.relative(ROOT_DIR, targetPath) || '.',
      items,
    };
    res.json(response);
  }),
);

/**
 * GET /api/file - ファイル内容を取得
 */
router.get(
  '/file',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const relativePath = (req.query.path as string) || '';
    let targetPath: string;

    try {
      targetPath = resolvePath(relativePath);
    } catch (error) {
      throw convertFsError(error, 'パス');
    }

    let stats;
    try {
      stats = await fs.stat(targetPath);
    } catch (error) {
      throw convertFsError(error, 'ファイル');
    }

    if (!stats.isFile()) {
      throw new FileTypeError('file', 'directory');
    }

    if (stats.size > MAX_FILE_SIZE) {
      throw new FileTooLargeError(MAX_FILE_SIZE, stats.size);
    }

    const content = await fs.readFile(targetPath, 'utf8');
    const response: FileContentResponse = {
      path: path.relative(ROOT_DIR, targetPath) || '.',
      content,
    };
    res.json(response);
  }),
);

/**
 * POST /api/file - ファイルを書き込み
 */
router.post(
  '/file',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!ALLOW_FILE_WRITE) {
      throw new FeatureDisabledError('ファイル書き込み');
    }

    const relativePath = (req.body.path as string) || '';
    const content = req.body.content;
    if (typeof content !== 'string') {
      throw new ValidationError('コンテンツが不正です');
    }

    let targetPath: string;
    try {
      targetPath = resolvePath(relativePath);
    } catch (error) {
      throw convertFsError(error, 'パス');
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, 'utf8');
    res.json({ ok: true });
  }),
);

export default router;
