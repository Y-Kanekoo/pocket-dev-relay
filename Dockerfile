# ============================================================
# ビルドステージ
# ============================================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# 依存関係定義ファイルを先にコピー（キャッシュ効率化）
COPY package*.json ./

# node-pty はネイティブモジュールのため、ビルドツールが必要
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/* && \
    npm ci

# ソースコードをコピーしてビルド
COPY . .
RUN npm run build

# ============================================================
# 実行ステージ
# ============================================================
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# node-pty の実行時にもネイティブリビルドが必要なため、ビルドツールを残す
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# 本番依存のみインストール
COPY package*.json ./
RUN npm ci --omit=dev

# ビルド成果物とフロントエンドアセットをコピー
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# 環境変数のデフォルト値
ENV PORT=4173
ENV HOST=0.0.0.0
ENV WORKSPACE_ROOT=/workspace

EXPOSE 4173

CMD ["node", "dist/server.js"]
