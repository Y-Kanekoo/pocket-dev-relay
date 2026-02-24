# Pocket Dev Relay 仕様書

## 概要

Pocket Dev Relay は、外出先からスマートフォンのブラウザで自宅PCのターミナルを操作するためのリモート開発ツールである。Express + WebSocket サーバーがPCで動作し、xterm.js ベースのクライアントがブラウザで動作する。

主要な通信方式:
- **REST API**: 設定取得、ファイル操作、クリップボード共有、スニペット管理、AI解析
- **WebSocket**: ターミナルセッション（PTY/SSH）のリアルタイム入出力

---

## 認証方式

### トークンベース認証

環境変数 `AUTH_TOKEN` が設定されている場合、`GET /api/health` を除くすべてのエンドポイントで認証が必要となる。

#### HTTP API認証

```
Authorization: Bearer <AUTH_TOKEN>
```

- タイミング安全な比較（SHA-256ハッシュ経由の `timingSafeEqual`）を使用
- `AUTH_TOKEN` 未設定時は認証をスキップ（全APIアクセス可能）

#### WebSocket認証

2つの方式をサポート:

1. **クエリパラメータ方式**（後方互換）
   ```
   ws://host:port/ws?token=<AUTH_TOKEN>
   ```

2. **メッセージベース方式**（推奨）
   - 接続後5秒以内に認証メッセージを送信
   - タイムアウト時は `4001` コードで切断
   ```json
   { "type": "auth", "token": "<AUTH_TOKEN>" }
   ```
   - 認証結果:
   ```json
   { "type": "auth_result", "ok": true }
   ```

---

## REST API 仕様

### ヘルスチェック

#### GET /api/health

認証不要。サーバーの稼働状態を返す。

**レスポンス:**
```json
{
  "status": "ok",
  "uptime": 3600,
  "version": "1.0.0",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "activeSessions": 1,
  "memory": {
    "rss": 50331648,
    "heapUsed": 20971520
  }
}
```

### 設定

#### GET /api/config

アプリケーション設定を取得。

**レスポンス:**
```json
{
  "workspaceRoot": "/Users/you/project",
  "workspaceName": "project",
  "modes": ["codex", "claude", "shell"],
  "allowCustomCommands": false,
  "fileWriteEnabled": false,
  "authEnabled": true,
  "maxFileSize": 1048576,
  "sessionLogsEnabled": false,
  "sshEnabled": false
}
```

- `modes`: 利用可能なセッションモード。`ENABLE_SSH=true` 時に `"ssh"` が追加される
- `sshDefaultHost`, `sshDefaultPort`, `sshDefaultUser`: SSH有効時のみ含まれる

#### GET /api/addresses

アクセスURL一覧を取得。

**レスポンス:**
```json
{
  "port": 4173,
  "urls": [
    { "type": "tunnel", "name": "cloudflared", "host": "xxx.trycloudflare.com", "url": "https://xxx.trycloudflare.com" },
    { "type": "mdns", "name": "hostname.local", "host": "hostname.local:4173", "url": "http://hostname.local:4173" },
    { "type": "lan", "name": "en0", "host": "192.168.1.10:4173", "url": "http://192.168.1.10:4173" }
  ]
}
```

- `type`: `"tunnel"` | `"mdns"` | `"lan"` | `"local"`

#### GET /api/qr?text=\<url\>

QRコードをdata URL形式で生成。

**パラメータ:**
- `text` (必須): QRコードに変換するテキスト

**レスポンス:**
```json
{
  "dataUrl": "data:image/png;base64,..."
}
```

### ファイル操作

#### GET /api/files?path=\<relative_path\>

ディレクトリ内のファイル一覧を取得。

**パラメータ:**
- `path` (任意): ワークスペースルートからの相対パス。省略時はルート

**レスポンス:**
```json
{
  "path": "src",
  "items": [
    { "name": "server.ts", "type": "file" },
    { "name": "client", "type": "dir" }
  ]
}
```

- ディレクトリが先、ファイルが後の順でソート
- パストラバーサル防止: ワークスペースルート外へのアクセスは拒否

#### GET /api/file?path=\<relative_path\>

ファイル内容を取得。

**パラメータ:**
- `path` (必須): ファイルの相対パス

**レスポンス:**
```json
{
  "path": "src/server.ts",
  "content": "import express from 'express';\n..."
}
```

**エラー:**
- `MAX_FILE_SIZE` 超過時: `{ "error": "file-too-large", "size": 2000000, "maxSize": 1048576 }`

#### POST /api/file

ファイルに書き込み。`ALLOW_FILE_WRITE=true` が必要。

