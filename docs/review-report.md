---
schema_version: 1
generated_at: 2026-02-28T12:00:00+09:00
commit_hash: 0e62c16f2ec30839023e3aca826751f0eea12927
file_count: 142
stack: TypeScript + Express + WebSocket(ws) + node-pty + ssh2
stage: beta
total_issues: 35
critical: 0
high: 6
medium: 17
low: 12
---

# レビューレポート: pocket-dev-relay

## 概要テーブル

| 指標 | 値 |
|------|-----|
| ファイル数 | 142 |
| テスト | 373件パス / 125スイート |
| カバレッジ | 79.14% |
| ESLint | 0 エラー |
| npm audit | 0 脆弱性 |
| 段階 | ベータ |

## エグゼクティブサマリ

プロジェクトはセキュリティ・型安全性の面で高い品質を維持している。前回レビュー（2026-02-24）からCritical 6件の修正が完了し、セッション上限・unhandledRejection・リサイズバリデーション・SSH hostVerifier・循環依存・multerガードが実装された。現在の主要課題は、クライアント側テストカバレッジの不足（15ファイル中テスト2件のみ）、WebSocket/SSH認証仕様のドキュメント漏れ、および運用準備（CI/CD定期実行、グレースフルシャットダウン完成度）にある。

## 指摘サマリ

| 重大度 | [1] 今すぐやる | [2] 計画的に対応 | [3] 手が空いたら | [4] 余裕があれば |
|--------|---------------|-----------------|-----------------|-----------------|
| Critical | 0 | 0 | 0 | 0 |
| High | 1 | 5 | 0 | 0 |
| Medium | 0 | 0 | 11 | 6 |
| Low | 0 | 0 | 12 | 0 |

## 前回レポートとの比較

| 項目 | 前回 (2026-02-24) | 今回 (2026-02-28) |
|------|-------------------|-------------------|
| ファイル数 | 135 | 142 |
| Critical | 0 | 0 |
| High | 3 | 6 |
| Medium | 8 | 17 |
| Low | 11 | 12 |
| テスト数 | 373 | 373 |
| ESLint | 0 | 0 |
| npm audit | 0 | 0 |

※ High/Medium増加はドキュメント・テスト・運用面の調査を深掘りした結果であり、コード品質は向上している。

---

## [1] 今すぐやる（High × small）

### T-008: AUTH_TOKEN未設定時のSSH機能警告不足
- **重大度**: High
- **カテゴリ**: セキュリティ/設定
- **対象**: src/server.ts, src/config.ts
- **問題**: `ENABLE_SSH=true`かつ`AUTH_TOKEN`未設定時に警告がない。ENABLE_TUNNELには検査があるが、SSHには存在しない
- **対応**: server.tsの起動時チェックに`ENABLE_SSH && !AUTH_TOKEN`の警告を追加
- **工数**: small
- **根拠**: SSH機能はリモートアクセスを提供するため、認証なしでの運用はセキュリティリスク

---

## [2] 計画的に対応（High × medium/large）

### D-003: WebSocket認証仕様のドキュメント漏れ
- **重大度**: High
- **カテゴリ**: docs
- **対象**: README.md
- **問題**: `auth`/`auth_result`メッセージ型が実装（types/index.ts）に存在するが、README.mdのWebSocketメッセージ仕様セクションに記載されていない
- **対応**: README.mdにメッセージベース認証のプロトコル仕様を追記
- **工数**: medium
- **根拠**: 認証方式の仕様漏れはAPI統合時の誤実装を招く

### D-004: SSH接続設定メッセージの仕様不足
- **重大度**: High
- **カテゴリ**: docs
- **対象**: README.md
- **問題**: `start`メッセージの`sshConfig`フィールド（SSHConnectionConfig）の構造がREADME.mdに記載されていない
- **対応**: README.mdの`start`メッセージ仕様にsshConfigフィールドの詳細を追記
- **工数**: medium
- **根拠**: SSH機能はセキュリティに関わる重要機能であり、仕様不完全はクライアント実装の障害

### T-001: クライアント側テストカバレッジの極度の不足
- **重大度**: High
- **カテゴリ**: テスト
- **対象**: src/client/ (15ファイル中テスト2件のみ)
- **問題**: terminal.ts, fileBrowser.ts, aiPanel.ts, sshDialog.ts, clipboard.ts, settings.ts, notification.ts, errorHandler.ts, sessionStore.tsが全く未テスト
- **対応**: tests/client/components/ディレクトリ作成、各コンポーネント・状態管理のテスト実装
- **工数**: large
- **根拠**: クライアント側はユーザーに直接触れる部分であり、バグ検出・リグレッション防止が不可欠

