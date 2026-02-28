# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/ja/1.0.0/).

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

- timingSafeEqual 認証
- XSS 防止（innerHTML 排除、CSP）
- パストラバーサル多層防御
- PTY コマンドインジェクション防止
