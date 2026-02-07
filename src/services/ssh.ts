/**
 * SSH接続サービス
 * ssh2ライブラリを使用してリモートサーバーへのSSH接続を中継
 */

import { Client as SSHClient, ClientChannel, ConnectConfig } from 'ssh2';
import fs from 'fs';

import { SSHConnectionConfig } from '../types/index.js';
import { ENABLE_SSH, SSH_DEFAULT_HOST, SSH_DEFAULT_PORT, SSH_DEFAULT_USER, SSH_KEY_PATH } from '../config.js';

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
      // ホスト鍵の検証を無効化（開発用途、本番では適切な検証が必要）
      hostVerifier: () => true,
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

    // 認証方式の設定
    if (config.authMethod === 'password') {
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
