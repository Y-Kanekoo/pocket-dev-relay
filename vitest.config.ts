import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // グローバルにdescribe, it, expectを使用可能に
    globals: true,
    // Node.js環境でテストを実行
    environment: 'node',
    // テストファイルのパターン
    include: ['tests/**/*.test.ts'],
    // カバレッジ設定
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/types/**/*.ts'],
    },
  },
});