### T-003: トンネル機能テストカバレッジ22%
- **重大度**: High
- **カテゴリ**: テスト
- **対象**: src/services/tunnel.ts
- **問題**: カバレッジ22%。cloudflaredバイナリ未検出、URL抽出失敗、タイムアウトcleanup等が未テスト
- **対応**: テストケース追加（バイナリ未検出、マッチング失敗、プロセスexit/error、タイムアウト）
- **工数**: medium
- **根拠**: 外部アクセス機能は認証と組み合わせて使用されるため、本番での信頼性が必須

### T-017: sessionStoreの複雑な状態管理が全く未テスト
- **重大度**: High
- **カテゴリ**: テスト
- **対象**: src/client/state/sessionStore.ts (15 exports)
- **問題**: 複数セッション管理、WebSocket再接続ロジック、MAX_SESSIONS制約のenforcement等が未検証
- **対応**: sessionStoreのユニットテスト実装（session CRUD、reconnect状態遷移、MAX_SESSIONS超過）
- **工数**: medium
- **根拠**: 状態管理のバグはユーザー体験を直接悪化させる

---

## [3] 手が空いたら（Medium/Low × small/medium）

### D-001: AI_MAX_CONTEXT_LINESのデフォルト値乖離
- **重大度**: Low
- **カテゴリ**: docs
- **対象**: README.md
- **問題**: README.mdでデフォルト100と記載、config.tsでは200
- **対応**: README.mdの値を200に修正
- **工数**: small

### D-002: MAX_SESSIONSがドキュメント未記載
- **重大度**: Medium
- **カテゴリ**: docs
- **対象**: README.md, .env.example
- **問題**: config.tsにMAX_SESSIONS（デフォルト10）が存在するが、README.md/.env.exampleに記載なし
- **対応**: README.mdの設定表とenv.exampleに追加
- **工数**: small

### D-005: トンネル前提条件の説明不足
- **重大度**: Low
- **カテゴリ**: docs
- **対象**: README.md
- **問題**: ENABLE_TUNNEL=true時のAUTH_TOKEN必須という前提条件がREADME.mdで目立たない
- **対応**: トンネル設定セクションに注意書きを追加
- **工数**: small

### D-006: CONTRIBUTING.md欠落
- **重大度**: Medium
- **カテゴリ**: docs
- **対象**: プロジェクトルート
- **問題**: コントリビューションガイドが存在しない。OSS化済みのため外部貢献者向けガイドが必要
- **対応**: セットアップ手順、テスト実行方法、コミットメッセージ規約等を含むCONTRIBUTING.md作成
- **工数**: medium

### D-007: CHANGELOG.md欠落
- **重大度**: Low
- **カテゴリ**: docs
- **対象**: プロジェクトルート
- **問題**: version 0.1.0だが変更履歴ドキュメントがない
- **対応**: CHANGELOG.md作成
- **工数**: small

### D-008: デフォルトコマンド設定のドキュメント齟齬
- **重大度**: Medium
- **カテゴリ**: docs
- **対象**: README.md, .env.example
- **問題**: SHELL_CMD等のコマンド設定の説明が不十分
- **対応**: .env.exampleにSHELL_CMD等のデフォルト値をコメント付きで追加
- **工数**: small

### D-009: クリップボード/スニペット消失の警告不足
- **重大度**: Low
- **カテゴリ**: docs
- **対象**: README.md
- **問題**: サーバー再起動時にクリップボード/スニペットが消失することがREADME.mdに未記載
- **対応**: README.mdの機能説明に注意書きを追加
- **工数**: small

### D-010: AI解析機能の制限事項が不明瞭
- **重大度**: Medium
- **カテゴリ**: docs
- **対象**: README.md
- **問題**: AI APIの30秒タイムアウト、エラー詳細非公開等の制限事項がREADME.mdに未記載
- **対応**: AI設定セクションに制限事項を追記
- **工数**: small

### C-004: 空のcatchブロック（エラー無視）
- **重大度**: Medium
- **カテゴリ**: error-handling
- **対象**: src/services/session.ts:485-487, src/services/ssh.ts:213-215, src/routes/files.ts:204-208 等
- **問題**: `catch { /* 無視 */ }` パターンが複数箇所に存在。デバッグ時の問題隠蔽リスク
- **対応**: `catch (err) { logger.debug('操作名失敗:', err); }` に変更
- **工数**: small