**リクエストボディ:**
```json
{
  "path": "src/example.ts",
  "content": "console.log('hello');\n"
}
```

**レスポンス:**
```json
{ "ok": true }
```

#### POST /api/upload

ファイルをアップロード（multipart/form-data）。`ALLOW_FILE_WRITE=true` が必要。

**フォームフィールド:**
- `file`: アップロードファイル
- `uploadPath` (任意): アップロード先の相対ディレクトリ（デフォルト: `"."`)

**レスポンス:**
```json
{
  "ok": true,
  "fileName": "example.txt",
  "path": "src/example.txt",
  "size": 1024
}
```

- サイズ制限: `MAX_UPLOAD_SIZE`（デフォルト10MB）

### クリップボード

#### GET /api/clipboard

クリップボード内容を取得。

**レスポンス:**
```json
{
  "text": "コピーしたテキスト",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

#### POST /api/clipboard

クリップボードにテキストを設定。

**リクエストボディ:**
```json
{ "text": "設定するテキスト" }
```

#### DELETE /api/clipboard

クリップボードをクリア。

**レスポンス:**
```json
{ "ok": true }
```

### コマンドスニペット

#### GET /api/snippets

スニペット一覧を取得。

**レスポンス:**
```json
{
  "snippets": [
    { "id": "abc12345", "label": "git status", "command": "git status\n" }
  ]
}
```

#### POST /api/snippets

スニペットを追加。

**リクエストボディ:**
```json
{
  "label": "git log",
  "command": "git log --oneline -10\n"
}
```

#### DELETE /api/snippets/:id

スニペットを削除。

#### POST /api/snippets/:id/execute

スニペットをアクティブセッションで実行。最初に見つかったPTYセッションにコマンドを送信する。

**レスポンス:**
```json
{ "ok": true, "message": "コマンド \"git status\" を実行しました" }
```

アクティブセッションがない場合:
```json
{ "ok": false, "message": "アクティブなセッションがありません" }
```

### AI解析

#### GET /api/ai/status

AI機能のステータスを取得。

**レスポンス:**
```json
{
  "enabled": true,
  "provider": "claude",
  "model": "claude-sonnet-4-5-20250929"
}
```

- `ANTHROPIC_API_KEY` 設定時: `provider: "claude"`
- `OPENAI_API_KEY` 設定時: `provider: "openai"`
- どちらも未設定時: `enabled: false`

#### POST /api/ai/analyze

ターミナル出力をAIで解析。

**リクエストボディ:**
```json
{
  "context": "ターミナル出力のテキスト",
  "question": "このエラーの原因は？"
}
```

- `context` (必須): ターミナル出力。`AI_MAX_CONTEXT_LINES` で行数制限される
- `question` (任意): ユーザーの質問

**レスポンス:**
```json
{
  "answer": "AIの解析結果",
  "provider": "claude",
  "model": "claude-sonnet-4-5-20250929"
}
```

**エラー (503):**
AI機能が無効の場合:
```json
{ "error": "AI_NOT_AVAILABLE", "message": "AI機能が有効になっていません..." }
```

### セッションログ

`ENABLE_SESSION_LOGS=true` が必要。

#### GET /api/logs

セッションログ一覧を取得。

**レスポンス:**
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

セッションログ内容を取得。ファイル名は `session-` で始まり `.log` で終わる必要がある。

**レスポンス:**
```json
{
  "fileName": "session-2025-01-01T00-00-00-shell-abc123.log",
  "content": "=== セッション開始 ===\n..."
}
```

---

## WebSocket 通信プロトコル

### 接続

```
ws://host:port/ws?token=<AUTH_TOKEN>
```

または認証なしで接続後、メッセージベース認証を行う。

### クライアント → サーバー

#### start（セッション開始）

```json
{
  "type": "start",
  "mode": "shell",
  "cwd": "src",
  "command": "custom command",
  "sshConfig": {
    "host": "example.com",
    "port": 22,
    "username": "user",
    "authMethod": "key"
  }
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `type` | `"start"` | 必須 | メッセージ種別 |
| `mode` | `SessionMode` | 必須 | `"codex"` / `"claude"` / `"shell"` / `"custom"` / `"ssh"` |
| `cwd` | `string` | 任意 | 作業ディレクトリ（相対パス）。省略時はワークスペースルート |
| `command` | `string` | 任意 | カスタムコマンド（`mode: "custom"` 時のみ） |
| `sshConfig` | `SSHConnectionConfig` | 任意 | SSH接続設定（`mode: "ssh"` 時のみ） |

#### input（ターミナル入力）

```json
{ "type": "input", "data": "ls -la\r" }
```

入力のたびにセッションタイムアウトがリセットされる。

#### resize（ターミナルリサイズ）

```json
{ "type": "resize", "cols": 120, "rows": 40 }
```

#### stop（セッション停止）

```json
{ "type": "stop" }
```

#### auth（メッセージベース認証）

```json
{ "type": "auth", "token": "<AUTH_TOKEN>" }
```

### サーバー → クライアント

#### started（セッション開始完了）

```json
{
  "type": "started",
  "sessionId": "abc123",
  "mode": "shell",
  "cwd": ".",
  "label": "Shell"
}
```

#### data（ターミナル出力）

```json
{ "type": "data", "data": "total 42\ndrwxr-xr-x ..." }
```

#### exit（プロセス終了）

```json
{ "type": "exit", "exitCode": 0, "signal": null }
```

#### stopped（手動停止）

```json
{ "type": "stopped", "reason": "client-stop" }
```

`reason` の値:
- `"client-stop"`: クライアントからの明示的な停止
- `"client-disconnect"`: WebSocket切断による停止
- `"session-timeout"`: セッションタイムアウトによる停止

#### error（エラー）

```json
{ "type": "error", "message": "session-already-running" }
```

#### notification（通知）

```json
{
  "type": "notification",
  "title": "エラー検出",
  "body": "コマンドがエラーで終了しました",
  "level": "error"
}
```

- `level`: `"info"` | `"success"` | `"warning"` | `"error"`

#### auth_result（認証結果）

```json
{ "type": "auth_result", "ok": true }
```

---

## セッションライフサイクル

### セッションモード

| モード | 説明 | バックエンド |
|--------|------|------------|
| `codex` | Codex CLI | PTY (node-pty) |
| `claude` | Claude Code | PTY (node-pty) |
| `shell` | シェル（zsh/bash等） | PTY (node-pty) |
| `custom` | カスタムコマンド | PTY (node-pty) |
| `ssh` | SSH中継接続 | ssh2ライブラリ |

### ライフサイクル

1. **開始**: クライアントが `start` メッセージを送信
2. **PTYまたはSSH接続の確立**: モードに応じてプロセス起動または接続
3. **セッションID生成**: `nanoid` で一意なIDを生成
4. **`started` メッセージ送信**: セッション情報をクライアントに通知
5. **データ転送**: PTY/SSH出力 → `data` メッセージ、`input` メッセージ → PTY/SSH入力
6. **タイムアウト管理**: 入力のたびにタイマーリセット。`SESSION_TIMEOUT` 経過で自動切断
7. **終了**: プロセス終了（`exit`）、クライアント停止（`stopped`）、またはWebSocket切断

### セッションタイムアウト

- デフォルト: 1時間（`SESSION_TIMEOUT=3600000`）
- タイムアウト5分前に警告メッセージを送信
- `SESSION_TIMEOUT=0` でタイムアウト無効
- `input` メッセージ受信のたびにタイマーをリセット

### セッションログ

`ENABLE_SESSION_LOGS=true` 時にセッションの入出力をファイルに記録。

- ファイル名形式: `session-<timestamp>-<mode>-<id>.log`
- 保存先: `LOG_DIR`（デフォルト: `WORKSPACE_ROOT/logs`）
- ログローテーション: `LOG_MAX_AGE_DAYS` 日超過または合計 `LOG_MAX_SIZE_MB` MB超過で古いログを削除

### エラー検出と通知

ターミナル出力を監視し、エラーパターンを検出した場合に `notification` メッセージを送信する。プロセス終了時（終了コード非ゼロ）にも通知を送信する。

---

## エラーレスポンス形式

すべてのAPIエラーは以下の形式で返される:

```json
{ "error": "エラーメッセージ" }
```

### HTTPステータスコード

| コード | 意味 | 例 |
|--------|------|-----|
| 400 | バリデーションエラー | パラメータ不正、パストラバーサル |
| 401 | 認証エラー | トークン不正・未指定 |
| 403 | 機能無効 | `ALLOW_FILE_WRITE=false` 時のファイル書き込み |
| 404 | リソース未発見 | ファイル、スニペットが存在しない |
| 413 | ファイルサイズ超過 | `MAX_FILE_SIZE` / `MAX_UPLOAD_SIZE` 超過 |
| 429 | レート制限超過 | API / 認証のレート制限 |
| 503 | サービス利用不可 | AI機能が無効 |

### レート制限

- API全体: `RATE_LIMIT_API` リクエスト/分（デフォルト: 100）
- 認証失敗: `RATE_LIMIT_AUTH` 回/分（デフォルト: 5）
