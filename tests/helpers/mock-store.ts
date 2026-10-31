/**
 * JsonStore のインメモリモック
 *
 * clipboard.test.ts, snippets.test.ts 等で共通利用される
 * ファイルシステムに依存しないテスト用の JsonStore 実装
 *
 * 使い方:
 * ```ts
 * vi.mock('../../src/utils/store.js', () => mockStoreModule());
 * ```
 */

/**
 * インメモリ JsonStore クラス
 * structuredClone で初期値をディープコピーして副作用を防止する
 */
export class MockJsonStore<T> {
  private data: T;
  constructor(_filename: string, defaultValue: T) {
    this.data = structuredClone(defaultValue);
  }
  initDir(): void {
    // テストでは何もしない
  }
  load(): T {
    return this.data;
  }
  save(data: T): boolean {
    this.data = data;
    return true;
  }
}

/**
 * vi.mock / vi.doMock 用のモジュールファクトリを返す
 */
export function mockStoreModule(): { JsonStore: typeof MockJsonStore } {
  return { JsonStore: MockJsonStore };
}
