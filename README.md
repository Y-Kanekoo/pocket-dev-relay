# Pocket Dev Relay

外出先からスマホで自宅PCのターミナルを操作するリモート開発ツール。
自宅PCでサーバーを起動し、スマホのブラウザからCodex CLI / Claude Code / シェルを操作できる。
cloudflaredトンネル統合により、VPN不要でインターネット経由のアクセスが可能。

## 特徴

- 外出先からスマホでPCのターミナルを操作
- cloudflaredトンネルによるインターネット経由アクセス（HTTPS自動付与）
- Codex CLI / Claude Code / シェルの3モード
- WebSocket自動再接続
- 複数セッション管理（タブUI）
- ファイルブラウザ（閲覧・編集・アップロード）
- クリップボード共有（PC ⇔ スマホ）
- コマンドスニペット（ワンタップ実行）
- AI解析（ターミナル出力のエラー解析・要約）
- SSH中継接続
- ダーク/ライトモード
- PWA対応（ホーム画面に追加可能）
- セッションログ保存
- HTTPS対応（オプション）
- 認証機能（トークンベース）

## クイックスタート

### 外出先からアクセスする（推奨）

cloudflaredを使えば、VPN不要でインターネット経由のアクセスが可能。

```bash
# 1. cloudflared をインストール（初回のみ）
brew install cloudflared   # macOS
# Linux: curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared

# 2. セットアップ
git clone https://github.com/your-username/pocket-dev-relay.git
cd pocket-dev-relay
npm install
cp .env.example .env
# .env を編集して AUTH_TOKEN と WORKSPACE_ROOT を設定

# 3. トンネル付きで起動
npx pocket-dev-relay --tunnel --token your-secret-token
```

起動するとコンソールにトンネルURL（`https://xxx.trycloudflare.com`）とQRコードが表示される。
スマホでQRコードを読み取ればすぐにアクセスできる。

> **注意**: `--tunnel` を使う場合、`--token`（または`AUTH_TOKEN`環境変数）は必須。インターネットに公開されるため認証なしでは起動できない。

### LAN内で使う

外部アクセスが不要な場合は、トンネルなしでも利用できる。

```bash
git clone https://github.com/your-username/pocket-dev-relay.git
cd pocket-dev-relay
npm install
cp .env.example .env
# .env を編集して AUTH_TOKEN と WORKSPACE_ROOT を設定
npm run dev
```

サーバーが起動すると、LAN上のアクセスURLがコンソールに表示される。
スマホから同じWi-Fiに接続し、表示されたURLを開く。

### Docker

```bash
# .env ファイルを作成
echo "AUTH_TOKEN=your-secret-token" > .env
echo "WORKSPACE_PATH=/path/to/your/project" >> .env

# 起動
docker compose up -d
```

`docker-compose.yml` はリポジトリに含まれている。
`WORKSPACE_PATH` にホスト側のプロジェクトディレクトリを指定すると、コンテナ内の `/workspace` にマウントされる。

## 設定

### 環境変数

`.env.example` をコピーして `.env` を作成し、必要な値を設定する。

| 変数名 | 説明 | デフォルト値 |
|--------|------|-------------|
| `PORT` | サーバーのリッスンポート | `4173` |
| `WORKSPACE_ROOT` | ファイルブラウザ・ターミナルのルートディレクトリ | カレントディレクトリ |
| `AUTH_TOKEN` | 認証トークン（空の場合は認証無効） | 空（認証無効） |
| `ALLOW_CUSTOM_COMMANDS` | カスタムコマンドモードの許可 | `false` |
| `ALLOW_FILE_WRITE` | ファイルブラウザでの書き込み許可 | `false` |
| `MAX_FILE_SIZE` | ファイルプレビューの最大サイズ（バイト） | `1048576`（1MB） |
| `CODEX_CMD` | Codex CLIのコマンド名 | `codex` |
| `CODEX_ARGS` | Codex CLIの追加引数 | 空 |
| `CLAUDE_CMD` | Claude Codeのコマンド名 | `claude` |
| `CLAUDE_ARGS` | Claude Codeの追加引数 | 空 |
| `SHELL_CMD` | シェルのコマンド名 | `zsh`（環境変数`SHELL`のフォールバック） |
| `SHELL_ARGS` | シェルの追加引数 | 空 |
| `ENABLE_SESSION_LOGS` | セッションログの有効化 | `false` |
| `LOG_DIR` | ログファイルの保存先 | `WORKSPACE_ROOT/logs` |
| `ENABLE_HTTPS` | HTTPSモードの有効化 | `false` |
| `SSL_KEY_PATH` | SSL秘密鍵のパス（HTTPS有効時に必須） | 空 |
| `SSL_CERT_PATH` | SSL証明書のパス（HTTPS有効時に必須） | 空 |
| `ENABLE_TUNNEL` | cloudflaredトンネルの有効化（`AUTH_TOKEN`必須） | `false` |
| `TUNNEL_PROVIDER` | トンネルプロバイダー | `cloudflared` |
| `CLOUDFLARED_PATH` | cloudflaredバイナリのパス（PATHにない場合に指定） | 空（PATHから検索） |
| `TUNNEL_TIMEOUT` | トンネル起動タイムアウト（ミリ秒） | `30000` |

