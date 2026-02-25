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
// バリデーションヘルパー
// ============================================================

/**
 * 整数値のバリデーション
 * 不正値の場合はconsole.warnで警告し、デフォルト値にフォールバック
 * （config.tsはlogger.tsより先に読み込まれるためconsole.warnを使用）
 */
function validateInt(
  name: string,
  raw: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    console.warn(
      `設定値バリデーション: ${name} の値 "${raw}" は不正です（有効範囲: ${min}〜${max}）。デフォルト値 ${defaultValue} を使用します。`,
    );
    return defaultValue;
  }
  return parsed;
}

// ============================================================
// サーバー設定
// ============================================================

/** サーバーポート */
export const PORT: number = validateInt('PORT', process.env.PORT, 4173, 1, 65535);

/** ワークスペースルートディレクトリ */
export const ROOT_DIR: string = path.resolve(process.env.WORKSPACE_ROOT || process.cwd());

/** 認証トークン（空の場合は認証無効） */
export const AUTH_TOKEN: string = process.env.AUTH_TOKEN || '';

/** カスタムコマンドの許可 */
export const ALLOW_CUSTOM_COMMANDS: boolean = process.env.ALLOW_CUSTOM_COMMANDS === 'true';

/** ファイル書き込みの許可 */
export const ALLOW_FILE_WRITE: boolean = process.env.ALLOW_FILE_WRITE === 'true';

/** 最大ファイルサイズ（バイト、デフォルト: 1MB） */
export const MAX_FILE_SIZE: number = validateInt('MAX_FILE_SIZE', process.env.MAX_FILE_SIZE, 1048576, 1, Number.MAX_SAFE_INTEGER);

/**
 * trust proxy設定（リバースプロキシ経由時のX-Forwarded-For信頼設定）
 * 'true'/'false'/数値/カンマ区切りIPを受け付ける
 * デフォルト: false（プロキシを信頼しない）
 */
export const TRUST_PROXY: string | number | boolean = (() => {
  const val = process.env.TRUST_PROXY || 'false';
  if (val === 'true') return true;
  if (val === 'false') return false;
  const num = parseInt(val, 10);
  if (!isNaN(num) && String(num) === val) {
    // 0以上の整数のみ許可。負数や不正な数値はfalseにフォールバック
    if (!Number.isInteger(num) || num < 0) {
      console.warn(
        `設定値バリデーション: TRUST_PROXY の値 "${val}" は不正な数値です（0以上の整数が必要）。デフォルト値 false を使用します。`,
      );
      return false;
    }
    return num;
  }
  // IPアドレスやサブネット指定などの文字列をそのまま返す
  return val;
})();

/** ログレベル */
export const LOG_LEVEL: string = process.env.LOG_LEVEL || 'info';

/** セッションログの有効化 */
export const ENABLE_SESSION_LOGS: boolean = process.env.ENABLE_SESSION_LOGS === 'true';

/** ログディレクトリ */
export const LOG_DIR: string = path.resolve(process.env.LOG_DIR || path.join(ROOT_DIR, 'logs'));

/** データ永続化ディレクトリ */
export const DATA_DIR: string = path.resolve(process.env.DATA_DIR || path.join(ROOT_DIR, '.pocket-dev-relay'));

/** ログ保持日数（デフォルト: 30日） */
export const LOG_MAX_AGE_DAYS: number = validateInt('LOG_MAX_AGE_DAYS', process.env.LOG_MAX_AGE_DAYS, 30, 1, Number.MAX_SAFE_INTEGER);

/** ログ最大サイズ（MB、デフォルト: 100MB） */
export const LOG_MAX_SIZE_MB: number = validateInt('LOG_MAX_SIZE_MB', process.env.LOG_MAX_SIZE_MB, 100, 1, Number.MAX_SAFE_INTEGER);

/** シェルコマンド */
export const SHELL_CMD: string = process.env.SHELL_CMD || process.env.SHELL || 'zsh';

