/**
 * 設定値の管理
 * 環境変数から読み込んだ設定をエクスポート
 */

import { readFileSync } from 'fs';
import os from 'os';
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

/** ログレベル */
export const LOG_LEVEL: string = process.env.LOG_LEVEL || 'info';

/** セッションログの有効化 */
export const ENABLE_SESSION_LOGS: boolean = process.env.ENABLE_SESSION_LOGS === 'true';

/** ログディレクトリ */
export const LOG_DIR: string = path.resolve(process.env.LOG_DIR || path.join(ROOT_DIR, 'logs'));

/** ログ保持日数（デフォルト: 30日） */
export const LOG_MAX_AGE_DAYS: number = parseInt(process.env.LOG_MAX_AGE_DAYS || '30', 10);

/** ログ最大サイズ（MB、デフォルト: 100MB） */
export const LOG_MAX_SIZE_MB: number = parseInt(process.env.LOG_MAX_SIZE_MB || '100', 10);

/** シェルコマンド */
export const SHELL_CMD: string = process.env.SHELL_CMD || process.env.SHELL || 'zsh';

/** アップロード最大サイズ（バイト）デフォルト10MB */
export const MAX_UPLOAD_SIZE: number = parseInt(process.env.MAX_UPLOAD_SIZE || '10485760', 10);

// ============================================================
// AI設定
// ============================================================

/** AIプロバイダー（'claude' | 'openai' | null） */
export const AI_PROVIDER: 'claude' | 'openai' | null = process.env.ANTHROPIC_API_KEY
  ? 'claude'
  : process.env.OPENAI_API_KEY
    ? 'openai'
    : null;

/** Anthropic APIキー */
export const ANTHROPIC_API_KEY: string = process.env.ANTHROPIC_API_KEY || '';

/** OpenAI APIキー */
export const OPENAI_API_KEY: string = process.env.OPENAI_API_KEY || '';

/** AIモデル名（未指定時はプロバイダーに応じたデフォルト値） */
export const AI_MODEL: string =
  process.env.AI_MODEL ||
  (process.env.ANTHROPIC_API_KEY ? 'claude-sonnet-4-5-20250929' : 'gpt-4o');

/** AI解析に送信するターミナル出力の最大行数 */
export const AI_MAX_CONTEXT_LINES: number = parseInt(process.env.AI_MAX_CONTEXT_LINES || '100', 10);

// ============================================================
// HTTPS設定
// ============================================================

/** HTTPS有効化フラグ */
export const ENABLE_HTTPS: boolean = process.env.ENABLE_HTTPS === 'true';

/** SSL秘密鍵パス */
export const SSL_KEY_PATH: string = process.env.SSL_KEY_PATH || '';

/** SSL証明書パス */
export const SSL_CERT_PATH: string = process.env.SSL_CERT_PATH || '';

// ============================================================
// レート制限設定
// ============================================================

/** API全体のレート制限（リクエスト数/分） */
export const RATE_LIMIT_API: number = parseInt(process.env.RATE_LIMIT_API || '100', 10);

/** 認証失敗のレート制限（回数/分） */
export const RATE_LIMIT_AUTH: number = parseInt(process.env.RATE_LIMIT_AUTH || '5', 10);

// ============================================================
// セッションタイムアウト設定
// ============================================================

/** セッションタイムアウト（ミリ秒、デフォルト1時間） */
export const SESSION_TIMEOUT: number = parseInt(process.env.SESSION_TIMEOUT || '3600000', 10);

// ============================================================
// SSH設定
// ============================================================

/** SSH機能の有効化 */
export const ENABLE_SSH: boolean = process.env.ENABLE_SSH === 'true';

/** SSHデフォルトホスト */
export const SSH_DEFAULT_HOST: string = process.env.SSH_DEFAULT_HOST || '';

/** SSHデフォルトポート */
export const SSH_DEFAULT_PORT: number = parseInt(process.env.SSH_DEFAULT_PORT || '22', 10);

/** SSHデフォルトユーザー */
export const SSH_DEFAULT_USER: string = process.env.SSH_DEFAULT_USER || '';

/** SSH秘密鍵パス */
export const SSH_KEY_PATH: string = process.env.SSH_KEY_PATH || path.join(os.homedir(), '.ssh', 'id_rsa');

/** SSHホスト鍵の厳格な検証（デフォルト: true） */
export const SSH_STRICT_HOST_KEY: boolean = process.env.SSH_STRICT_HOST_KEY !== 'false';

/** SSHパスワード認証にHTTPSを要求する（デフォルト: true） */
export const SSH_REQUIRE_HTTPS_FOR_PASSWORD: boolean = process.env.SSH_REQUIRE_HTTPS_FOR_PASSWORD !== 'false';

// ============================================================
// アプリケーション情報
// ============================================================

/** アプリケーションバージョン（package.jsonから取得） */
export const APP_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();