引数（`CODEX_ARGS`, `CLAUDE_ARGS`, `SHELL_ARGS`）はスペース区切りまたはJSON配列形式で指定できる。

```bash
# スペース区切り
CODEX_ARGS=--model o3
# JSON配列
CODEX_ARGS=["--model", "o3"]
```

### CLIオプション

`npx pocket-dev-relay` で起動時に以下のオプションが使える。環境変数より優先される。

```
-p, --port <port>        ポート番号 (デフォルト: 4173)
-h, --host <host>        ホスト (デフォルト: 0.0.0.0)
-w, --workspace <path>   ワークスペースパス (デフォルト: カレントディレクトリ)
-t, --token <token>      認証トークン
    --tunnel             トンネルを有効化（外部アクセス、cloudflared必要）
-v, --version            バージョン表示
    --help               ヘルプ表示
```

## API仕様

### 認証

`AUTH_TOKEN` が設定されている場合、`GET /` 以外の全APIリクエストにBearerトークンが必要。

```
Authorization: Bearer <AUTH_TOKEN>
```

WebSocket接続はクエリパラメータでトークンを渡す。

```
ws://host:port/ws?token=<AUTH_TOKEN>
```

### エンドポイント一覧

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/config` | アプリケーション設定を取得 |
| GET | `/api/addresses` | アクセスURL一覧を取得 |
| GET | `/api/files?path=<relative_path>` | ディレクトリ内のファイル一覧を取得 |
| GET | `/api/file?path=<relative_path>` | ファイル内容を取得 |
| POST | `/api/file` | ファイルに書き込み（`ALLOW_FILE_WRITE=true` が必要） |
| GET | `/api/logs` | セッションログ一覧を取得（`ENABLE_SESSION_LOGS=true` が必要） |
| GET | `/api/log/:fileName` | セッションログの内容を取得 |
| GET | `/api/qr?text=<url>` | QRコードを生成（data URL形式） |

#### GET /api/config

レスポンス例:

```json
{
  "workspaceRoot": "/Users/you/Projects/my-project",
  "workspaceName": "my-project",
  "modes": ["codex", "claude", "shell"],
  "allowCustomCommands": false,
  "fileWriteEnabled": false,
  "authEnabled": true,
  "maxFileSize": 1048576,
  "sessionLogsEnabled": false
}
```

#### GET /api/addresses

レスポンス例:

```json
{
  "port": 4173,
  "urls": [
    { "type": "tunnel", "name": "cloudflared", "host": "abc-def-123.trycloudflare.com", "url": "https://abc-def-123.trycloudflare.com" },
    { "type": "mdns", "name": "hostname.local", "host": "hostname.local:4173", "url": "http://hostname.local:4173" },
    { "type": "lan", "name": "en0", "host": "192.168.1.10:4173", "url": "http://192.168.1.10:4173" }
  ]
}
```

トンネルが有効な場合、`tunnel` タイプのURLが先頭に追加される。

#### GET /api/files

クエリパラメータ `path` にワークスペースルートからの相対パスを指定する。省略時はルートを返す。

レスポンス例:

```json
{
  "path": "src",
  "items": [
    { "name": "client", "type": "dir" },
    { "name": "server.ts", "type": "file" }
  ]
}
```

#### GET /api/file

クエリパラメータ `path` にファイルの相対パスを指定する。`MAX_FILE_SIZE` を超えるファイルはエラーになる。

レスポンス例:

```json
{
  "path": "src/server.ts",
  "content": "import express from 'express';\n..."
}
```

#### POST /api/file

`ALLOW_FILE_WRITE=true` の場合のみ利用可能。

リクエストボディ:

```json
{
  "path": "src/example.ts",
  "content": "console.log('hello');\n"
}
```

レスポンス:

```json
{
  "ok": true
}
```

#### GET /api/logs

`ENABLE_SESSION_LOGS=true` の場合のみ利用可能。

レスポンス例:

```json
{
  "logs": [
    {
      "id": "abc123",
      "fileName": "session-2025-01-01T00-00-00-shell-abc123.log",
      "mode": "shell",
      "label": "Shell",
      "cwd": ".",
      "startedAt": "2025-01-01T00:00:00.000Z",
      "endedAt": "2025-01-01T00:30:00.000Z",
      "exitCode": 0
    }
  ]
}
```

#### GET /api/log/:fileName

ログファイルの内容をテキストとして返す。ファイル名は `session-` で始まり `.log` で終わる必要がある。

レスポンス例:

```json
{
  "fileName": "session-2025-01-01T00-00-00-shell-abc123.log",
  "content": "=== セッション開始 ===\n..."
}
```

#### GET /api/qr

クエリパラメータ `text` に任意の文字列を渡すと、QRコードのdata URLを返す。

レスポンス例:

```json
{
  "dataUrl": "data:image/png;base64,..."
}
```

### WebSocketメッセージ

WebSocketエンドポイント: `ws://host:port/ws?token=<AUTH_TOKEN>`

