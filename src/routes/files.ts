/**
 * ファイルルーター
 * /api/files, /api/file, /api/upload エンドポイント
 */

import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';

import { FileItem, FileListResponse, FileContentResponse, UploadResponse } from '../types/index.js';
import { ROOT_DIR, ALLOW_FILE_WRITE, MAX_FILE_SIZE, MAX_UPLOAD_SIZE } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolvePath, convertFsError } from '../utils/path.js';
import {
  FileTypeError,
  FileTooLargeError,
  FeatureDisabledError,
  ValidationError,
  InvalidPathError,
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

// ============================================================
// ファイルアップロード
// ============================================================

/**
 * multerストレージ設定
 * アップロード先をリクエストのuploadPathパラメータで制御
 */
const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    // 一時的にROOT_DIRに保存（実際のパスはリクエスト処理時に移動）
    cb(null, ROOT_DIR);
  },
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    // オリジナルファイル名を使用
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
  },
});

/**
 * POST /api/upload - ファイルをアップロード
 * マルチパート形式でファイルを受け取り、指定パスに保存
 */
router.post(
  '/upload',
  authMiddleware,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!ALLOW_FILE_WRITE) {
      // アップロードされたファイルを削除
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch {
          // 削除失敗は無視
        }
      }
      throw new FeatureDisabledError('ファイルアップロード');
    }

    if (!req.file) {
      throw new ValidationError('ファイルが選択されていません');
    }

    // アップロード先のディレクトリ（クエリパラメータまたはbodyで指定）
    const uploadDir = (req.body.uploadPath as string) || '.';

    // パストラバーサル防止
    let targetDir: string;
    try {
      targetDir = resolvePath(uploadDir);
    } catch (error) {
      // アップロードされたファイルを削除
      try {
        await fs.unlink(req.file.path);
      } catch {
        // 削除失敗は無視
      }
      throw convertFsError(error, 'パス');
    }

    // ファイル名のサニタイズ（パストラバーサル防止）
    const safeFileName = path.basename(req.file.originalname);
    if (!safeFileName || safeFileName === '.' || safeFileName === '..') {
      try {
        await fs.unlink(req.file.path);
      } catch {
        // 削除失敗は無視
      }
      throw new InvalidPathError('不正なファイル名です');
    }

    const targetPath = path.join(targetDir, safeFileName);

    // ターゲットパスがROOT_DIR内にあることを再度検証
    const relative = path.relative(ROOT_DIR, targetPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      try {
        await fs.unlink(req.file.path);
      } catch {
        // 削除失敗は無視
      }
      throw new InvalidPathError();
    }

    // ディレクトリを作成（存在しない場合）
    await fs.mkdir(targetDir, { recursive: true });

    // multerがROOT_DIRに保存したファイルを目的のパスに移動
    const sourcePath = req.file.path;
    if (sourcePath !== targetPath) {
      await fs.rename(sourcePath, targetPath);
    }

    const response: UploadResponse = {
      ok: true,
      fileName: safeFileName,
      path: path.relative(ROOT_DIR, targetPath),
      size: req.file.size,
    };
    res.json(response);
  }),
);

export default router;
