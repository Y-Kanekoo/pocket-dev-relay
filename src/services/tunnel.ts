/**
 * トンネルサービス
 * cloudflared Quick Tunnelを使用して外部アクセスを提供する
 */

import { spawn, type ChildProcess } from 'child_process';
import { TUNNEL_TIMEOUT } from '../config.js';
import { findCloudflaredBinary, getInstallGuide } from '../utils/binary.js';
import logger from './logger.js';

// ============================================================
// 型定義
// ============================================================

/** トンネルの状態 */
export type TunnelState = 'stopped' | 'starting' | 'running' | 'error';

/** トンネル情報 */
export interface TunnelInfo {
  /** トンネルURL（例: https://xxx.trycloudflare.com） */
  url: string;
  /** プロバイダー名 */
  provider: string;
  /** 現在の状態 */
  state: TunnelState;
}

// ============================================================
// 内部状態
// ============================================================

let tunnelProcess: ChildProcess | null = null;
let tunnelInfo: TunnelInfo | null = null;
let retryCount = 0;
const MAX_RETRIES = 3;

/**
 * cloudflaredのstderr出力からトンネルURLを抽出する正規表現
 * Quick Tunnelは `https://xxx-yyy-zzz.trycloudflare.com` 形式のURLを出力する
 */
export const TUNNEL_URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

// ============================================================
// 公開API
// ============================================================

/**
 * トンネルを開始する
 * @param localPort ローカルサーバーのポート番号
 * @returns トンネル情報
 * @throws cloudflared未検出、タイムアウト時
 */
export async function startTunnel(localPort: number): Promise<TunnelInfo> {
  // ポート番号のバリデーション
  if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) {
    throw new Error(`無効なポート番号です: ${localPort}`);
  }

  const binaryPath = findCloudflaredBinary();
  if (!binaryPath) {
    const guide = getInstallGuide();
    logger.warn(guide);
    throw new Error('cloudflared が見つかりません');
  }

  tunnelInfo = { url: '', provider: 'cloudflared', state: 'starting' };
  logger.info('トンネルを開始しています...');

  return new Promise<TunnelInfo>((resolve, reject) => {
    const proc = spawn(binaryPath, ['tunnel', '--url', `http://localhost:${localPort}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    tunnelProcess = proc;

    // タイムアウト設定
    const timeout = setTimeout(() => {
      if (tunnelInfo && tunnelInfo.state === 'starting') {
        tunnelInfo.state = 'error';
        logger.error('トンネルの起動がタイムアウトしました（%dms）', TUNNEL_TIMEOUT);
        cleanup();
        reject(new Error('トンネルの起動がタイムアウトしました'));
      }
    }, TUNNEL_TIMEOUT);

    let urlFound = false;

    /** stderrまたはstdoutのデータからURLを抽出するハンドラ */
    const handleOutput = (data: Buffer): void => {
      if (urlFound) return;
      const output = data.toString();
      const match = output.match(TUNNEL_URL_PATTERN);
      if (match && tunnelInfo) {
        urlFound = true;
        clearTimeout(timeout);
        tunnelInfo.url = match[0];
        tunnelInfo.state = 'running';
        retryCount = 0;
        logger.info('トンネル開始: %s', tunnelInfo.url);
        resolve({ ...tunnelInfo });
      }
    };

    // cloudflaredはstderrにログを出力するが、バージョンによってはstdoutにも出力する
    proc.stderr?.on('data', handleOutput);
    proc.stdout?.on('data', handleOutput);

    proc.on('error', (err) => {
      clearTimeout(timeout);
      if (tunnelInfo) tunnelInfo.state = 'error';
      logger.error({ err }, 'cloudflared の起動に失敗しました');
      reject(err);
    });

    proc.on('close', (code: number | null) => {
      clearTimeout(timeout);
      if (tunnelInfo && tunnelInfo.state === 'running') {
        logger.warn('トンネルプロセスが終了しました (code=%s)', String(code ?? 'unknown'));
        tunnelInfo.state = 'stopped';
        tunnelProcess = null;
        // 自動再起動
        handleRestart(localPort);
      } else if (!urlFound) {
        if (tunnelInfo) tunnelInfo.state = 'error';
        tunnelProcess = null;
        reject(new Error(`cloudflared が異常終了しました (code=${code})`));
      }
    });
  });
}

/**
 * トンネルを停止する
 */
export function stopTunnel(): void {
  retryCount = MAX_RETRIES; // 再起動を抑制
  cleanup();
  if (tunnelInfo) {
    tunnelInfo.state = 'stopped';
    tunnelInfo.url = '';
  }
  logger.info('トンネルを停止しました');
}

/**
 * 現在のトンネル情報を取得する
 * @returns トンネル情報。未起動の場合はnull
 */
export function getTunnelInfo(): TunnelInfo | null {
  return tunnelInfo ? { ...tunnelInfo } : null;
}

// ============================================================
// 内部ヘルパー
// ============================================================

/** cloudflaredプロセスを終了する */
function cleanup(): void {
  if (tunnelProcess) {
    tunnelProcess.kill('SIGTERM');
    tunnelProcess = null;
  }
}

/** トンネル切断時の自動再起動 */
function handleRestart(localPort: number): void {
  if (retryCount >= MAX_RETRIES) {
    logger.error('トンネルの再起動回数が上限（%d回）に達しました。手動で再起動してください。', MAX_RETRIES);
    return;
  }

  retryCount++;
  const delay = retryCount * 3000; // 3秒、6秒、9秒
  logger.info('トンネルを %dms 後に再起動します（%d/%d回目）', delay, retryCount, MAX_RETRIES);

  setTimeout(async () => {
    try {
      await startTunnel(localPort);
    } catch (err) {
      logger.error({ err }, 'トンネルの再起動に失敗しました');
    }
  }, delay);
}