#### クライアント → サーバー

**start** - セッション開始

```json
{
  "type": "start",
  "mode": "codex",
  "cwd": "src",
  "command": "custom command here",
  "sessionId": "optional-id"
}
```

- `mode`: `"codex"` | `"claude"` | `"shell"` | `"custom"`
- `cwd`: 作業ディレクトリ（相対パス、省略時はワークスペースルート）
- `command`: カスタムコマンド（`mode` が `"custom"` の場合のみ）

**input** - ターミナル入力

```json
{
  "type": "input",
  "data": "ls -la\r"
}
```

**resize** - ターミナルサイズ変更

```json
{
  "type": "resize",
  "cols": 120,
  "rows": 40
}
```

**stop** - セッション停止

```json
{
  "type": "stop"
}
```

#### サーバー → クライアント

**data** - ターミナル出力

```json
{
  "type": "data",
  "data": "total 42\ndrwxr-xr-x ..."
}
```

**started** - セッション開始完了

```json
{
  "type": "started",
  "sessionId": "abc123",
  "mode": "shell",
  "cwd": ".",
  "label": "Shell"
}
```

**exit** - プロセス終了

```json
{
  "type": "exit",
  "exitCode": 0,
  "signal": null
}
```

**stopped** - 手動停止

```json
{
  "type": "stopped",
  "reason": "client-stop"
}
```

**error** - エラー

```json
{
  "type": "error",
  "message": "session-already-running"
}
```

## 開発

### 前提条件

- Node.js 20以上
- npm
- node-ptyのビルドに必要なツール（Python 3、make、C++コンパイラ）
- cloudflared（`--tunnel` を使う場合のみ）

macOSではXcode Command Line Toolsがインストールされていれば問題ない。

```bash
xcode-select --install

# cloudflared（外部アクセス機能を使う場合）
brew install cloudflared
```

### セットアップ

```bash
git clone https://github.com/your-username/pocket-dev-relay.git
cd pocket-dev-relay
npm install
cp .env.example .env
```

### スクリプト一覧

| コマンド | 説明 |
|----------|------|
| `npm run build` | サーバーとクライアントをビルド |
| `npm run build:server` | サーバーのみビルド（esbuild） |
| `npm run build:client` | クライアントのみビルド（esbuild） |
| `npm run dev` | ビルド後にサーバーを起動 |
| `npm start` | ビルド済みのサーバーを起動 |
| `npm run start:awake` | macOSスリープ防止付きで起動（caffeinate） |
| `npm run watch` | サーバーとクライアントのファイル監視ビルド |
| `npm run watch:server` | サーバーのファイル監視ビルド |
| `npm run watch:client` | クライアントのファイル監視ビルド |
| `npm run lint` | ESLintを実行 |
| `npm run format` | Prettierでフォーマット |
| `npm run typecheck` | TypeScriptの型チェック |
| `npm test` | テストをウォッチモードで実行（vitest） |
| `npm run test:ui` | テストUIを起動（vitest --ui） |
| `npm run test:run` | テストを1回実行 |

### プロジェクト構造