### T-005: MaxListenersExceededWarning
- **重大度**: Medium
- **カテゴリ**: テスト
- **対象**: テスト実行環境
- **問題**: shutdown.test.tsでprocess event listenerが蓄積し、MaxListenersExceededWarning発生
- **対応**: beforeEach/afterEachでlistener cleanup追加
- **工数**: small

### T-007: config.tsバリデーション不完全
- **重大度**: Medium
- **カテゴリ**: 設定
- **対象**: src/config.ts
- **問題**: HTTPS有効時のSSLパス検証がserver.tsに分散。AI_PROVIDER自動判定時のAPIキー形式チェックなし
- **対応**: config.ts側でのバリデーション統合、テストカバレッジ向上
- **工数**: small

### T-009: エラーハンドリング一貫性不足
- **重大度**: Medium
- **カテゴリ**: 運用
- **対象**: src/routes/ 全体
- **問題**: try-catch-nextのパターンに微妙なばらつき。asyncHandler利用の統一度
- **対応**: 全ルートでasyncHandlerパターンの統一確認
- **工数**: small

### T-012: テスト決定性・ランダム性問題
- **重大度**: Medium
- **カテゴリ**: テスト
- **対象**: tests/ 全体
- **問題**: setTimeout/setInterval依存テストの再現性、モックリセットの統一度
- **対応**: vi.useFakeTimers統一、vi.clearAllMocks確実実行
- **工数**: small

### T-014: 依存関係更新ポリシー不足
- **重大度**: Medium
- **カテゴリ**: 依存
- **対象**: package.json
- **問題**: Dependabot/Renovate設定なし。依存パッケージの定期アップデート戦略が不明確
- **対応**: .github/dependabot.yml作成
- **工数**: small

### T-018: .env.exampleの完全性
- **重大度**: Low
- **カテゴリ**: 設定
- **対象**: .env.example, src/config.ts
- **問題**: MAX_UPLOAD_SIZEが.env.exampleに未記載
- **対応**: .env.exampleにMAX_UPLOAD_SIZE追加
- **工数**: small

### T-019: シークレット管理運用フロー不足
- **重大度**: Medium
- **カテゴリ**: 運用
- **対象**: AUTH_TOKEN, API keys, SSH秘密鍵
- **問題**: Docker環境での秘密情報注入方法やAPIキーローテーション手順が未ドキュメント化
- **対応**: README.mdまたはDEPLOYMENT.mdにシークレット管理ガイドを追記
- **工数**: small

### T-011: ヘルスチェック最小限
- **重大度**: Low
- **カテゴリ**: 運用
- **対象**: src/routes/health.ts
- **問題**: 単純なJSONレスポンスのみ。メモリ使用量、アクティブセッション数等のディープチェックなし
- **対応**: ヘルスチェックにメモリ/セッション情報を追加
- **工数**: small

### T-015: ビルド設定のレガシー参照
- **重大度**: Low
- **カテゴリ**: 依存
- **対象**: package.json
- **問題**: external:cpu-featuresが指定されているが使用箇所が不明
- **対応**: 不要なexternal指定の確認・削除
- **工数**: small

### T-016: テスト用型定義不足
- **重大度**: Low
- **カテゴリ**: テスト
- **対象**: src/types/index.ts
- **問題**: テスト用のfactory function（createMockSession等）がなく、テストコードで型安全性が活用されていない
- **対応**: テストユーティリティの型安全factory function実装
- **工数**: small

### T-020: loggerのNODE_ENV依存
- **重大度**: Low
- **カテゴリ**: 運用
- **対象**: src/services/logger.ts
- **問題**: LOG_LEVELのデフォルトがNODE_ENVと独立しており、本番でdebugログが出力される可能性
- **対応**: NODE_ENVに応じたデフォルトLOG_LEVEL設定
- **工数**: small

---

## [4] 余裕があれば（Medium/Low × large）

### C-001: WebSocket認証フロー二重実装
- **重大度**: Medium
- **カテゴリ**: code-quality
- **対象**: src/services/websocket.ts:199-241
- **問題**: URLクエリパラメータと初回メッセージの二重認証。保守性低下リスク
- **対応**: 将来的にメッセージベース認証に統一
- **工数**: medium

### T-002: サーバーサービステストカバレッジ不足
- **重大度**: Medium
- **カテゴリ**: テスト
- **対象**: src/services/session.ts, websocket.ts, ssh.ts, ai.ts
- **問題**: 外部依存が強く除外されているが、サーバー機能の核。統合テスト不足
- **対応**: mock活用した統合テスト追加
- **工数**: medium

