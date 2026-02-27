/**
 * SSH接続サービス
 * ssh2ライブラリを使用してリモートサーバーへのSSH接続を中継
 */

import { Client as SSHClient, ClientChannel, ConnectConfig } from 'ssh2';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { SSHConnectionConfig } from '../types/index.js';
import {
  ENABLE_HTTPS,
  ENABLE_SSH,
  SSH_DEFAULT_HOST,
  SSH_DEFAULT_PORT,
  SSH_DEFAULT_USER,
  SSH_KEY_PATH,
  SSH_REQUIRE_HTTPS_FOR_PASSWORD,
  SSH_STRICT_HOST_KEY,
} from '../config.js';

// ============================================================
// 型定義
// ============================================================

/** SSH接続結果 */
export interface SSHSessionResult {
  /** SSH接続クライアント */
  client: SSHClient;
  /** シェルチャンネル */
  channel: ClientChannel;
}

// ============================================================
// known_hostsの読み込み
// ============================================================

/**
 * known_hostsファイルを読み込んでホスト名とキーのマップを返す
 * @returns ホスト名 -> 鍵データ配列のマップ
 */
function loadKnownHosts(): Map<string, string[]> {
  const knownHostsPath = path.join(os.homedir(), '.ssh', 'known_hosts');
  const hosts = new Map<string, string[]>();
  try {
    const content = fs.readFileSync(knownHostsPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 3) {
        const hostnames = parts[0].split(',');
        const keyData = `${parts[1]} ${parts[2]}`;
        for (const hostname of hostnames) {
          const existing = hosts.get(hostname) || [];
          existing.push(keyData);
          hosts.set(hostname, existing);
        }
      }
    }
  } catch {
    // known_hostsが読めない場合は空のマップを返す
  }
  return hosts;
}

// ============================================================
// SSH接続管理
// ============================================================

/**
 * SSH機能が有効かどうかを確認
 * @returns SSH機能の有効状態
 */
export function isSSHEnabled(): boolean {
  return ENABLE_SSH;
}

/**
 * SSH接続を確立してシェルを開く
 * @param config クライアントから送信されたSSH接続設定
 * @returns SSH接続結果（クライアントとチャンネル）
 */
export function createSSHSession(config: SSHConnectionConfig): Promise<SSHSessionResult> {
  return new Promise((resolve, reject) => {
    if (!ENABLE_SSH) {
      reject(new Error('ssh-disabled'));
      return;
    }

    const sshClient = new SSHClient();

    // 接続設定の組み立て
    const connectConfig: ConnectConfig = {
      host: config.host || SSH_DEFAULT_HOST,
      port: config.port || SSH_DEFAULT_PORT,
      username: config.username || SSH_DEFAULT_USER,
      // 接続タイムアウト（10秒）
      readyTimeout: 10000,
    };

    // ホスト名が空の場合はエラー
    if (!connectConfig.host) {
      reject(new Error('ssh-host-required'));
      return;
    }

    // ユーザー名が空の場合はエラー
    if (!connectConfig.username) {
      reject(new Error('ssh-username-required'));
      return;
    }

    // ホスト鍵検証の設定
    if (SSH_STRICT_HOST_KEY) {
      // known_hostsによるホスト鍵検証
      const knownHosts = loadKnownHosts();
      const hostKey =
        knownHosts.get(connectConfig.host!) ||
        knownHosts.get(`[${connectConfig.host!}]:${connectConfig.port}`);
      if (!hostKey) {
        reject(
          new Error(
            `ssh-unknown-host: ${connectConfig.host} がknown_hostsに登録されていません。手動でSSH接続して登録してください。`,
          ),
        );
        return;
      }
      // known_hostsに登録されたホスト鍵と照合する
      connectConfig.hostVerifier = (key: Buffer) => {
        const receivedKey = key.toString('base64');
        return hostKey.some((knownKey) => {
          const parts = knownKey.split(' ');
          return parts.length >= 2 && parts[1] === receivedKey;
        });
      };
    } else {
      // 検証をスキップ（開発用途）
      connectConfig.hostVerifier = () => true;
    }

    // 認証方式の設定
    if (config.authMethod === 'password') {
      // パスワード認証にはHTTPS接続を要求
      if (SSH_REQUIRE_HTTPS_FOR_PASSWORD && !ENABLE_HTTPS) {
        reject(
          new Error(
            'ssh-password-requires-https: パスワード認証にはHTTPS接続が必要です。SSH_REQUIRE_HTTPS_FOR_PASSWORD=false で無効化できます。',
          ),
        );
        return;
      }
      if (!config.password) {
        reject(new Error('ssh-password-required'));
        return;
      }
      connectConfig.password = config.password;
    } else {
      // 秘密鍵認証
      try {
        if (!fs.existsSync(SSH_KEY_PATH)) {
          reject(new Error(`ssh-key-not-found: ${SSH_KEY_PATH}`));
          return;
        }
        connectConfig.privateKey = fs.readFileSync(SSH_KEY_PATH);
      } catch (error) {
        const err = error as Error;
        reject(new Error(`ssh-key-read-error: ${err.message}`));
        return;
      }
    }

    // 接続イベント
    sshClient.on('ready', () => {
      // シェルを開く
      sshClient.shell(
        {
          term: 'xterm-256color',
          cols: 80,
          rows: 24,
        },
        (err, channel) => {
          if (err) {
            sshClient.end();
            reject(new Error(`ssh-shell-error: ${err.message}`));
            return;
          }
          resolve({ client: sshClient, channel });
        },
      );
    });

    // エラーイベント
    sshClient.on('error', (err) => {
      reject(new Error(`ssh-connection-error: ${err.message}`));
    });

    // 接続開始
    sshClient.connect(connectConfig);
  });
}

/**
 * SSHチャンネルのウィンドウサイズを変更
 * @param channel SSHチャンネル
 * @param cols 列数
 * @param rows 行数
 */
export function resizeSSHChannel(channel: ClientChannel, cols: number, rows: number): void {
  try {
    channel.setWindow(rows, cols, rows * 16, cols * 8);
  } catch {
    // リサイズエラーは無視
  }
}

/**
 * SSH接続を終了
 * @param client SSHクライアント
 */
export function closeSSHConnection(client: SSHClient): void {
  try {
    client.end();
  } catch {
    // 終了エラーは無視
  }
}
