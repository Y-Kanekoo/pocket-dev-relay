# Pocket Dev Relay 技術仕様書

## 概要

**Pocket Dev Relay** は、スマートフォンのブラウザからPCのターミナルにアクセスするリモート開発ツール。
WebSocket経由でPTY（疑似端末）を中継し、Codex CLI / Claude Code / シェル / SSH のセッションを操作できる。

## システム構成

```
┌─────────────────────────────────────────────────────────────┐
│ スマホブラウザ（PWA）                                        │
│  ├── xterm.js（ターミナルUI）                                │
│  ├── WebSocket Client（双方向通信）                          │
│  ├── Service Worker（オフラインキャッシュ / Push通知）        │
│  └── REST API Client（ファイル操作 / 設定 / AI解析）         │
└─────────────────────┬───────────────────────────────────────┘
                      │ WebSocket + HTTPS
┌─────────────────────▼───────────────────────────────────────┐
│ Node.js サーバー（Express + ws）                             │
│  ├── WebSocket Server（セッション管理 / PTY中継）            │
│  ├── REST API（ファイル / ログ / クリップボード / AI）        │
│  ├── PTY Service（node-pty）                                │
│  ├── SSH Service（ssh2）                                    │
│  ├── AI Service（Claude API / OpenAI API）                  │
│  ├── Notification Service（エラー検知 / Push通知）           │
│  └── Middleware（認証 / レート制限 / CSP / エラーハンドリング）│
└─────────────────────────────────────────────────────────────┘
```

## 技術スタック

| カテゴリ | 技術 | バージョン |
|----------|------|------------|
| ランタイム | Node.js | >= 20.0.0 |
| 言語 | TypeScript | ^5.6.0 |
| サーバー | Express | ^4.18.2 |
| WebSocket | ws | ^8.17.0 |
| ターミナル | node-pty | ^1.0.0 |
| SSH | ssh2 | ^1.17.0 |
| フロントエンド | xterm.js (@xterm/xterm) | ^5.5.0 |
| ビルド | esbuild | ^0.24.0 |
| テスト | Vitest | ^4.0.18 |
| リンター | ESLint + @typescript-eslint | ^8.57.0 |
| フォーマッター | Prettier | ^3.2.5 |

## API仕様

### 認証

全API（`/api/health`を除く）はトークン認証が必要。

```
Authorization: Bearer <AUTH_TOKEN>
```

WebSocketは接続時のクエリパラメータまたはヘッダーで認証。

```
ws://host:port/ws?token=<AUTH_TOKEN>
```

### REST API エンドポイント

#### 設定・システム

| メソッド | パス | 認証 | 説明 |
|----------|------|------|------|
| GET | `/api/health` | 不要 | ヘルスチェック |
| GET | `/api/config` | 必要 | アプリケーション設定 |
| GET | `/api/addresses` | 必要 | アクセスURL一覧 |
| GET | `/api/qr` | 必要 | QRコード（DataURL） |

#### ファイル操作

| メソッド | パス | 認証 | 説明 |
|----------|------|------|------|
| GET | `/api/files?path=` | 必要 | ディレクトリ一覧 |
| GET | `/api/file?path=` | 必要 | ファイル内容取得 |
| POST | `/api/file` | 必要 | ファイル保存 |
| POST | `/api/upload` | 必要 | ファイルアップロード（multipart） |

#### セッションログ

| メソッド | パス | 認証 | 説明 |
|----------|------|------|------|
| GET | `/api/logs` | 必要 | ログ一覧 |
| GET | `/api/log/:fileName` | 必要 | ログ内容取得 |
| DELETE | `/api/log/:fileName` | 必要 | ログ削除 |

#### クリップボード共有

| メソッド | パス | 認証 | 説明 |
|----------|------|------|------|
| GET | `/api/clipboard` | 必要 | クリップボード取得 |
| POST | `/api/clipboard` | 必要 | クリップボード設定 |
| DELETE | `/api/clipboard` | 必要 | クリップボードクリア |

#### コマンドスニペット