### T-004: ファイル操作テストカバレッジ不足
- **重大度**: Medium
- **カテゴリ**: テスト
- **対象**: src/routes/files.ts (71.6%), clipboard.ts (80%), snippets.ts (71.69%)
- **問題**: エラーケース、境界値テストが不足
- **対応**: MAX_FILE_SIZE境界、パスバリデーション強化テスト追加
- **工数**: medium

### T-006: テストピラミッド逆転
- **重大度**: Medium
- **カテゴリ**: テスト
- **対象**: tests/ 全体
- **問題**: 統合テスト過多、ユニットテスト不足。failure isolation が弱い
- **対応**: サービス層関数の小さなユニットテスト追加
- **工数**: medium

### T-010: グレースフルシャットダウン不完全
- **重大度**: Medium
- **カテゴリ**: 運用
- **対象**: src/server.ts
- **問題**: 進行中WebSocketセッションの突然切断、新セッション受入停止機構なし
- **対応**: graceful close待機・新規接続停止の実装
- **工数**: medium

### T-013: CI/CD定期実行・セキュリティスキャン不足
- **重大度**: Medium
- **カテゴリ**: CI-CD
- **対象**: .github/workflows/ci.yml
- **問題**: scheduleジョブなし、coverage gate未実装、追加セキュリティスキャンなし
- **対応**: schedule cron、coverageしきい値チェック、Dependabot連携追加
- **工数**: medium

---

## ドキュメント状況

| ドキュメント | 状態 | 評価 |
|-------------|------|------|
| README.md | あり | 充実しているが一部設定・仕様の漏れあり |
| SPEC.md | あり | AI向け技術仕様として詳細 |
| .env.example | あり | MAX_SESSIONS, MAX_UPLOAD_SIZE未記載 |
| LICENSE | あり | OK |
| CONTRIBUTING.md | なし | OSS化済みのため作成推奨 |
| CHANGELOG.md | なし | バージョン管理のため作成推奨 |
| API仕様 | README.md内 | WebSocket認証仕様・SSH設定詳細が不足 |

## テスト状況

| 領域 | テスト数 | カバレッジ | 評価 |
|------|---------|-----------|------|
| サーバーユーティリティ | 充実 | 80%+ | 良好 |
| ルート/API | 充実 | 71-100% | 良好 |
| ミドルウェア | 充実 | 90%+ | 良好 |
| サービス層 | 部分的 | 22-80% | 要改善 |
| クライアント | 2/15ファイル | 低 | 要改善 |

## 運用準備状況

| 項目 | 状態 | 評価 |
|------|------|------|
| 構造化ログ（pino） | 導入済み | 良好 |
| ヘルスチェック | 基本実装 | 最小限 |
| グレースフルシャットダウン | 基本実装 | 改善余地あり |
| セキュリティヘッダー | CSP/HSTS他 | 良好 |
| 認証 | timingSafeEqual | 良好 |
| CI/CD | テスト/lint/audit | 定期実行なし |

## セキュリティ総合評価

| 観点 | 評価 |
|------|------|
| 認証 | 良好（timingSafeEqual、AUTH_TOKEN警告） |
| XSS | 良好（innerHTML排除、escapeHtml、CSP） |
| インジェクション | 良好（パストラバーサル多層防御、メタ文字検出） |
| 型安全性 | 優秀（any使用0件） |
| 情報漏洩 | 良好（エラー詳細非公開、機密ログ回避） |

## 推奨アクション（次の3ステップ）

1. **T-008修正**: AUTH_TOKEN未設定時のSSH機能警告を追加する（small、即実行可）
2. **D-003/D-004修正**: README.mdにWebSocket認証仕様とSSH接続設定仕様を追記する（medium）
3. **テスト拡充計画策定**: T-001/T-003/T-017を優先し、クライアント側テストとトンネルテストの実装計画を立てる

## 並列修正可能グループ

- **グループA**: D-001, D-002, D-005, D-007, D-008, D-009, D-010, T-018（ドキュメント修正）
- **グループB**: T-008（server.ts修正）
- **グループC**: C-004（catch文ログ追加）
- **グループD**: T-005（テスト修正）
- **グループE**: T-014（.github/dependabot.yml新規作成）

※ グループA〜Eは互いに独立しており、並列修正可能

## 次回注目ポイント

- クライアント側テストカバレッジの進捗
- tunnel.tsカバレッジの22%→80%達成状況
- CONTRIBUTING.md、CHANGELOG.mdの作成状況
- Dependabot設定の導入状況
