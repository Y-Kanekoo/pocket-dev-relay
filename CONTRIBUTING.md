# コントリビューションガイド

pocket-dev-relay への貢献に感謝します。このドキュメントでは、開発環境のセットアップからPRの提出までの手順を説明します。

## 目次

- [開発環境のセットアップ](#開発環境のセットアップ)
- [ビルド](#ビルド)
- [テスト](#テスト)
- [コーディング規約](#コーディング規約)
- [コミットメッセージ規約](#コミットメッセージ規約)
- [プルリクエスト手順](#プルリクエスト手順)
- [禁止事項](#禁止事項)

## 開発環境のセットアップ

### 必要な環境

- **Node.js 20 以上**
- **npm**（Node.js に同梱）
- **Python 3**、**make**、**C++ コンパイラ**（node-pty のネイティブビルドに必要）

### macOS の場合

Xcode Command Line Tools が必要です。未インストールの場合は以下を実行してください。

```bash
xcode-select --install
```

### セットアップ手順

1. リポジトリをフォーク・クローンします。

```bash
git clone https://github.com/<your-username>/pocket-dev-relay.git
cd pocket-dev-relay
```

2. 依存パッケージをインストールします。

```bash
npm install
```

3. 環境設定ファイルを作成します。

```bash
cp .env.example .env
```

`.env` を開き、`AUTH_TOKEN` や `WORKSPACE_ROOT` など必要な値を設定してください。

4. ビルドして動作確認します。

```bash
npm run build
npm run dev
```

## ビルド

```bash
# サーバー・クライアント・CLI をすべてビルド
npm run build

# 個別ビルド
npm run build:server
npm run build:client
npm run build:cli

# ファイル変更を監視して自動ビルド（開発時）
npm run watch
```

## テスト

```bash
# テストを1回実行
npm run test:run

# ウォッチモードでテスト実行（開発時）
npm test

# テストUIで実行
npm run test:ui
```

### リント・フォーマット・型チェック

```bash
# ESLint
npm run lint

# Prettier でフォーマット
npm run format

# TypeScript 型チェック
npm run typecheck
```

PR を提出する前に、`npm run lint`、`npm run typecheck`、`npm run test:run` がすべてパスすることを確認してください。

## コーディング規約

- **TypeScript** で記述してください。
- **`any` 型の使用は禁止** です。適切な型を定義してください。
- **ESLint** と **Prettier** の設定に従ってください。
- コード内のコメントは **日本語** で記述してください。
- 変数名・関数名は **英語** で記述してください。
- エラーメッセージ・ログ出力は **日本語** で統一してください。

## コミットメッセージ規約

以下のフォーマットに従ってください。

```
[type] 要約（命令形、72文字以内、句点なし）

任意の本文: 変更理由 / 影響や注意点
```

### Type 一覧

| Type | 用途 |
|------|------|
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `refactor` | リファクタリング（機能変更なし） |
| `docs` | ドキュメント |
| `test` | テスト追加・修正 |
| `chore` | ビルド・依存関係など保守作業 |
| `ops` | 運用・CI/CD |

### 例

```
[feat] 収集のマルチプロセス管理を追加する
[fix] WebSocket切断時のメモリリークを修正する
[docs] CONTRIBUTING.mdを追加する
```

### ルール

- 1コミット = 1目的（機能追加、バグ修正など）
- 破壊的変更がある場合は本文に `BREAKING:` を記載
- ドキュメント変更とコード変更は別コミットにする

## プルリクエスト手順

1. `main` ブランチから作業ブランチを作成します。

```bash
git checkout -b feature/my-feature main
```

ブランチ名の規約:
- `feature/` — 新機能
- `fix/` — バグ修正
- `hotfix/` — 緊急修正

2. 変更を実装し、テストがパスすることを確認します。

```bash
npm run lint
npm run typecheck
npm run test:run
```

3. コミットメッセージ規約に従ってコミットします。

4. フォーク先にプッシュし、`main` ブランチに向けてプルリクエストを作成します。

5. PR の説明には以下を含めてください。
   - 変更の概要
   - 関連する Issue 番号（あれば `Closes #XX`）
   - テスト方法

## 禁止事項

- **`.env` ファイルのコミット禁止** — `.gitignore` に含まれていますが、誤ってコミットしないよう注意してください。
- **機密情報（APIキー、パスワード等）のハードコード禁止** — 環境変数を使用してください。
- **`any` 型の使用禁止** — TypeScript の型安全性を維持してください。
