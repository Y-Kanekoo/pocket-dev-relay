# プロジェクトレビュー報告書

**プロジェクト**: Pocket Dev Relay
**ブランチ**: `fix/improve-all` (PR #37)
**レビュー日**: 2026-02-20
**スタック**: TypeScript + Express + WebSocket(ws) + node-pty + ssh2

---

## サマリ

| 重大度 | 件数 |
|--------|------|
| Critical | 1 |
| High | 9 |
| Medium | 16 |
| Low | 10 |
| **合計** | **36** |

`fix/improve-all` ブランチで32件の改善（セキュリティ・品質・テスト）が実施された後の残存課題を報告する。
セキュリティの基盤は大幅に強化されたが、テストカバレッジの不足と一部の設計課題が残っている。

---

## 1. 今すぐやる（高影響 × 低労力）

### [SEC-001] timingSafeCompare のパディング不具合 ⚡ Critical
- `src/middleware/auth.ts:20-28`
- **問題**: `timingSafeCompare` で長さが異なる場合、`b.padEnd(a.length, '\0')` としているが、`a` の方が短い場合に `bufB` がトランケートされ、意図しない比較結果になる可能性がある。また `crypto.timingSafeEqual` の戻り値が24行目で無視されている（意図的だがコメント不足）。
- **対応**: 長いほうの長さに合わせてパディングするか、固定長ハッシュ（SHA-256等）で比較する方式に変更。
- 工数: small

### [SEC-009] 本番環境での AUTH_TOKEN 未設定チェック不足 🔶 High
- `src/config.ts:25`, `src/middleware/auth.ts:14-16`
- **問題**: AUTH_TOKEN 未設定時にログ警告は出力されるが、`NODE_ENV=production` でも起動を許可する。誤って認証なしで本番デプロイされるリスク。
- **対応**: `NODE_ENV=production` かつ `AUTH_TOKEN` 未設定時に起動を拒否する。
- 工数: small

### [SEC-006] 環境変数許可リストに NODE_OPTIONS が含まれる 🔶 High
- `src/services/session.ts:179`
- **問題**: `ENV_ALLOWLIST` に `NODE_OPTIONS` が含まれている。`NODE_OPTIONS=--require=/malicious.js` のように悪用可能。
- **対応**: `NODE_OPTIONS` を許可リストから除外する。
- 工数: small

### [TEST-009] パストラバーサル検証のテストが存在しない 🔶 High
- `src/utils/path.ts:16`
- **問題**: `resolvePath` はセキュリティ上最も重要な関数の一つだが、テストが0%。`../` を含むパストラバーサル攻撃の防御が未検証。
- **対応**: `tests/server/path.test.ts` を作成し、正常系・攻撃パターンを網羅的にテスト。
- 工数: small

---

## 2. 計画的に対応（高影響 × 高労力）

### [TEST-001] ファイルルーター全体のテストが欠落 🔶 High
- `src/routes/files.ts`
- **問題**: ファイル操作系API（GET /api/files, GET /api/file, POST /api/upload）のテストが0%。ディレクトリ一覧、ファイル読込、アップロード処理が未検証。
- **対応**: `tests/server/files.test.ts` を作成。パストラバーサル検知、ファイルサイズ超過エラー、正常系を網羅。
- 工数: medium

### [TEST-004] AI解析ルートのテストが欠落 🔶 High
- `src/routes/ai.ts`
- **問題**: POST /api/ai/analyze, GET /api/ai/status のテストが0%。AI機能の核が未検証。
- **対応**: `tests/server/ai.test.ts` を作成。APIモック化テスト、エラーハンドリング、タイムアウト検証。
- 工数: medium

### [QUAL-002] 認証ロジックの二重実装 🔶 High
- `src/middleware/auth.ts` vs `src/server/auth.ts`
- **問題**: 本番用（timingSafeEqual使用）とテスト用（単純比較）の2つの認証実装が存在。保守性低下、リスク二重化。
- **対応**: `src/middleware/auth.ts` を唯一の実装とし、テスト時は依存注入でモック化。`src/server/auth.ts` を削除。
- 工数: medium

### [SEC-003] SSH ホスト鍵検証のデフォルト設定リスク 🔶 High
- `src/services/ssh.ts:133`
- **問題**: `SSH_STRICT_HOST_KEY=false` にすると中間者攻撃に脆弱。開発用途だが本番誤用の可能性。
- **対応**: `NODE_ENV=production` でデフォルト `true` に変更。false設定時にERRORレベルログ。
- 工数: small

### [SEC-005] CSP unsafe-inline による XSS脅威 🔶 High
- `src/middleware/security.ts:27`
- **問題**: `script-src 'unsafe-inline'` と `style-src 'unsafe-inline'` が設定されており、XSS攻撃面が拡大。
- **対応**: スクリプトハッシュベースCSPへの移行を検討。最低でもスクリプトを外部ファイル化して `'self'` のみに。
- 工数: medium

### [TEST-002] API設定・アドレス取得ルートのテストが欠落 🔶 High
- `src/routes/api.ts`
- **問題**: GET /api/config, GET /api/addresses, GET /api/qr のテストが0%。
- **対応**: `tests/server/api.test.ts` を作成。
- 工数: small

---

## 3. 手が空いたら（低影響 × 低労力）

### [SEC-002] WebSocket認証がURLクエリパラメータに依存 🔹 Medium
- `src/middleware/auth.ts:59-66`
- **問題**: トークンがURL経由で送信されアクセスログに残る可能性。
- **対応**: 将来的に初回WebSocketメッセージでの認証に移行。（コメントで認識済み）
- 工数: large

### [SEC-007] シェルメタ文字検出パターンの検出漏れ 🔹 Medium
- `src/services/pty.ts:127`
- **問題**: 正規表現 `/[;|&`$(){}]|>>|<</` に検出漏れの可能性（`$(...)`等）。
- **対応**: テストケースを拡充して検出漏れを検証。ホワイトリスト方式の検討。
- 工数: medium

### [SEC-008] AI APIキーの送信方式 🔹 Medium
- `src/services/ai.ts:86`
- **問題**: APIキーがfetchヘッダーに直接記載。プロキシログに残る可能性。
- **対応**: サーバー側でリレープロキシ実装を検討。現状はHTTPS前提で許容範囲。
- 工数: large

### [QUAL-003] stripAnsi関数の重複が残存 🔹 Medium
- `src/utils/text.ts` vs `src/server/utils.ts`
- **問題**: 同じ `stripAnsi()` が2ファイルに存在。共通化は部分的。
- **対応**: `src/server/utils.ts` から重複を完全に削除し、`src/utils/text.ts` に統一。
- 工数: small

### [QUAL-005] resolvePath関数の重複可能性 🔹 Medium
- `src/utils/path.ts` vs `src/server/utils.ts`
- **問題**: パス解決ロジックが2箇所に存在する可能性。
- **対応**: 実装を統一し、テスト用の簡易版は削除。
- 工数: medium

### [TEST-005] エラーハンドラーのテスト不足 🔹 Medium
- `src/middleware/errorHandler.ts`（カバレッジ13.33%）
- **対応**: `tests/server/errorHandler.test.ts` を作成。
- 工数: small

### [TEST-006] レート制限ミドルウェアがテスト対象外 🔹 Medium
- `src/middleware/rateLimit.ts`（カバレッジ0%）
- **対応**: 統合テストまたはモック化テストを追加。
- 工数: small

### [TEST-007] Express認証ミドルウェアのテスト不完全 🔹 Medium
- `src/middleware/auth.ts`（カバレッジ17.85%）
- **対応**: timingSafeCompare、WebSocket認可ロジックのテスト追加。
- 工数: small

### [TEST-008] カスタムエラークラスが未テスト 🔹 Medium
- `src/errors/AppError.ts`（カバレッジ21.95%）
- **対応**: 各エラークラスのインスタンス化、toJSON()のテスト追加。
- 工数: small

### [TEST-010] クライアントテストのロジック再実装問題 🔹 Medium
- `tests/client/utils.test.ts`, `tests/client/services/api.test.ts`
- **問題**: テスト内でロジックを再実装しており、実装との乖離リスク。
- **対応**: 共有ユーティリティモジュールに切り出してテストから直接import。
- 工数: small

### [CI-001] カバレッジレポートがCIに未統合 🔹 Medium
- `.github/workflows/ci.yml:33`
- **問題**: CI環境でカバレッジデータが記録・追跡されていない。
- **対応**: `--coverage` フラグ追加、アーティファクトとして保存。
- 工数: small

### [CI-003] Prettierチェックの対象範囲が限定的 🔹 Medium
- `.github/workflows/ci.yml:59`
- **問題**: `src` のみチェックで、`tests/` や設定ファイルが対象外。
- **対応**: `./**/*.{ts,js,json,md}` に拡張。
- 工数: small

### [OPS-001] グレースフルシャットダウンのテストがない 🔹 Medium
- `src/server.ts:122`
- **問題**: cleanupAllSessionsの完全性が検証されていない。
- **対応**: テスト追加。リソースクローズの確認。
- 工数: medium

### [OPS-003] APP_VERSION取得のサイレントフォールバック 🔹 Medium
- `src/config.ts:142`
- **問題**: package.json読み込み失敗がサイレントに `'0.0.0'` に。
- **対応**: エラーログを出力する。
- 工数: small

### [OPS-005] カバレッジ閾値の段階的引き上げ目標がない 🔹 Medium
- `vitest.config.ts:29`
- **問題**: 閾値35%固定で、改善ロードマップがない。
- **対応**: 段階的な目標設定（例: 50% → 60% → 70%）。
- 工数: small

---

## 4. 余裕があれば（低影響 × 高労力）

### [QUAL-006] 型定義ファイルが591行で大きい 🔹 Low
- `src/types/index.ts`
- **対応**: ドメインごとに分割（messages, session, api）。

### [QUAL-007] session.ts が494行で複雑 🔹 Low
- `src/services/session.ts`
- **対応**: ログ管理を別モジュールに分割。

### [QUAL-008] fileBrowser.ts が492行で複雑 🔹 Low
- `src/client/components/fileBrowser.ts`
- **対応**: コンポーネント分割（一覧、編集、アップロード）。

### [QUAL-010] AIプロバイダーの抽象化不足 🔹 Low
- `src/services/ai.ts:239`
- **対応**: ファクトリ関数でプロバイダー生成を統一。

### [QUAL-014] エラークラスの粒度が細かすぎる 🔹 Low
- `src/errors/AppError.ts`
- **対応**: ファクトリパターンで生成を統一する検討。

### [SEC-010] multerファイル名処理 🔹 Low
- `src/routes/files.ts:157`
- **対応**: UUID/タイムスタンプベースのファイル名に変更検討。

### [SEC-011] WebSocket JSON パース失敗のサイレント無視 🔹 Low
- `src/services/websocket.ts:100`
- **対応**: パース失敗カウント + 閾値超過で接続切断。

### [SEC-012] JSONボディサイズリミット2MBの妥当性確認 🔹 Low
- `src/server.ts:80`
- **対応**: AI_MAX_CONTEXT_LINESとの整合確認。

### [OPS-004] .env.example に安全でないデフォルト 🔹 Low
- `.env.example`
- **対応**: README.mdにHTTPS推奨の警告を記載。

### [OPS-006] NODE_ENVが.env.exampleに未記載 🔹 Low
- `src/config.ts:14`
- **対応**: `.env.example` に `NODE_ENV=development` を追加。

---

## 未分析領域

- WebSocket負荷テスト（大量セッション接続時の動作）
- E2Eテスト（ブラウザ自動化テストなし）
- パフォーマンスプロファイリング
- ブラウザ互換性テスト
- SSH機能のセキュリティ統合テスト

---

## 推奨アクション（次の5ステップ）

1. **[SEC-001]** timingSafeCompare のパディング修正（即時、10分程度）
2. **[SEC-006]** NODE_OPTIONS を ENV_ALLOWLIST から除外（即時、5分）
3. **[SEC-009]** 本番環境での AUTH_TOKEN 必須化（即時、10分）
4. **[TEST-009]** パストラバーサル検証テスト追加（次スプリント、30分）
5. **[QUAL-002]** 認証ロジックの統一（次スプリント、1時間）

---

## 全体評価

| 領域 | 評価 | コメント |
|------|------|---------|
| セキュリティ | B+ | 大幅改善済み。timingSafeEqual、XSS対策、環境変数制限等。残課題あり |
| コード品質 | B | JSDoc充実、型安全。二重実装と大型ファイルの課題 |
| テスト | C+ | 142テスト通過。カバレッジ43%。重要ルートのテスト欠落 |
| CI/CD | B | lint/typecheck/test/build/audit実施。カバレッジ追跡未導入 |
| 運用 | B+ | pino構造化ログ、グレースフルシャットダウン、ヘルスチェック完備 |
| UX | B | マルチセッション、SSH対応、AI機能。レスポンシブ対応良好 |