| メソッド | パス | 認証 | 説明 |
|----------|------|------|------|
| GET | `/api/snippets` | 必要 | スニペット一覧 |
| POST | `/api/snippets` | 必要 | スニペット追加 |
| DELETE | `/api/snippets/:id` | 必要 | スニペット削除 |
| POST | `/api/snippets/:id/execute` | 必要 | スニペット実行 |

#### AI解析

| メソッド | パス | 認証 | 説明 |
|----------|------|------|------|
| GET | `/api/ai/status` | 必要 | AI機能の有効状態 |
| POST | `/api/ai/analyze` | 必要 | ターミナル出力をAIで解析 |

### WebSocket プロトコル

#### 接続

```
ws://host:port/ws?token=<AUTH_TOKEN>
```

#### クライアント → サーバー

| type | 説明 | フィールド |
|------|------|------------|
| `start` | セッション開始 | `mode`, `cwd?`, `command?`, `sshConfig?` |
| `input` | ターミナル入力 | `data`, `sessionId?` |
| `resize` | ターミナルリサイズ | `cols`, `rows`, `sessionId?` |
| `stop` | セッション停止 | `sessionId?` |

#### サーバー → クライアント

| type | 説明 | フィールド |
|------|------|------------|
| `started` | セッション開始完了 | `sessionId`, `mode`, `cwd`, `label` |
| `data` | ターミナル出力 | `data`, `sessionId?` |
| `exit` | プロセス終了 | `exitCode`, `signal?`, `sessionId?` |
| `stopped` | セッション停止 | `reason`, `sessionId?` |
| `error` | エラー | `message` |
| `notification` | 通知 | `title`, `body`, `level`, `sessionId?` |

### セッションモード

| モード | コマンド | 説明 |
|--------|----------|------|
| `codex` | `codex` | OpenAI Codex CLI |
| `claude` | `claude` | Claude Code CLI |
| `shell` | `$SHELL_CMD` | シェル（bash/zsh） |
| `custom` | ユーザー指定 | カスタムコマンド |
| `ssh` | ssh2ライブラリ | SSH中継接続 |

## 環境変数

### サーバー基本設定

| 変数 | デフォルト | 説明 |
|------|------------|------|
| `PORT` | `4173` | サーバーポート |
| `WORKSPACE_ROOT` | `process.cwd()` | ワークスペースルート |
| `AUTH_TOKEN` | （空=認証無効） | 認証トークン |
| `ALLOW_CUSTOM_COMMANDS` | `false` | カスタムコマンド許可 |
| `ALLOW_FILE_WRITE` | `false` | ファイル書き込み許可 |
| `MAX_FILE_SIZE` | `1048576` (1MB) | 最大ファイルサイズ |
| `SHELL_CMD` | `$SHELL` or `zsh` | シェルコマンド |

### セッション設定

| 変数 | デフォルト | 説明 |
|------|------------|------|
| `ENABLE_SESSION_LOGS` | `false` | セッションログ有効化 |
| `LOG_DIR` | `$WORKSPACE_ROOT/logs` | ログディレクトリ |
| `SESSION_TIMEOUT` | `3600000` (1時間) | セッションタイムアウト（ms） |

### セキュリティ設定

| 変数 | デフォルト | 説明 |
|------|------------|------|
| `ENABLE_HTTPS` | `false` | HTTPS有効化 |
| `SSL_KEY_PATH` | （空） | SSL秘密鍵パス |
| `SSL_CERT_PATH` | （空） | SSL証明書パス |
| `RATE_LIMIT_API` | `100` | APIレート制限（回/分） |
| `RATE_LIMIT_AUTH` | `5` | 認証失敗制限（回/分） |

### SSH設定

| 変数 | デフォルト | 説明 |
|------|------------|------|
| `ENABLE_SSH` | `false` | SSH機能有効化 |
| `SSH_DEFAULT_HOST` | （空） | デフォルトホスト |
| `SSH_DEFAULT_PORT` | `22` | デフォルトポート |
| `SSH_DEFAULT_USER` | （空） | デフォルトユーザー |
| `SSH_KEY_PATH` | `~/.ssh/id_rsa` | 秘密鍵パス |

