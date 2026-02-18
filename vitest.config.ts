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
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/client/**/*.ts',
        'src/types/**/*.ts',
        // 外部依存が強くユニットテスト困難なモジュール
        'src/server.ts',
        'src/cli.ts',
        'src/services/session.ts',
        'src/services/websocket.ts',
        'src/services/ssh.ts',
        'src/services/pty.ts',
        'src/services/ai.ts',
        'src/utils/network.ts',
      ],
      thresholds: {
        // 実際のカバレッジ（約36%）に合わせた現実的な閾値
        statements: 35,
        branches: 35,
        functions: 35,
        lines: 35,
      },
    },
  },
});
