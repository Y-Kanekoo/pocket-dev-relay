/**
 * Pocket Dev Relay CLIエントリポイント
 * npx pocket-dev-relay で起動可能にする
 * shebangはesbuildの--bannerオプションで付与
 */

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// コマンドライン引数のパース
const { values } = parseArgs({
  options: {
    port: { type: 'string', short: 'p', default: '4173' },
    host: { type: 'string', short: 'h', default: '0.0.0.0' },
    workspace: { type: 'string', short: 'w' },
    token: { type: 'string', short: 't' },
    help: { type: 'boolean', default: false },
    version: { type: 'boolean', short: 'v', default: false },
  },
  strict: true,
  allowPositionals: false,
});

// ヘルプ表示
if (values.help) {
  console.log(`
Pocket Dev Relay - スマホからPCのターミナルにアクセス

使い方:
  npx pocket-dev-relay [オプション]

オプション:
  -p, --port <port>        ポート番号 (デフォルト: 4173)
  -h, --host <host>        ホスト (デフォルト: 0.0.0.0)
  -w, --workspace <path>   ワークスペースパス (デフォルト: カレントディレクトリ)
  -t, --token <token>      認証トークン
  -v, --version            バージョン表示
      --help               ヘルプ表示
  `);
  process.exit(0);
}

// バージョン表示
if (values.version) {
  // package.jsonからバージョンを読み取る
  const pkgPath = join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
  console.log(pkg.version);
  process.exit(0);
}

// 環境変数に反映
if (values.port) process.env.PORT = values.port;
if (values.host) process.env.HOST = values.host;
if (values.workspace) process.env.WORKSPACE_ROOT = values.workspace;
if (values.token) process.env.AUTH_TOKEN = values.token;

// サーバー起動
import('./server.js');
