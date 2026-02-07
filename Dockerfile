# ============================================================
# ビルドステージ
# ============================================================
FROM node:22-alpine AS builder

WORKDIR /app

# 依存関係定義ファイルを先にコピー（キャッシュ効率化）
COPY package*.json ./

# node-ptyはネイティブモジュールのため、ビルドツールが必要
RUN apk add --no-cache python3 make g++ && \
    npm ci

# ソースコードをコピーしてビルド
COPY . .
RUN npm run build

# 本番用依存のみで再インストール（ビルドツール付き環境で）
RUN rm -rf node_modules && npm ci --omit=dev

# ============================================================
# 実行ステージ
# ============================================================
FROM node:22-alpine AS runner

WORKDIR /app

# ビルドツール不要：builderからビルド済みnode_modules（ネイティブバイナリ含む）をコピー
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# 環境変数のデフォルト値
ENV PORT=4173
ENV HOST=0.0.0.0
ENV WORKSPACE_ROOT=/workspace

EXPOSE 4173

CMD ["node", "dist/server.js"]
