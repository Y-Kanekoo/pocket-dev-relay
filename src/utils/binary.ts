/**
 * 外部バイナリの検出ユーティリティ
 * cloudflared等の外部コマンドのパス検出を行う
 */

import { execSync } from 'child_process';
import { CLOUDFLARED_PATH } from '../config.js';

/**
 * cloudflaredバイナリのパスを検出
 * 1. CLOUDFLARED_PATH 環境変数が指定されていればそれを使用
 * 2. PATHから which/where コマンドで検索
 * @returns バイナリパス。見つからない場合はnull
 */
export function findCloudflaredBinary(): string | null {
  // カスタムパス指定がある場合はそれを使用
  if (CLOUDFLARED_PATH) {
    return CLOUDFLARED_PATH;
  }

  try {
    const cmd = process.platform === 'win32' ? 'where cloudflared' : 'which cloudflared';
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
    // 複数パスが返る可能性があるため最初の行を使用
    return result.split('\n')[0] || null;
  } catch {
    return null;
  }
}

/**
 * cloudflaredがインストール済みかチェック
 */
export function isCloudflaredAvailable(): boolean {
  return findCloudflaredBinary() !== null;
}

/**
 * cloudflared未検出時のインストールガイドメッセージを返す
 */
export function getInstallGuide(): string {
  const platform = process.platform;
  const lines = [
    'cloudflared が見つかりません。トンネルを開始できません。',
    '',
    'インストール方法:',
  ];

  if (platform === 'darwin') {
    lines.push('  brew install cloudflared');
  } else if (platform === 'linux') {
    lines.push(
      '  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared',
      '  chmod +x /usr/local/bin/cloudflared',
    );
  } else if (platform === 'win32') {
    lines.push('  winget install Cloudflare.cloudflared');
  }

  lines.push('', 'パスを直接指定する場合: CLOUDFLARED_PATH=/path/to/cloudflared');

  return lines.join('\n');
}
