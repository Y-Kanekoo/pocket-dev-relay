/**
 * vitest グローバルセットアップ
 *
 * - MaxListenersExceededWarning の抑制:
 *   vi.resetModules() + 動的import() を繰り返すテストで pino が
 *   process.on('exit') リスナーを蓄積するため、上限を引き上げる
 */
process.setMaxListeners(20);