/** アップロード最大サイズ（バイト、デフォルト: 10MB） */
export const MAX_UPLOAD_SIZE: number = validateInt('MAX_UPLOAD_SIZE', process.env.MAX_UPLOAD_SIZE, 10485760, 1, Number.MAX_SAFE_INTEGER);

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

/** AI解析に送信するターミナル出力の最大行数（デフォルト: 200行） */
export const AI_MAX_CONTEXT_LINES: number = validateInt('AI_MAX_CONTEXT_LINES', process.env.AI_MAX_CONTEXT_LINES, 200, 1, Number.MAX_SAFE_INTEGER);

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
export const RATE_LIMIT_API: number = validateInt('RATE_LIMIT_API', process.env.RATE_LIMIT_API, 100, 1, Number.MAX_SAFE_INTEGER);

/** 認証失敗のレート制限（回数/分） */
export const RATE_LIMIT_AUTH: number = validateInt('RATE_LIMIT_AUTH', process.env.RATE_LIMIT_AUTH, 5, 1, Number.MAX_SAFE_INTEGER);

// ============================================================
// セッションタイムアウト設定
// ============================================================

/** セッションタイムアウト（ミリ秒、デフォルト1時間、0=無効） */
export const SESSION_TIMEOUT: number = validateInt('SESSION_TIMEOUT', process.env.SESSION_TIMEOUT, 3600000, 0, Number.MAX_SAFE_INTEGER);

// ============================================================
// SSH設定
// ============================================================

/** SSH機能の有効化 */
export const ENABLE_SSH: boolean = process.env.ENABLE_SSH === 'true';

/** SSHデフォルトホスト */
export const SSH_DEFAULT_HOST: string = process.env.SSH_DEFAULT_HOST || '';

/** SSHデフォルトポート */
export const SSH_DEFAULT_PORT: number = validateInt('SSH_DEFAULT_PORT', process.env.SSH_DEFAULT_PORT, 22, 1, 65535);

/** SSHデフォルトユーザー */
export const SSH_DEFAULT_USER: string = process.env.SSH_DEFAULT_USER || '';

/** SSH秘密鍵パス */
export const SSH_KEY_PATH: string = process.env.SSH_KEY_PATH || path.join(os.homedir(), '.ssh', 'id_rsa');

/** SSHホスト鍵の厳格な検証（デフォルト: true） */
export const SSH_STRICT_HOST_KEY: boolean = process.env.SSH_STRICT_HOST_KEY !== 'false';

/** SSHパスワード認証にHTTPSを要求する（デフォルト: true） */
export const SSH_REQUIRE_HTTPS_FOR_PASSWORD: boolean = process.env.SSH_REQUIRE_HTTPS_FOR_PASSWORD !== 'false';

// ============================================================
// トンネル設定
// ============================================================

/** トンネル機能の有効化 */
export const ENABLE_TUNNEL: boolean = process.env.ENABLE_TUNNEL === 'true';

/** トンネルプロバイダー */
export const TUNNEL_PROVIDER: string = process.env.TUNNEL_PROVIDER || 'cloudflared';

/** cloudflaredバイナリパス（カスタム指定時） */
export const CLOUDFLARED_PATH: string = process.env.CLOUDFLARED_PATH || '';

/** トンネル起動タイムアウト（ミリ秒、デフォルト30秒） */
export const TUNNEL_TIMEOUT: number = validateInt('TUNNEL_TIMEOUT', process.env.TUNNEL_TIMEOUT, 30000, 1000, Number.MAX_SAFE_INTEGER);

// ============================================================
// アプリケーション情報
// ============================================================

/** アプリケーションバージョン（package.jsonから取得） */
export const APP_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')) as { version?: string };
    return pkg.version || '0.0.0';
  } catch (error: unknown) {
    // loggerはconfigに依存するため循環依存を避けてconsole.warnを使用
    console.warn('APP_VERSION: package.jsonの読み込みに失敗しました。デフォルト値 "0.0.0" を使用します。', error);
    return '0.0.0';
  }
})();
