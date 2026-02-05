/**
 * 設定値の管理
 * 環境変数から読み込んだ設定をエクスポート
 */

import path from 'path';
import dotenv from 'dotenv';

// 環境変数の読み込み
dotenv.config();

// ============================================================
// サーバー設定
// ============================================================

/** サーバーポート */
export const PORT: number = parseInt(process.env.PORT || '4173', 10);

/** ワークスペースルートディレクトリ */
export const ROOT_DIR: string = path.resolve(process.env.WORKSPACE_ROOT || process.cwd());

/** 認証トークン（空の場合は認証無効） */
export const AUTH_TOKEN: string = process.env.AUTH_TOKEN || '';

/** カスタムコマンドの許可 */
export const ALLOW_CUSTOM_COMMANDS: boolean = process.env.ALLOW_CUSTOM_COMMANDS === 'true';

/** ファイル書き込みの許可 */
export const ALLOW_FILE_WRITE: boolean = process.env.ALLOW_FILE_WRITE === 'true';

/** 最大ファイルサイズ（バイト） */
export const MAX_FILE_SIZE: number = parseInt(process.env.MAX_FILE_SIZE || '1048576', 10);

/** セッションログの有効化 */
export const ENABLE_SESSION_LOGS: boolean = process.env.ENABLE_SESSION_LOGS === 'true';

/** ログディレクトリ */
export const LOG_DIR: string = path.resolve(process.env.LOG_DIR || path.join(ROOT_DIR, 'logs'));

/** シェルコマンド */
export const SHELL_CMD: string = process.env.SHELL_CMD || process.env.SHELL || 'zsh';

// ============================================================
// HTTPS設定
// ============================================================

/** HTTPS有効化フラグ */
export const ENABLE_HTTPS: boolean = process.env.ENABLE_HTTPS === 'true';

/** SSL秘密鍵パス */
export const SSL_KEY_PATH: string = process.env.SSL_KEY_PATH || '';

/** SSL証明書パス */
export const SSL_CERT_PATH: string = process.env.SSL_CERT_PATH || '';
