# pocket-dev-relay

> Tailscale + mosh + tmux を統合管理するリモート開発CLIツール

スマートフォンからPCへ安全かつ快適にリモート接続するための環境を、ワンコマンドで構築・管理します。

```
スマートフォン (Termux / Blink Shell)
    ↓ mosh (UDP, roaming対応)
Tailscale VPN (WireGuard)
    ↓
PC (tmux セッション)
```

## 特徴

- **Tailscale** - WireGuardベースのVPNで安全な接続を実現。NATやファイアウォールの設定不要
- **mosh** - UDP接続で回線切り替え(Wi-Fi ↔ モバイル)に強く、ローミング対応
- **tmux** - セッション永続化により、接続が切れても作業状態が保持される
- **ワンコマンド管理** - 全サービスの起動・停止・接続情報表示・QRコード生成をCLIから実行

## 必要条件

| ツール | バージョン | 用途 |
|--------|-----------|------|
| Node.js | >= 20 | CLI実行環境 |
| Tailscale | 最新推奨 | VPN接続 |
| mosh / mosh-server | 最新推奨 | UDP接続 |
| tmux | 最新推奨 | セッション管理 |

## インストール

### 依存ツールのインストール

付属のスクリプトで依存ツール (Tailscale, mosh, tmux) を一括インストールできます。

```bash
# 依存ツールのインストール
./scripts/install-deps.sh
```

Linux (Debian/Ubuntu) と macOS (Homebrew) に対応しています。

### CLIのセットアップ

```bash
# パッケージのインストール
npm install

# TypeScriptのビルド
npm run build

# グローバルコマンドとして登録（"pdr" コマンドが使えるようになる）
npm link
```

`npm link` を実行すると、`pocket-dev-relay` および短縮エイリアスの `pdr` がシステム全体で利用可能になります。

## 使い方

### 基本的なワークフロー

```bash
# 1. 初期セットアップ（設定ファイルの生成・ツールの確認）
pdr setup

# 2. 全サービスを起動（Tailscale, mosh-server, tmux）
pdr start

# 3. 接続情報の表示（QRコード付き）
pdr connect

# 4. ステータス確認
pdr status

# 5. 全サービスを停止
pdr stop
```

### 個別操作

```bash
# Tailscale 操作
pdr tailscale up       # Tailscale を起動
pdr tailscale down     # Tailscale を停止
pdr tailscale ip       # Tailscale の IP アドレスを表示
pdr tailscale status   # Tailscale のステータスを表示

# mosh 操作
pdr mosh start         # mosh-server を起動
pdr mosh stop          # mosh-server を停止
pdr mosh command       # クライアント用の接続コマンドを表示
pdr mosh command <ip>  # 指定IPでの接続コマンドを表示
pdr mosh status        # mosh のステータスを表示

# tmux 操作
pdr tmux new [name]    # 新しいセッションを作成
pdr tmux layout dev    # "dev" レイアウトでセッションを作成
pdr tmux layout split  # "split" レイアウトでセッションを作成
pdr tmux list          # セッション一覧を表示
pdr tmux attach [name] # セッションへのアタッチコマンドを表示
pdr tmux kill <name>   # セッションを終了
pdr tmux status        # tmux のステータスを表示
```

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `pdr setup` | セットアップウィザードを実行（設定ファイル生成・ツール確認） |
| `pdr start` | 全サービスを一括起動（Tailscale, mosh-server, tmux） |
| `pdr stop` | 全サービスを一括停止 |
| `pdr status` | 全コンポーネントのステータスを一括表示（デフォルトコマンド） |
| `pdr connect` | 接続情報とQRコードを表示 |
| `pdr tailscale up` | Tailscale を起動 |
| `pdr tailscale down` | Tailscale を停止 |
| `pdr tailscale ip` | Tailscale IP アドレスを表示 |
| `pdr tailscale status` | Tailscale のステータスを表示 |
| `pdr mosh start` | mosh-server を起動 |
| `pdr mosh stop` | mosh-server を停止 |
| `pdr mosh command [ip]` | クライアント用の接続コマンドを表示 |
| `pdr mosh status` | mosh のステータスを表示 |
| `pdr tmux new [name]` | 新しい tmux セッションを作成 |
| `pdr tmux layout <name>` | 定義済みレイアウトでセッションを作成 |
| `pdr tmux list` | tmux セッション一覧を表示 |
| `pdr tmux attach [name]` | セッションへのアタッチコマンドを表示 |
| `pdr tmux kill <name>` | 指定したセッションを終了 |
| `pdr tmux status` | tmux のステータスを表示 |
| `pdr config` | 設定ファイルのパスと現在の設定を表示 |
| `pdr help` | ヘルプを表示 |
| `pdr version` | バージョンを表示 |

## 設定

初回セットアップ時（`pdr setup`）に `~/.config/pocket-dev-relay/config.json` に設定ファイルが作成されます。

```json
{
  "tmux": {
    "defaultSession": "dev",
    "layouts": [
      {
        "name": "dev",
        "description": "Editor + Terminal + Log",
        "windows": [
          { "name": "editor", "command": "$EDITOR ." },
          { "name": "terminal" },
          { "name": "log", "command": "tail -f /var/log/syslog 2>/dev/null || echo \"ready\"" }
        ]
      },
      {
        "name": "split",
        "description": "Split pane layout",
        "windows": [
          {
            "name": "main",
            "panes": [
              {},
              { "split": "horizontal" },
              { "split": "vertical" }
            ]
          }
        ]
      }
    ]
  },
  "mosh": {
    "ports": "60000:60010",
    "server": "mosh-server"
  },
  "tailscale": {
    "exitNode": false,
    "acceptRoutes": true
  }
}
```

