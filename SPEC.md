# Pocket Dev Relay 技術仕様書

> **この文書はAI（Claude / Codex）向けの技術仕様書である。**
> コード変更時に「どのファイルを変更すべきか」「どの関数に影響があるか」「既存パターンに従うべきか」を即座に判断するための参照ドキュメント。
> 人間も読むことを想定するが、網羅性・正確性を優先する。

**Pocket Dev Relay** — スマートフォンのブラウザからPCのターミナルにアクセスするリモート開発ツール。WebSocket経由でPTY（疑似端末）を中継し、Codex CLI / Claude Code / シェル / SSH のセッションを操作できる。PWA対応。

---

## 技術スタック

| カテゴリ | 技術 | バージョン |
|----------|------|------------|
| ランタイム | Node.js | >= 20.0.0 |
| 言語 | TypeScript | ^5.6.0 |
| サーバー | Express | ^4.18.2 |
| WebSocket | ws | ^8.17.0 |
| ターミナル | node-pty | ^1.0.0 |
| SSH | ssh2 | ^1.17.0 |
| ログ | pino + pino-pretty | ^10.3.0 |
| フロントエンド | バニラTS + xterm.js (@xterm/xterm) | ^5.5.0 |
| ビルド | esbuild | ^0.24.0 |
| テスト | Vitest + @vitest/coverage-v8 | ^4.0.18 |
| リンター | ESLint + @typescript-eslint | ^8.57.0 |
| フォーマッター | Prettier | ^3.2.5 |

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│ クライアント（PWA / スマホブラウザ）                              │
│                                                                 │
│  app.ts（IIFE）                                                 │
│  ├── sessionStore（シングルトン状態管理）                         │
│  ├── components/                                                │
│  │   ├── terminal.ts  ← xterm.js（CDN: Terminal, FitAddon）     │
│  │   ├── session.ts   ← セッション開始/停止UI                   │
│  │   ├── fileBrowser.ts ← ファイル操作                          │
│  │   ├── settings.ts  ← テーマ/フォント/通知設定                │
│  │   ├── clipboard.ts ← クリップボード共有                      │
│  │   ├── snippets.ts  ← コマンドスニペット                      │
│  │   ├── sshDialog.ts ← SSH接続ダイアログ                       │
│  │   ├── aiPanel.ts   ← AI解析パネル                            │
│  │   └── toast.ts     ← トースト通知                            │
│  └── services/                                                  │
│      ├── websocket.ts ← WebSocket通信（自動再接続）             │
│      ├── api.ts       ← REST API呼び出し                       │
│      ├── notification.ts ← ブラウザ通知                         │
│      └── errorHandler.ts ← エラーメッセージ変換                 │
│                                                                 │
│  public/sw.js（Service Worker: Network First キャッシュ）        │
└─────────────────┬───────────────────────────────────────────────┘
                  │ WebSocket (/ws) + REST (/api/*)
┌─────────────────▼───────────────────────────────────────────────┐
│ サーバー（Node.js / Express + ws）                               │
│                                                                 │
│  server.ts                                                      │
│  ├── middleware/                                                 │
│  │   ├── security.ts     ← CSP, HSTS, X-Frame-Options          │
│  │   ├── rateLimit.ts    ← express-rate-limit                   │
│  │   ├── auth.ts         ← Bearer token認証                    │
│  │   └── errorHandler.ts ← AppError→JSON変換                   │
│  ├── routes/                                                    │
│  │   ├── health.ts     GET /api/health （認証不要）             │
│  │   ├── api.ts        GET /api/config, /addresses, /qr        │
│  │   ├── files.ts      GET/POST /api/files, /file, /upload     │
│  │   ├── logs.ts       GET /api/logs, /log/:fileName            │
│  │   ├── clipboard.ts  GET/POST/DELETE /api/clipboard           │
│  │   ├── snippets.ts   CRUD /api/snippets                      │
│  │   └── ai.ts         GET/POST /api/ai/*                      │
│  └── services/                                                  │
│      ├── session.ts    ← セッションライフサイクル管理            │
│      ├── websocket.ts  ← WebSocketハンドラ+タイムアウト         │
│      ├── pty.ts        ← コマンドプリセット+PTY生成             │
│      ├── ssh.ts        ← ssh2接続中継+ホスト鍵検証             │
│      ├── ai.ts         ← Claude/OpenAI API呼び出し             │
│      ├── notifier.ts   ← エラーパターン検知+通知               │
│      └── logger.ts     ← pino構造化ログ                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## ファイルマップ

```
src/
├── server.ts                (124行) サーバーエントリポイント
├── cli.ts                   ( 61行) CLIエントリポイント（parseArgs）
├── config.ts                (135行) 全環境変数管理
├── types/index.ts           (592行) 共通型定義
├── services/
│   ├── logger.ts            ( 28行) pino構造化ログ
│   ├── session.ts           (460行) セッション管理（PTY/SSH/ログ）
│   ├── websocket.ts         (195行) WebSocketハンドラ+タイムアウト
│   ├── pty.ts               (145行) コマンドプリセット+引数パース
│   ├── ssh.ts               (222行) SSH接続中継+ホスト鍵検証
│   ├── ai.ts                (237行) AI解析（Claude/OpenAI）
│   └── notifier.ts          (169行) エラー検知+通知
├── routes/
│   ├── health.ts            ( 39行) ヘルスチェック
│   ├── api.ts               (112行) 設定/アドレス/QR
│   ├── files.ts             (254行) ファイル操作/アップロード
│   ├── logs.ts              (105行) セッションログ
│   ├── clipboard.ts         ( 68行) クリップボード共有
│   ├── snippets.ts          (127行) コマンドスニペット
│   └── ai.ts                ( 74行) AI解析エンドポイント
├── middleware/
│   ├── auth.ts              ( 56行) トークン認証
│   ├── errorHandler.ts      ( 99行) エラーハンドリング
│   ├── rateLimit.ts         ( 67行) レート制限
│   └── security.ts          ( 55行) セキュリティヘッダー
├── errors/AppError.ts       (171行) カスタムエラー階層
├── utils/
│   ├── path.ts              ( 52行) パス解決+FSエラー変換
│   └── network.ts           ( 86行) ネットワークインターフェース
└── client/
    ├── app.ts               (407行) クライアントエントリポイント
    ├── components/
    │   ├── terminal.ts      (308行) ターミナル管理（xterm.js）
    │   ├── session.ts       (327行) セッションUI制御
    │   ├── fileBrowser.ts   (480行) ファイルブラウザ
    │   ├── settings.ts      (308行) テーマ/フォント/通知設定
    │   ├── aiPanel.ts       (357行) AI解析パネル
    │   ├── clipboard.ts     (250行) クリップボード共有
    │   ├── snippets.ts      (263行) コマンドスニペット
    │   ├── sshDialog.ts     (188行) SSH接続ダイアログ
    │   └── toast.ts         ( 59行) トースト通知
    ├── services/
    │   ├── api.ts           (209行) REST API呼び出し
    │   ├── websocket.ts     (176行) WebSocket通信
    │   ├── notification.ts  (196行) ブラウザ通知
    │   └── errorHandler.ts  (195行) エラーメッセージ変換
    └── state/
        └── sessionStore.ts  (396行) シングルトン状態管理

public/
├── index.html               (394行) メインHTML
├── styles.css                       CSSカスタムプロパティ+ダークモード
├── app.js                   (48KB)  ビルド済みクライアント
├── sw.js                            Service Worker（Network First）
├── manifest.json                    PWAマニフェスト
└── icon.svg                         SVGアイコン

tests/
├── server/
│   ├── auth.test.ts         (17件)
│   ├── session.test.ts      (13件)
│   ├── utils.test.ts        (33件)
│   ├── health.test.ts       ( 4件)
│   ├── clipboard.test.ts    ( 4件)
│   ├── snippets.test.ts     ( 6件)
│   ├── security.test.ts     ( 7件)
│   └── notifier.test.ts     (21件)
└── client/
    ├── utils.test.ts        (23件)
    └── services/
        └── api.test.ts      (14件)

合計: 142テスト、10ファイル
```

---

## 変更ガイド（AI向け逆引き表）

| やりたいこと | 変更するファイル |
|---|---|
| **新しいREST APIエンドポイント追加** | 1. `src/types/index.ts`（リクエスト/レスポンス型） → 2. `src/routes/新ファイル.ts`（ルート実装） → 3. `src/server.ts`（ルーター登録） → 4. `src/client/services/api.ts`（API呼び出し関数） → 5. テスト追加 |
| **新しいセッションモード追加** | 1. `src/types/index.ts`（SessionModeに追加） → 2. `src/services/pty.ts`（PRESETSに追加） → 3. `src/services/session.ts`（startSession分岐） → 4. `src/services/websocket.ts`（start処理分岐） → 5. `src/client/components/session.ts`（UIボタン） → 6. `public/index.html`（モードカード） |
| **環境変数追加** | 1. `src/config.ts`（定数追加） → 2. `.env.example`（説明追加） → 3. 使用箇所でimport |
| **新しいクライアントコンポーネント** | 1. `src/client/components/新ファイル.ts`（コンポーネント） → 2. `src/client/app.ts`（import+初期化） → 3. `public/index.html`（HTML要素） → 4. `public/styles.css`（スタイル） |
| **テスト追加** | 1. `tests/server/` or `tests/client/` に `*.test.ts` → vitest.config.tsのincludeパターンで自動認識 |
| **ミドルウェア追加** | 1. `src/middleware/新ファイル.ts` → 2. `src/server.ts`（app.use() — **順序に注意**） |
| **エラーコード追加** | 1. `src/errors/AppError.ts`（サブクラス） → 2. `src/client/services/errorHandler.ts`（ERROR_MAPPINGに日本語追加） |

---

## サーバー詳細

### server.ts — ミドルウェア登録順（順序が重要）

```
1. securityHeaders          ← 全リクエスト（CSP, HSTS等）
2. express.json({limit:'2mb'})
3. express.static('public') ← 静的ファイル
4. express.static('vendor') ← node_modules（xterm.js等）
5. healthRouter             ← 認証不要（ヘルスチェック）
6. createRateLimiter()      ← /api/* にレート制限
7. apiRouter                ← /api（設定/アドレス/QR）※認証はルーター内で処理
8. filesRouter              ← /api（ファイル操作）
9. logsRouter               ← /api（ログ）
10. clipboardRouter         ← /api（クリップボード）
11. snippetsRouter          ← /api（スニペット）
12. aiRouter                ← /api（AI解析）
13. notFoundHandler         ← 404
14. errorHandler            ← 500（AppError→JSON）
```

### config.ts — 全環境変数

| 変数 | 型 | デフォルト | 説明 |
|------|-----|-----------|------|
| `PORT` | number | 4173 | サーバーポート |
| `WORKSPACE_ROOT` | string | cwd() | ワークスペースルート |
| `AUTH_TOKEN` | string | '' (認証無効) | 認証トークン |
| `ALLOW_CUSTOM_COMMANDS` | boolean | false | カスタムコマンド許可 |
| `ALLOW_FILE_WRITE` | boolean | false | ファイル書き込み許可 |
| `MAX_FILE_SIZE` | number | 1048576 (1MB) | 最大ファイルサイズ |
| `SHELL_CMD` | string | $SHELL or 'zsh' | シェルコマンド |
| `MAX_UPLOAD_SIZE` | number | 10485760 (10MB) | アップロード最大サイズ |
| `LOG_LEVEL` | string | 'info' | ログレベル（pino） |
| `ENABLE_SESSION_LOGS` | boolean | false | セッションログ有効化 |
| `LOG_DIR` | string | $ROOT/logs | ログディレクトリ |
| `LOG_MAX_AGE_DAYS` | number | 30 | ログ保持日数 |
| `LOG_MAX_SIZE_MB` | number | 100 | ログ最大合計サイズ |
| `SESSION_TIMEOUT` | number | 3600000 (1h) | セッションタイムアウト(ms) |
| `ENABLE_HTTPS` | boolean | false | HTTPS有効化 |
| `SSL_KEY_PATH` | string | '' | SSL秘密鍵パス |
| `SSL_CERT_PATH` | string | '' | SSL証明書パス |
| `RATE_LIMIT_API` | number | 100 | APIレート制限(回/分) |
| `RATE_LIMIT_AUTH` | number | 5 | 認証失敗制限(回/分) |
| `ENABLE_SSH` | boolean | false | SSH機能有効化 |
| `SSH_DEFAULT_HOST` | string | '' | SSHデフォルトホスト |
| `SSH_DEFAULT_PORT` | number | 22 | SSHデフォルトポート |
| `SSH_DEFAULT_USER` | string | '' | SSHデフォルトユーザー |
| `SSH_KEY_PATH` | string | ~/.ssh/id_rsa | SSH秘密鍵パス |
| `SSH_STRICT_HOST_KEY` | boolean | true | known_hostsによるホスト鍵検証 |
| `SSH_REQUIRE_HTTPS_FOR_PASSWORD` | boolean | true | パスワード認証にHTTPS要求 |
| `ANTHROPIC_API_KEY` | string | '' | Claude APIキー |
| `OPENAI_API_KEY` | string | '' | OpenAI APIキー |
| `AI_MODEL` | string | 自動選択 | AIモデル名 |
| `AI_MAX_CONTEXT_LINES` | number | 100 | AI送信最大行数 |

### サービス層

#### services/session.ts (460行) — セッション管理

**内部状態:**
- `sessions: Map<string, SessionInternal>` — アクティブセッション
- `sessionLogs: Map<string, SessionLogMetaInternal>` — ログメタデータ

**エクスポート関数:**
```typescript
initLogDir(): Promise<void>                           // ログディレクトリ初期化 + ローテーション
send(ws: WebSocket, payload: ServerMessage): void     // WebSocket送信
startSession(config: SessionConfig, ws): Promise<SessionInternal>   // PTYセッション開始
startSSHSession(config: SessionConfig, ws): Promise<SessionInternal> // SSHセッション開始
stopSession(sessionId: string, reason: string): void  // セッション停止
cleanupAllSessions(): void                            // 全セッション終了（SIGINT用）
```

**内部関数:**
- `rotateOldLogs()` — LOG_MAX_AGE_DAYS/LOG_MAX_SIZE_MBに基づく自動削除
- `generateLogFileName(sessionId, mode)` — ログファイル名生成
- `stripAnsi(str)` — ANSIエスケープ除去

#### services/websocket.ts (195行) — WebSocketハンドラ

**内部状態:**
- `sessionTimers: Map<string, SessionTimers>` — タイムアウト/警告タイマー

**エクスポート関数:**
```typescript
setupWebSocketHandlers(wss: WebSocketServer): void
```

**タイムアウト機構:**
- 入力があるたびにリセット
- 警告: タイムアウト5分前
- 自動切断: SESSION_TIMEOUT到達時

#### services/pty.ts (145行) — コマンドプリセット

**エクスポート関数:**
```typescript
spawnForMode(mode: SessionMode, customCommand?: string): SpawnConfig
```

**PRESETS:**
- `codex`: `{ command: 'codex', args: [] }`
- `claude`: `{ command: 'claude', args: [] }`
- `shell`: `{ command: SHELL_CMD, args: [] }`

#### services/ssh.ts (222行) — SSH接続中継

**エクスポート関数:**
```typescript
isSSHEnabled(): boolean
createSSHSession(config: SSHConnectionConfig): Promise<SSHSessionResult>
resizeSSHChannel(channel: ClientChannel, cols: number, rows: number): void
closeSSHConnection(client: SSHClient): void
```

**セキュリティ:**
- `loadKnownHosts()` — ~/.ssh/known_hostsを読み込みMap<host, key[]>を返す
- `SSH_STRICT_HOST_KEY=true`（デフォルト）: known_hostsに未登録のホストは拒否
- `SSH_REQUIRE_HTTPS_FOR_PASSWORD=true`（デフォルト）: HTTPS未使用時のパスワード認証を拒否

#### services/ai.ts (237行) — AI解析

**エクスポート関数:**
```typescript
createAIProvider(): AIProvider | null
```

**AIProvider インターフェース:**
```typescript
interface AIProvider {
  name: AIProviderName          // 'claude' | 'openai'
  model: string
  analyze(context: string, question: string): Promise<string>
}
```

**実装:** ClaudeProvider（Anthropic Messages API）, OpenAIProvider（Chat Completions API）

#### services/notifier.ts (169行) — エラー検知

**内部状態:**
- `lastNotificationTime: Map<string, number>` — クールダウン(5秒)

**エクスポート関数:**
```typescript
detectError(data: string): string | null           // エラーパターン検知
sendErrorNotification(ws, sessionId, errorLine): void
sendExitNotification(ws, sessionId, exitCode, signal, label): void
clearNotificationState(sessionId: string): void
```

**検知パターン:** `/error/i`, `/failed/i`, `/exception/i`, `/ENOENT/`, `/permission denied/i`
**除外パターン:** `/0 errors?/i`, `/error[._-]?handler/i`, `/if.*error/i`

#### services/logger.ts (28行) — 構造化ログ

```typescript
export default logger: pino.Logger
// 開発: pino-pretty（色付き出力）
// 本番: JSON形式
// レベル: LOG_LEVEL環境変数
```

### ルート層 — REST APIエンドポイント

#### routes/health.ts (認証不要)

| メソッド | パス | レスポンス型 |
|----------|------|-------------|
| GET | `/api/health` | `HealthResponse` |

#### routes/api.ts (認証必要)

| メソッド | パス | レスポンス型 |
|----------|------|-------------|
| GET | `/api/config` | `AppConfig` |
| GET | `/api/addresses` | `AddressesResponse` |
| GET | `/api/qr?text=` | `QrResponse` |

#### routes/files.ts (認証必要)

| メソッド | パス | レスポンス型 | 備考 |
|----------|------|-------------|------|
| GET | `/api/files?path=` | `FileListResponse` | |
| GET | `/api/file?path=` | `FileContentResponse` | MAX_FILE_SIZE制限 |
| POST | `/api/file` | `FileWriteResponse` | ALLOW_FILE_WRITE=true要 |
| POST | `/api/upload` | `UploadResponse` | multer, MAX_UPLOAD_SIZE制限 |

#### routes/logs.ts (認証必要, ENABLE_SESSION_LOGS=true要)

| メソッド | パス | レスポンス型 |
|----------|------|-------------|
| GET | `/api/logs` | `SessionLogsResponse` |
| GET | `/api/log/:fileName` | `SessionLogContentResponse` |

#### routes/clipboard.ts (認証必要)

| メソッド | パス | レスポンス型 | 内部状態 |
|----------|------|-------------|---------|
| GET | `/api/clipboard` | `ClipboardResponse` | clipboardStore: ClipboardData \| null |
| POST | `/api/clipboard` | `ClipboardResponse` | メモリ保持（再起動で消失） |
| DELETE | `/api/clipboard` | `{ok: true}` | |

#### routes/snippets.ts (認証必要)

| メソッド | パス | レスポンス型 | 内部状態 |
|----------|------|-------------|---------|
| GET | `/api/snippets` | `SnippetsResponse` | snippetStore: Snippet[] |
| POST | `/api/snippets` | `Snippet` | メモリ保持（再起動で消失） |
| DELETE | `/api/snippets/:id` | `{ok: true}` | |
| POST | `/api/snippets/:id/execute` | `SnippetExecuteResponse` | アクティブセッションに送信 |

**デフォルトスニペット:** `git status`, `git log --oneline -10`, `ls -la`, `npm test`

#### routes/ai.ts (認証必要)

| メソッド | パス | レスポンス型 |
|----------|------|-------------|
| GET | `/api/ai/status` | `AIStatusResponse` |
| POST | `/api/ai/analyze` | `AIAnalyzeResponse` |

### ミドルウェア層

#### middleware/auth.ts
- `authMiddleware(req, res, next)` — Bearer token検証（AUTH_TOKEN空 → 認証スキップ）
- `authorizeWebSocket(req)` — クエリパラメータ `?token=` で検証

#### middleware/errorHandler.ts
- `errorHandler(err, req, res, next)` — AppError → JSON変換、500エラー時スタックトレース（開発のみ）
- `notFoundHandler(req, res, next)` — 404
- `asyncHandler(fn)` — async/awaitラッパー

#### middleware/rateLimit.ts
- `createRateLimiter()` — RATE_LIMIT_API回/分
- `createAuthRateLimiter()` — RATE_LIMIT_AUTH回/分（skipSuccessfulRequests）
- `createWebSocketRateLimiter()` — 10接続/分

#### middleware/security.ts
- CSP: `default-src 'self'`, `script-src/style-src 'unsafe-inline'`, `connect-src ws: wss:`
- HSTS: HTTPS時のみ（max-age=31536000）
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff

### エラー体系 — errors/AppError.ts

```
AppError (基底: code, statusCode, message, details?)
├── AuthenticationError      (401, AUTHENTICATION_FAILED)
├── NotFoundError            (404, NOT_FOUND)
├── ValidationError          (400, VALIDATION_ERROR)
├── FileTooLargeError        (413, FILE_TOO_LARGE)
├── InvalidPathError         (400, INVALID_PATH)
├── FeatureDisabledError     (403, FEATURE_DISABLED)
├── FileTypeError            (400, NOT_A_FILE / NOT_A_DIRECTORY)
├── SessionError             (400, カスタムコード)
└── InternalServerError      (500, INTERNAL_SERVER_ERROR)
```

### ユーティリティ

#### utils/path.ts
- `resolvePath(relativePath): string` — ROOT_DIR内に限定（パストラバーサル防止）
- `convertFsError(error, name): AppError` — FSエラー → AppError変換

#### utils/network.ts
- `buildAccessUrls(): AccessUrl[]` — mDNS/LAN/localhost URL一覧

---

## クライアント詳細

### state/sessionStore.ts — シングルトン状態管理

**管理する状態:**
```typescript
mode: SessionMode                           // 現在のモード
ws: WebSocket | null                        // WebSocket接続
config: AppConfig | null                    // サーバー設定
token: string                               // 認証トークン
sessions: Map<string, ClientSessionInfo>    // 複数セッション（最大5）
activeSessionId: string | null              // アクティブセッション
nextSessionNum: number                      // セッション番号カウンタ
reconnect: ReconnectConfig                  // 再接続設定
currentFontSize: number                     // フォントサイズ（10-24, デフォルト13）
```

**LocalStorageキー:**
- `pdr_token` — 認証トークン
- `pdr_terminal_font_size` — フォントサイズ
- `pdr_theme` — テーマ（'light' | 'dark'）
- `pdr-notification-enabled` — 通知有効
- `pdr-notification-error` — エラー通知有効
- `pdr-notification-exit` — 終了通知有効

**定数:** `MAX_SESSIONS = 5`, `FONT_SIZE_MIN = 10`, `FONT_SIZE_MAX = 24`

### コンポーネント概要

| コンポーネント | 主な責務 | エクスポート関数 |
|---|---|---|
| terminal.ts | xterm.js管理、タブUI | `initTerminal`, `createSession`, `deleteSession`, `fitActiveSession` |
| session.ts | セッション開始/停止、モード選択 | `initSessionUI`, `setStatus`, `handleServerMessage`, `updateModeUI` |
| fileBrowser.ts | ファイル一覧/編集/アップロード | `initFileBrowser`, `loadFiles`, `loadAddresses` |
| settings.ts | テーマ/フォント/通知設定 | `initSettings`, `applyTheme`, `toggleTheme`, `getCurrentTheme` |
| aiPanel.ts | AI解析パネル | `initAIPanel`, `checkAIStatus` |
| clipboard.ts | クリップボード共有モーダル | `initClipboard` |
| snippets.ts | スニペットドロワー | `initSnippets` |
| sshDialog.ts | SSH接続ダイアログ | `initSSHDialog`, `showSSHDialog`, `hideSSHDialog`, `setSSHDefaults` |
| toast.ts | トースト通知 | `initToast`, `showToast(message, type, duration)` |

### サービス概要

| サービス | 主な責務 |
|---|---|
| api.ts | REST API呼び出し（authHeaders付き）、401で認証画面遷移 |
| websocket.ts | WebSocket接続/再接続（指数バックオフ: 1s→2s→4s...最大30s、最大10回） |
| notification.ts | Notification API連携、バックグラウンド時ブラウザ通知/フォアグラウンド時トースト |
| errorHandler.ts | エラーコード→日本語メッセージ変換（`translateError(code)`） |

---

## グローバル状態一覧

| 場所 | 変数名 | 型 | 説明 |
|------|--------|-----|------|
| services/session.ts | `sessions` | `Map<string, SessionInternal>` | アクティブセッション |
| services/session.ts | `sessionLogs` | `Map<string, SessionLogMetaInternal>` | ログメタデータ |
| services/websocket.ts | `sessionTimers` | `Map<string, SessionTimers>` | タイムアウトタイマー |
| services/notifier.ts | `lastNotificationTime` | `Map<string, number>` | 通知クールダウン(5秒) |
| routes/clipboard.ts | `clipboardStore` | `ClipboardData \| null` | メモリ内クリップボード |
| routes/snippets.ts | `snippetStore` | `Snippet[]` | メモリ内スニペット |
| routes/ai.ts | `aiProvider` | `AIProvider \| null` | AIプロバイダー（起動時に1回作成） |
| client/state/sessionStore.ts | `sessionStore` | `SessionStore` | クライアント全状態（シングルトン） |

**注意:** clipboard, snippetsはメモリ保持のため、サーバー再起動で消失する。

---

## WebSocketプロトコル

### 接続
```
ws://host:port/ws?token=<AUTH_TOKEN>
```

### クライアント → サーバー (ClientMessage)

| type | フィールド | 説明 |
|------|-----------|------|
| `start` | `mode: SessionMode`, `cwd?: string`, `command?: string`, `sshConfig?: SSHConnectionConfig` | セッション開始 |
| `input` | `data: string`, `sessionId?: string` | ターミナル入力 |
| `resize` | `cols: number`, `rows: number`, `sessionId?: string` | リサイズ |
| `stop` | `sessionId?: string` | セッション停止 |

### サーバー → クライアント (ServerMessage)

| type | フィールド | 説明 |
|------|-----------|------|
| `started` | `sessionId`, `mode`, `cwd`, `label` | セッション開始完了 |
| `data` | `data: string`, `sessionId?` | ターミナル出力 |
| `exit` | `exitCode: number`, `signal?: string`, `sessionId?` | プロセス終了 |
| `stopped` | `reason: string`, `sessionId?` | セッション停止 |
| `error` | `message: string` | エラー |
| `notification` | `title`, `body`, `level: 'info'\|'success'\|'warning'\|'error'`, `sessionId?` | 通知 |

### セッションモード

| モード | サーバー側処理 | コマンド |
|--------|-------------|---------|
| `codex` | pty.spawn() | `codex` |
| `claude` | pty.spawn() | `claude` |
| `shell` | pty.spawn() | `$SHELL_CMD` |
| `custom` | pty.spawn() | ユーザー指定（ALLOW_CUSTOM_COMMANDS=true要） |
| `ssh` | ssh2.connect() | ssh2ライブラリ（PTY不使用） |

---

## セキュリティ

### 実装済み対策
- **認証**: Bearer token（AUTH_TOKEN空 → 認証無効）
- **CSP**: Content Security Policy ヘッダー
- **HSTS**: HTTPS時のみ有効
- **X-Frame-Options**: DENY（クリックジャッキング防止）
- **X-Content-Type-Options**: nosniff
- **レート制限**: API 100回/分、認証失敗 5回/分
- **パストラバーサル防止**: resolvePath()でROOT_DIR内に限定
- **セッションタイムアウト**: デフォルト1時間、入力でリセット
- **SSHホスト鍵検証**: known_hostsベース（SSH_STRICT_HOST_KEY=true）
- **SSHパスワードHTTPS制限**: HTTPS未使用時のパスワード認証拒否（デフォルト有効）
- **Docker非root実行**: USER nodeディレクティブ
- **Dockerヘルスチェック**: /api/health監視

### 既知の制限
- CSPで `script-src 'unsafe-inline'`, `style-src 'unsafe-inline'` を許可中
- known_hostsのハッシュ化ホスト名（HashKnownHosts）は未対応
- クリップボード/スニペットはメモリ保持（永続化なし）

---

## 設計パターン・コーディング規約

### 規約
- **`any`禁止** — `@typescript-eslint/no-explicit-any: "error"`
- **コメントは日本語**
- **変数名・関数名は英語**
- **エラーメッセージ・ログは日本語**

### パターン

| パターン | 使用箇所 | 説明 |
|---------|---------|------|
| シングルトン状態管理 | sessionStore | クライアント全状態を1インスタンスで管理 |
| コールバックベース疎結合 | 全コンポーネントのinit関数 | `initXxx(elems, { onSomething })` 形式 |
| IIFE初期化 | app.ts | `(() => { init() })()` でスコープ分離 |
| asyncHandler | ルート定義 | `router.get('/', asyncHandler(async (req, res) => ...))` |
| AppErrorサブクラス | エラー処理 | 各エラー種別にサブクラスを定義 |
| CDNグローバル変数 | terminal.ts | `Terminal`, `FitAddon` はCDN経由でグローバル宣言 |
| Map<string, T>状態管理 | サーバー側全般 | セッション、ログ、タイマーをMapで管理 |

---

## テスト

### テスト構成 (142件、10ファイル)

| ファイル | テスト数 | 対象 |
|---------|---------|------|
| server/auth.test.ts | 17 | トークン認証 |
| server/session.test.ts | 13 | セッション管理 |
| server/utils.test.ts | 33 | パス解決、FSエラー変換 |
| server/health.test.ts | 4 | ヘルスチェックAPI |
| server/clipboard.test.ts | 4 | クリップボードAPI |
| server/snippets.test.ts | 6 | スニペットAPI |
| server/security.test.ts | 7 | セキュリティヘッダー |
| server/notifier.test.ts | 21 | エラーパターン検知 |
| client/utils.test.ts | 23 | クライアントユーティリティ |
| client/services/api.test.ts | 14 | API呼び出し |

### カバレッジ設定 (vitest.config.ts)

```typescript
coverage: {
  provider: 'v8',
  thresholds: { statements: 50, branches: 40, functions: 50, lines: 50 }
}
```

### テスト未対象（意図的に除外）
- `src/client/**/*.ts` — ブラウザ環境依存
- `src/services/session.ts` — PTY依存
- `src/services/websocket.ts` — WebSocket依存
- `src/services/ssh.ts` — SSH接続依存
- `src/services/pty.ts` — ネイティブモジュール依存
- `src/services/ai.ts` — 外部API依存

---

## ビルド・デプロイ

### ビルドコマンド

| コマンド | 出力 | サイズ |
|---------|------|--------|
| `npm run build:server` | dist/server.js | ~1.7MB |
| `npm run build:client` | public/app.js | ~48KB |
| `npm run build:cli` | dist/cli.js | ~3KB |

**esbuild external:** `node-pty`, `ssh2`, `cpu-features`, `pino`, `pino-pretty`

### npmスクリプト

| スクリプト | 説明 |
|-----------|------|
| `build` | サーバー+クライアント+CLIをビルド |
| `dev` | ビルド → サーバー起動 |
| `start` | ビルド済みサーバー起動 |
| `watch` | concurrently でサーバー+クライアントをwatch |
| `lint` | ESLint実行 |
| `format` | Prettier実行 |
| `typecheck` | tsc --noEmit（サーバー+クライアント） |
| `test` | vitest（watchモード） |
| `test:run` | vitest run（1回実行） |

### Docker

- **Dockerfile**: マルチステージビルド（builder: alpine+ビルドツール → runner: alpine+node user）
- **docker-compose.yml**: ポート4173、ワークスペースマウント、ヘルスチェック
- **非rootユーザー**: `USER node`

### CI/CD (.github/workflows/)

- **ci.yml**: テスト（Node 20/22マトリクス）、リント、セキュリティ（npm audit）
- **release.yml**: タグpushでGitHub Release自動作成
- **dependabot.yml**: npm + GitHub Actions 週次更新

---

## バージョン情報

| 項目 | 値 |
|------|-----|
| バージョン | 0.1.0 |
| Node.js | >= 20.0.0 |
| ライセンス | MIT |
| リポジトリ | https://github.com/Y-Kanekoo/pocket-dev-relay |
