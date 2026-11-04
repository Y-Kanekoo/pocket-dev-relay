/**
 * JSON永続化ユーティリティ
 * スニペット・クリップボード等のデータをJSONファイルに永続化する
 */

import fsSync from 'fs';
import path from 'path';
import { DATA_DIR } from '../config.js';
import logger from '../services/logger.js';

/**
 * JSONファイルベースの永続化ストア
 * データサイズが小さいため同期I/Oを使用
 */
export class JsonStore<T> {
  private readonly filePath: string;

  constructor(
    filename: string,
    private readonly defaultValue: T,
  ) {
    this.filePath = path.join(DATA_DIR, filename);
  }

  /** DATA_DIR を作成（存在しない場合） */
  initDir(): void {
    if (!fsSync.existsSync(DATA_DIR)) {
      fsSync.mkdirSync(DATA_DIR, { recursive: true });
      logger.info('データディレクトリを作成しました: %s', DATA_DIR);
    }
  }

  /** ファイルからデータを読み込む。ファイルが存在しないかパース失敗時はデフォルト値を返す */
  load(): T {
    try {
      if (!fsSync.existsSync(this.filePath)) {
        return this.defaultValue;
      }
      const raw = fsSync.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch (err) {
      logger.warn({ err }, 'データファイルの読み込みに失敗しました: %s', this.filePath);
      return this.defaultValue;
    }
  }

  /** データをファイルに保存する（アトミック書き込み: 一時ファイル → rename）。成功時true、失敗時false */
  save(data: T): boolean {
    try {
      this.initDir();
      const tmpPath = this.filePath + '.tmp';
      fsSync.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fsSync.renameSync(tmpPath, this.filePath);
      return true;
    } catch (err) {
      logger.error({ err }, 'データファイルの保存に失敗しました: %s', this.filePath);
      return false;
    }
  }
}