### 設定項目の説明

| セクション | キー | 説明 | デフォルト値 |
|-----------|------|------|-------------|
| `tmux` | `defaultSession` | デフォルトで作成・接続するセッション名 | `"dev"` |
| `tmux` | `layouts` | 定義済みのウィンドウレイアウト一覧 | `dev`, `split` の2つ |
| `mosh` | `ports` | mosh-server が使用するUDPポート範囲 | `"60000:60010"` |
| `mosh` | `server` | mosh-server の実行ファイルパス | `"mosh-server"` |
| `tailscale` | `exitNode` | Exit Nodeとして機能するか | `false` |
| `tailscale` | `acceptRoutes` | 他ノードが公開するルートを受け入れるか | `true` |

### レイアウトのカスタマイズ

`layouts` 配列に独自のレイアウトを追加できます。各レイアウトは複数のウィンドウを持ち、各ウィンドウはペイン分割を定義できます。

```json
{
  "name": "web",
  "description": "Web development layout",
  "windows": [
    { "name": "editor", "command": "vim ." },
    { "name": "server", "command": "npm run dev" },
    {
      "name": "tools",
      "panes": [
        { "command": "git status" },
        { "split": "horizontal", "command": "npm test -- --watch" }
      ]
    }
  ]
}
```

## アーキテクチャ

pocket-dev-relay は3つのレイヤーを統合管理します。

```
┌─────────────────────────────────────────────┐
│           Session Layer (tmux)              │
│  セッション永続化・ウィンドウ/ペイン管理      │
│  切断してもプロセスが生き続ける               │
├─────────────────────────────────────────────┤
│         Transport Layer (mosh)              │
│  UDP接続・ローミング対応・遅延予測表示         │
│  Wi-Fi ↔ モバイル回線の切り替えに耐える       │
├─────────────────────────────────────────────┤
│         Network Layer (Tailscale)           │
│  WireGuard VPN・NAT越え・ゼロコンフィグ       │
│  どこからでもプライベートIPで接続可能          │
└─────────────────────────────────────────────┘
```

### 各レイヤーの役割

| レイヤー | ツール | プロトコル | 役割 |
|---------|--------|-----------|------|
| Network | Tailscale | WireGuard (UDP) | 安全なVPNトンネルの確立。NAT越え、ファイアウォール透過 |
| Transport | mosh | SSP over UDP | 接続の維持。回線切り替え時の自動再接続、ローカルエコー |
| Session | tmux | - | セッションの永続化。切断してもプロセスが維持される |

### なぜこの組み合わせか

| 問題 | 解決策 |
|------|--------|
| 外出先からPCに接続できない | Tailscale がNAT越えを自動処理 |
| Wi-Fiからモバイル回線に切り替えると接続が切れる | mosh がUDPベースで接続を維持 |
| 接続が切れると作業中のプロセスが消える | tmux がセッションを永続化 |
| 3つのツールを個別に管理するのが面倒 | pdr がワンコマンドで統合管理 |

## スマートフォンからの接続方法

### 事前準備（PCとスマートフォン両方で必要）

1. **Tailscale アカウントの作成**
   - [tailscale.com](https://tailscale.com) でアカウントを作成

2. **PCでの準備**
   ```bash
   # 依存ツールをインストール
   ./scripts/install-deps.sh

   # CLIをセットアップ
   npm install && npm run build && npm link

   # 初期セットアップ
   pdr setup

   # 全サービスを起動
   pdr start
   ```

### スマートフォン側の設定

3. **Tailscale アプリをインストール**
   - iOS: App Store から「Tailscale」をインストール
   - Android: Google Play Store から「Tailscale」をインストール
   - PCと同じアカウントでログインし、同じ Tailnet に参加

4. **ターミナルアプリをインストール**
   - **Android**: [Termux](https://termux.dev) (推奨)
     ```bash
     pkg install mosh
     ```
   - **iOS**: [Blink Shell](https://blink.sh) (推奨、mosh内蔵)

### 接続

5. **接続情報を取得**
   ```bash
   # PCで実行
   pdr connect
   ```
   接続コマンドとQRコードが表示されます。

6. **スマートフォンから接続**

   QRコードをスキャンするか、表示されたコマンドをターミナルアプリで実行します。

   ```bash
   # 表示される接続コマンドの例
   mosh user@100.x.x.x -- tmux attach-session -t dev
   ```

   これで、スマートフォンからPCのtmuxセッションに接続され、作業を開始できます。

### 接続のヒント

- **回線切り替え**: Wi-Fiとモバイル回線を切り替えても、moshが自動的に接続を復元します
- **アプリ切り替え**: スマートフォンで他のアプリに切り替えても、戻れば作業を再開できます
- **セッション永続化**: tmuxのおかげで、ターミナルアプリを完全に終了しても、再接続すれば作業の続きから再開できます

## 開発

```bash
# テストの実行
npm test

# 型チェック
npm run typecheck

# リンター
npm run lint

# フォーマッター
npm run format

# テストカバレッジ
npm run test:coverage
```

## ライセンス

MIT License - 詳細は [LICENSE](./LICENSE) ファイルを参照してください。