### AI設定

| 変数 | デフォルト | 説明 |
|------|------------|------|
| `ANTHROPIC_API_KEY` | （空） | Claude API キー |
| `OPENAI_API_KEY` | （空） | OpenAI API キー |
| `AI_MODEL` | 自動選択 | AIモデル名 |
| `AI_MAX_CONTEXT_LINES` | `100` | AI送信最大行数 |

### アップロード設定

| 変数 | デフォルト | 説明 |
|------|------------|------|
| `MAX_UPLOAD_SIZE` | `10485760` (10MB) | アップロード最大サイズ |

## ファイル構成

```
pocket-dev-relay/
├── src/
│   ├── server.ts              # サーバーエントリポイント
│   ├── cli.ts                 # CLIエントリポイント
│   ├── config.ts              # 環境変数管理
│   ├── types/index.ts         # 共通型定義（592行）
│   ├── services/
│   │   ├── session.ts         # セッション管理（PTY/SSH）
│   │   ├── websocket.ts       # WebSocketハンドラ
│   │   ├── pty.ts             # PTYプロセス生成
│   │   ├── ssh.ts             # SSH接続中継
│   │   ├── ai.ts              # AI解析サービス
│   │   └── notifier.ts        # エラー検知・通知
│   ├── routes/
│   │   ├── api.ts             # 設定・アドレス・QR
│   │   ├── files.ts           # ファイル操作・アップロード
│   │   ├── logs.ts            # セッションログ
│   │   ├── clipboard.ts       # クリップボード共有
│   │   ├── snippets.ts        # コマンドスニペット
│   │   ├── ai.ts              # AI解析エンドポイント
│   │   └── health.ts          # ヘルスチェック
│   ├── middleware/
│   │   ├── auth.ts            # 認証ミドルウェア
│   │   ├── errorHandler.ts    # エラーハンドリング
│   │   ├── rateLimit.ts       # レート制限
│   │   └── security.ts        # CSPヘッダー
│   ├── errors/AppError.ts     # カスタムエラークラス
│   ├── utils/
│   │   ├── network.ts         # ネットワークユーティリティ
│   │   └── path.ts            # パスユーティリティ
│   └── client/
│       ├── app.ts             # クライアントエントリポイント
│       ├── components/        # UIコンポーネント
│       ├── services/          # API/WebSocket/通知サービス
│       └── state/             # 状態管理
├── public/
│   ├── index.html             # メインHTML
│   ├── styles.css             # スタイルシート
│   ├── app.js                 # ビルド済みクライアント
│   ├── sw.js                  # Service Worker
│   ├── manifest.json          # PWAマニフェスト
│   └── icon.svg               # アイコン
├── tests/                     # テスト（Vitest, 100件）
├── dist/                      # ビルド出力
├── Dockerfile                 # マルチステージビルド
├── docker-compose.yml         # Docker構成
└── .github/workflows/         # CI/CD
```

## セキュリティ

### 実装済み
- トークン認証（Bearer token）
- CSP（Content Security Policy）ヘッダー
- X-Content-Type-Options, X-Frame-Options
- APIレート制限（100リクエスト/分）
- 認証失敗レート制限（5回/分）
- パストラバーサル防止（ファイル操作）
- セッションタイムアウト（1時間）
- HTTPS対応（オプション）

### 既知の制限
- SSHホスト鍵検証が無効化されている（開発用途）
- SSHパスワードがWebSocket経由で送信される（HTTPS推奨）
- CSPで `unsafe-inline` を許可中
- Docker: rootユーザーで実行

## デプロイ

### ローカル実行
```bash
npx pocket-dev-relay
```

### Docker
```bash
docker compose up -d
```

### npm グローバルインストール
```bash
npm install -g pocket-dev-relay
pocket-dev-relay --port 4173 --workspace /path/to/project
```

## バージョン

- 現在: v0.1.0（初回リリース）
- Node.js: >= 20.0.0
- ライセンス: MIT
