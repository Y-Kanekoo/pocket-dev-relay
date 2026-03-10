# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/ja/1.0.0/).

## [Unreleased]

### Added

- WebSocket 接続状態の FSM（有限状態機械）化 ([#74](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/74))
- モバイル UI 改善・セーフエリア対応 ([#58](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/58))
- WCAG コントラスト検証・focus-visible スタイル追加 ([#73](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/73))
- WebSocket メッセージバッファリング ([#57](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/57))
- 再接続時の入力バッファリングと接続品質表示 ([#75](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/75))
- 自動バージョニング ([#62](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/62))
- PWA 実装改善 ([#67](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/67))
- キーボードアクセシビリティ改善 ([#65](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/65))
- CHANGELOG.md に GitHub Issue 番号を追記 ([#97](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/97))
- README.md に WebSocket auth/auth_result 仕様を追記 ([#98](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/98))
- README.md に sshConfig フィールド詳細を追記 ([#99](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/99))

### Fixed

- npm 依存関係の脆弱性修正（express-rate-limit, multer） ([#89](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/89))
- xterm.js scrollback 制限を設定 ([#47](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/47))
- SSH チャンネルの error イベントリスナー追加 ([#50](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/50))
- PTY リサイズ時のエラーハンドリング追加 ([#51](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/51))

### Security

- WebSocket URL クエリパラメータ認証を廃止 ([#48](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/48))
- セッション絶対タイムアウト実装 ([#54](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/54))
- docker-compose.yml AUTH_TOKEN デフォルト値を削除 ([#90](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/90))
- トンネル使用時の SSH パスワード HTTPS 強制 ([#61](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/61))
- multer アップロード一時ファイルのパス改善 ([#64](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/64))

### Changed

- ルーティング層のエラーハンドリングを統一 ([#55](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/55))
- PTY/SSH セッションのログ初期化・イベントハンドラを共通化 ([#66](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/66))
- config.ts バリデーション強化と logger NODE_ENV 対応 ([#86](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/86))
- グレースフルシャットダウンとヘルスチェック改善 ([#87](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/87))

## [0.1.0] - 2026-02-28

### Added

- ターミナルリモートアクセス（Codex CLI / Claude Code / シェル）
- cloudflared トンネルによる外部アクセス
- SSH 中継接続
- ファイルブラウザ（閲覧・編集・アップロード）
- クリップボード共有
- コマンドスニペット
- AI 解析（Claude / OpenAI）
- PWA 対応
- セッションログ保存
- HTTPS 対応
- 認証機能（トークンベース + メッセージベース）
- レート制限
- セキュリティヘッダー（CSP, HSTS 等）

### Security

- timingSafeEqual 認証 ([#27](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/27))
- XSS 防止（innerHTML 排除、CSP） ([#28](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/28))
- パストラバーサル多層防御 ([#29](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/29))
- PTY コマンドインジェクション防止 ([#33](https://github.com/Y-Kanekoo/pocket-dev-relay/issues/33))