```
pocket-dev-relay/
├── public/                    # 静的ファイル（フロントエンド）
│   ├── index.html             # メインHTML
│   ├── styles.css             # スタイルシート
│   ├── app.js                 # ビルド済みクライアントJS
│   ├── manifest.json          # PWAマニフェスト
│   ├── sw.js                  # Service Worker
│   └── icon.svg               # アプリアイコン
├── src/
│   ├── server.ts              # サーバーエントリポイント
│   ├── config.ts              # 設定値管理（環境変数）
│   ├── types/
│   │   └── index.ts           # 共通型定義
│   ├── routes/
│   │   ├── api.ts             # /api/config, /api/addresses, /api/qr
│   │   ├── files.ts           # /api/files, /api/file
│   │   └── logs.ts            # /api/logs, /api/log/:fileName
│   ├── services/
│   │   ├── pty.ts             # PTY操作・コマンドプリセット
│   │   ├── session.ts         # セッション管理
│   │   ├── tunnel.ts          # cloudflaredトンネル管理
│   │   └── websocket.ts       # WebSocketハンドラ
│   ├── middleware/
│   │   ├── auth.ts            # 認証ミドルウェア
│   │   └── errorHandler.ts    # エラーハンドリング
│   ├── errors/
│   │   └── AppError.ts        # カスタムエラークラス
│   ├── utils/
│   │   ├── binary.ts          # 外部バイナリ検出
│   │   ├── network.ts         # ネットワークユーティリティ
│   │   └── path.ts            # パスユーティリティ
│   └── client/
│       ├── app.ts             # クライアントエントリポイント
│       ├── components/
│       │   ├── fileBrowser.ts # ファイルブラウザ
│       │   ├── session.ts     # セッション管理UI
│       │   ├── settings.ts    # 設定パネル
│       │   ├── terminal.ts    # ターミナルUI
│       │   └── toast.ts       # トースト通知
│       ├── services/
│       │   ├── api.ts         # APIクライアント
│       │   ├── errorHandler.ts# エラーハンドリング
│       │   └── websocket.ts   # WebSocket接続管理
│       └── state/
│           └── sessionStore.ts# セッション状態管理
├── tests/
│   ├── client/
│   │   ├── services/
│   │   │   └── api.test.ts    # APIクライアントテスト
│   │   └── utils.test.ts      # クライアントユーティリティテスト
│   └── server/
│       ├── auth.test.ts       # 認証テスト
│       ├── session.test.ts    # セッションテスト
│       └── utils.test.ts      # サーバーユーティリティテスト
├── Dockerfile                 # Dockerイメージ定義
├── docker-compose.yml         # Docker Compose設定
├── package.json
├── tsconfig.json              # TypeScript設定（サーバー）
├── tsconfig.client.json       # TypeScript設定（クライアント）
├── tsconfig.test.json         # TypeScript設定（テスト）
├── vitest.config.ts           # Vitestテスト設定
├── .env.example               # 環境変数テンプレート
├── .eslintrc.json             # ESLint設定
└── .prettierrc                # Prettier設定
```

### テスト

テストフレームワークにはVitestを使用している。

```bash
# テストを1回実行
npm run test:run

# ウォッチモードで実行
npm test

# UIモードで実行
npm run test:ui
```

### ビルド

esbuildでサーバーとクライアントをバンドルする。

```bash
# 全体ビルド
npm run build

# ファイル監視ビルド（開発用）
npm run watch
```

## セキュリティに関する注意

- `AUTH_TOKEN` を必ず設定すること。未設定の場合、認証なしで全APIにアクセスできる
- `--tunnel` を使う場合は `AUTH_TOKEN` が必須（未設定では起動拒否される）
- トンネルURLはランダム生成されるが、URLを知っている人は誰でもアクセスを試みるため、強力なトークンを設定すること
- `ALLOW_CUSTOM_COMMANDS` と `ALLOW_FILE_WRITE` はデフォルトで無効。必要な場合のみ有効にすること
- HTTPS を手動で有効にする場合は、信頼できる証明書を使用すること（トンネル経由の場合はCloudflareが自動的にHTTPSを付与する）
- トンネルを使わずLAN内のみで使う場合は、Tailscale等のVPN経由も安全な選択肢

## ヒント

- `--tunnel` を使えばQRコードがターミナルに表示される。スマホで読み取るだけでアクセス可能
- トンネルURLは起動のたびに変わる（Quick Tunnelのため）。固定URLが必要な場合はCloudflareアカウントでNamed Tunnelを設定する
- LAN内で使う場合はmDNS（`hostname.local`）が使えればIPアドレス不要で接続できる
- macOSでスリープを防止するには `npm run start:awake` を使用する
- サーバーはPC上で動作するため、PCは起動したままにすること
- トンネルが途中で切断された場合は自動再接続を3回まで試行する

## ライセンス

MIT
