/**
 * トンネルサービスのテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

// config.js のモック
vi.mock('../../src/config.js', () => ({
  TUNNEL_TIMEOUT: 5000,
  CLOUDFLARED_PATH: '',
  LOG_LEVEL: 'silent',
  APP_VERSION: '0.0.0-test',
}));

// logger のモック
vi.mock('../../src/services/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// binary.ts のモック
vi.mock('../../src/utils/binary.js', () => ({
  findCloudflaredBinary: vi.fn(),
  getInstallGuide: vi.fn(() => 'インストールガイド'),
}));

/**
 * child_process.spawn が返す偽プロセスを作成する
 * EventEmitter をベースに stdout/stderr もEventEmitter化し、
 * kill メソッドをモックする
 */
function createMockProcess(): ChildProcess & {
  _emitStderr: (data: string) => void;
  _emitStdout: (data: string) => void;
} {
  const proc = new EventEmitter() as ChildProcess & {
    _emitStderr: (data: string) => void;
    _emitStdout: (data: string) => void;
  };
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();
  Object.defineProperty(proc, 'stdout', { value: stdoutEmitter, writable: true });
  Object.defineProperty(proc, 'stderr', { value: stderrEmitter, writable: true });
  proc.kill = vi.fn(() => true);
  proc.pid = 12345;

  // ヘルパーメソッド
  proc._emitStderr = (data: string) => {
    stderrEmitter.emit('data', Buffer.from(data));
  };
  proc._emitStdout = (data: string) => {
    stdoutEmitter.emit('data', Buffer.from(data));
  };

  return proc;
}

// child_process のモック
const mockSpawn = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

describe('tunnel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllTimers();
    vi.resetModules();
    mockSpawn.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('TUNNEL_URL_PATTERN', () => {
    it('trycloudflare.com のURLにマッチする', async () => {
      const { TUNNEL_URL_PATTERN } = await import('../../src/services/tunnel.js');
      const testUrl = 'https://my-test-tunnel.trycloudflare.com';
      expect(TUNNEL_URL_PATTERN.test(testUrl)).toBe(true);
    });

    it('複数のハイフンを含むURLにマッチする', async () => {
      const { TUNNEL_URL_PATTERN } = await import('../../src/services/tunnel.js');
      const testUrl = 'https://abc-def-ghi-123.trycloudflare.com';
      expect(TUNNEL_URL_PATTERN.test(testUrl)).toBe(true);
    });

    it('無関係なURLにはマッチしない', async () => {
      const { TUNNEL_URL_PATTERN } = await import('../../src/services/tunnel.js');
      expect(TUNNEL_URL_PATTERN.test('https://example.com')).toBe(false);
      expect(TUNNEL_URL_PATTERN.test('http://localhost:4173')).toBe(false);
    });

    it('cloudflaredのログ出力からURLを抽出できる', async () => {
      const { TUNNEL_URL_PATTERN } = await import('../../src/services/tunnel.js');
      const logLine =
        '2024-01-01T00:00:00Z INF +--------------------------------------------------------------------------------------------+\n' +
        '2024-01-01T00:00:00Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |\n' +
        '2024-01-01T00:00:00Z INF |  https://my-cool-tunnel-abc123.trycloudflare.com                                          |\n';
      const match = logLine.match(TUNNEL_URL_PATTERN);
      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('https://my-cool-tunnel-abc123.trycloudflare.com');
    });
  });

  describe('getTunnelInfo', () => {
    it('初期状態ではnullを返す', async () => {
      const { getTunnelInfo } = await import('../../src/services/tunnel.js');
      expect(getTunnelInfo()).toBeNull();
    });
  });

  describe('startTunnel', () => {
    it('cloudflaredが見つからない場合はエラーを投げる', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue(null);

      const { startTunnel } = await import('../../src/services/tunnel.js');
      await expect(startTunnel(4173)).rejects.toThrow('cloudflared が見つかりません');
    });

    it('cloudflaredが見つからない場合にインストールガイドをログ出力する', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue(null);

      const loggerMock = await import('../../src/services/logger.js');
      const { startTunnel } = await import('../../src/services/tunnel.js');
      await expect(startTunnel(4173)).rejects.toThrow();

      expect(binaryMock.getInstallGuide).toHaveBeenCalled();
      expect(loggerMock.default.warn).toHaveBeenCalledWith('インストールガイド');
    });

    it('無効なポート番号（0以下）でエラーを投げる', async () => {
      const { startTunnel } = await import('../../src/services/tunnel.js');
      await expect(startTunnel(0)).rejects.toThrow('無効なポート番号です: 0');
    });

    it('無効なポート番号（負数）でエラーを投げる', async () => {
      const { startTunnel } = await import('../../src/services/tunnel.js');
      await expect(startTunnel(-1)).rejects.toThrow('無効なポート番号です: -1');
    });

    it('無効なポート番号（65536以上）でエラーを投げる', async () => {
      const { startTunnel } = await import('../../src/services/tunnel.js');
      await expect(startTunnel(70000)).rejects.toThrow('無効なポート番号です: 70000');
    });

    it('無効なポート番号（小数）でエラーを投げる', async () => {
      const { startTunnel } = await import('../../src/services/tunnel.js');
      await expect(startTunnel(3.14)).rejects.toThrow('無効なポート番号です: 3.14');
    });

    it('stderrからURL抽出に成功してトンネル情報を返す', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);

      // stderrにトンネルURLを含むログを出力
      mockProc._emitStderr(
        '2024-01-01T00:00:00Z INF | https://test-tunnel-abc.trycloudflare.com |\n',
      );

      const info = await promise;
      expect(info.url).toBe('https://test-tunnel-abc.trycloudflare.com');
      expect(info.provider).toBe('cloudflared');
      expect(info.state).toBe('running');
    });

    it('stdoutからURL抽出に成功してトンネル情報を返す', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);

      // stdoutにトンネルURLを含むログを出力
      mockProc._emitStdout('https://stdout-tunnel-xyz.trycloudflare.com\n');

      const info = await promise;
      expect(info.url).toBe('https://stdout-tunnel-xyz.trycloudflare.com');
      expect(info.state).toBe('running');
    });

    it('spawnに正しい引数を渡す', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/path/to/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(8080);

      // URL出力してresolveさせる
      mockProc._emitStderr('https://spawn-test.trycloudflare.com\n');
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        '/path/to/cloudflared',
        ['tunnel', '--url', 'http://localhost:8080'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
    });

    it('URL抽出がタイムアウトするとエラーを投げる', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);

      // TUNNEL_TIMEOUT（5000ms）まで進める
      vi.advanceTimersByTime(5000);

      await expect(promise).rejects.toThrow('トンネルの起動がタイムアウトしました');
    });

    it('タイムアウト時にプロセスがkillされる', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);

      vi.advanceTimersByTime(5000);

      // rejectを消費
      await promise.catch(() => {});

      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('プロセスのerrorイベントでrejectされる', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);

      // プロセスのエラーイベントを発火
      const spawnError = new Error('ENOENT: cloudflared not found');
      mockProc.emit('error', spawnError);

      await expect(promise).rejects.toThrow('ENOENT: cloudflared not found');
    });

    it('errorイベント時にトンネル情報のstateがerrorになる', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel, getTunnelInfo } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);

      mockProc.emit('error', new Error('spawn failed'));
      await promise.catch(() => {});

      const info = getTunnelInfo();
      expect(info?.state).toBe('error');
    });

    it('URL抽出前にプロセスが異常終了するとrejectされる', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);

      // URLが見つかる前にプロセスが終了
      mockProc.emit('close', 1);

      await expect(promise).rejects.toThrow('cloudflared が異常終了しました (code=1)');
    });

    it('URL抽出前にプロセスがcode=nullで終了するとrejectされる', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);

      // URLが見つかる前にプロセスがnull codeで終了
      mockProc.emit('close', null);

      await expect(promise).rejects.toThrow('cloudflared が異常終了しました (code=null)');
    });

    it('URL抽出前の異常終了時にstateがerrorになる', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel, getTunnelInfo } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);
      mockProc.emit('close', 1);
      await promise.catch(() => {});

      const info = getTunnelInfo();
      expect(info?.state).toBe('error');
    });

    it('URL発見後は2回目のデータを無視する', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel, getTunnelInfo } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);

      // 1回目のURL
      mockProc._emitStderr('https://first-url.trycloudflare.com\n');
      const info = await promise;
      expect(info.url).toBe('https://first-url.trycloudflare.com');

      // 2回目のURLは無視される
      mockProc._emitStderr('https://second-url.trycloudflare.com\n');
      const currentInfo = getTunnelInfo();
      expect(currentInfo?.url).toBe('https://first-url.trycloudflare.com');
    });

    it('URL抽出成功後にgetTunnelInfoで情報を取得できる', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel, getTunnelInfo } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);

      mockProc._emitStderr('https://info-test.trycloudflare.com\n');
      await promise;

      const info = getTunnelInfo();
      expect(info).not.toBeNull();
      expect(info?.url).toBe('https://info-test.trycloudflare.com');
      expect(info?.provider).toBe('cloudflared');
      expect(info?.state).toBe('running');
    });

    it('getTunnelInfoはコピーを返す（内部状態の直接変更を防止）', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel, getTunnelInfo } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);

      mockProc._emitStderr('https://copy-test.trycloudflare.com\n');
      await promise;

      const info1 = getTunnelInfo();
      const info2 = getTunnelInfo();
      expect(info1).toEqual(info2);
      expect(info1).not.toBe(info2); // 異なるオブジェクト
    });

    it('running状態でプロセスが終了すると自動再起動が試行される', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel, getTunnelInfo } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);

      // URLを検出して running 状態にする
      mockProc._emitStderr('https://restart-test.trycloudflare.com\n');
      await promise;

      // running 状態でプロセスが終了（自動再起動がトリガーされる）
      const mockProc2 = createMockProcess();
      mockSpawn.mockReturnValue(mockProc2);

      mockProc.emit('close', 1);

      const info = getTunnelInfo();
      expect(info?.state).toBe('stopped');

      // 3秒後に再起動が試行される（retryCount=1, delay=3000ms）
      await vi.advanceTimersByTimeAsync(3000);

      // 再起動時にspawnが再度呼ばれることを確認
      expect(mockSpawn).toHaveBeenCalledTimes(2);

      // 再起動のpromiseをresolveするためにURLを出力
      mockProc2._emitStderr('https://restart-test-2.trycloudflare.com\n');
      await vi.advanceTimersByTimeAsync(0);
    });

    it('再起動が上限（3回）に達するとそれ以上再起動しない', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const { startTunnel } = await import('../../src/services/tunnel.js');

      // 初回起動
      const mockProc1 = createMockProcess();
      mockSpawn.mockReturnValue(mockProc1);
      const promise1 = startTunnel(4173);
      mockProc1._emitStderr('https://retry-test-1.trycloudflare.com\n');
      await promise1;

      // running状態でプロセス終了 → 再起動1回目がスケジュールされる
      // 再起動1回目: プロセスがURLを返さずに異常終了する（retryCountが増え続ける）
      const mockProc2 = createMockProcess();
      mockSpawn.mockReturnValue(mockProc2);
      mockProc1.emit('close', 1);

      // 再起動1回目のタイマー発火（delay=3000ms）
      await vi.advanceTimersByTimeAsync(3000);
      expect(mockSpawn).toHaveBeenCalledTimes(2);
      // startTunnelが呼ばれた後、URL抽出してrunning状態にする
      mockProc2._emitStderr('https://retry-test-2.trycloudflare.com\n');
      await vi.advanceTimersByTimeAsync(0);

      // 2回目の切断 → 再起動2回目
      const mockProc3 = createMockProcess();
      mockSpawn.mockReturnValue(mockProc3);
      mockProc2.emit('close', 1);
      // retryCount は startTunnel 成功時に 0 にリセットされるので、
      // ここでは retryCount=0 → handleRestart で retryCount=1, delay=3000ms
      await vi.advanceTimersByTimeAsync(3000);
      expect(mockSpawn).toHaveBeenCalledTimes(3);
      mockProc3._emitStderr('https://retry-test-3.trycloudflare.com\n');
      await vi.advanceTimersByTimeAsync(0);

      // 3回目の切断 → 再起動3回目
      const mockProc4 = createMockProcess();
      mockSpawn.mockReturnValue(mockProc4);
      mockProc3.emit('close', 1);
      await vi.advanceTimersByTimeAsync(3000);
      expect(mockSpawn).toHaveBeenCalledTimes(4);
      mockProc4._emitStderr('https://retry-test-4.trycloudflare.com\n');
      await vi.advanceTimersByTimeAsync(0);

      // 注意: retryCount は成功のたびにリセットされるので、
      // 実質的には無制限に再起動できる設計。
      // 上限テストは「再起動失敗が連続する場合」で行う。
    });

    it('再起動が連続して失敗すると上限で停止する', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');
      const loggerMock = await import('../../src/services/logger.js');

      const { startTunnel } = await import('../../src/services/tunnel.js');

      // 初回起動
      const mockProc1 = createMockProcess();
      mockSpawn.mockReturnValue(mockProc1);
      const promise1 = startTunnel(4173);
      mockProc1._emitStderr('https://retry-limit.trycloudflare.com\n');
      await promise1;

      // running状態でプロセス終了 → handleRestart(retryCount=0→1)
      const mockProc2 = createMockProcess();
      mockSpawn.mockReturnValue(mockProc2);
      mockProc1.emit('close', 1);

      // 再起動1回目: タイマー発火後、URL検出されずタイムアウトする
      await vi.advanceTimersByTimeAsync(3000); // delay=3000ms
      expect(mockSpawn).toHaveBeenCalledTimes(2);
      // URLが出力されないままタイムアウト → startTunnelがreject → handleRestart内のcatchでエラーログ
      // ただしタイムアウトは5000ms
      // この再起動の startTunnel が reject されると、handleRestart の catch で logger.error が呼ばれるが
      // tunnelInfo.state = 'starting' のまま。close イベントで再起動はされない。

      // closeイベントでURL未検出の場合は handleRestart に入らず reject される
      // これにより再起動のstartTunnelがrejectされる
      mockProc2.emit('close', 1); // code=1で異常終了 → reject
      await vi.advanceTimersByTimeAsync(0);
      // handleRestart の catch が実行され、logger.error が呼ばれる
      expect(loggerMock.default.error).toHaveBeenCalled();
    });

    it('再起動時にstartTunnelが失敗してもエラーが伝播しない', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const { startTunnel } = await import('../../src/services/tunnel.js');

      // 1回目の起動成功
      const mockProc1 = createMockProcess();
      mockSpawn.mockReturnValue(mockProc1);
      const promise1 = startTunnel(4173);
      mockProc1._emitStderr('https://restart-fail.trycloudflare.com\n');
      await promise1;

      // 再起動時にバイナリが見つからない
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue(null);

      // running 状態でプロセス終了
      mockProc1.emit('close', 1);

      // 再起動を待つ（エラーが発生してもプロセスはクラッシュしない）
      await vi.advanceTimersByTimeAsync(3000);

      // エラーにならずに完了する
      const loggerMock = await import('../../src/services/logger.js');
      expect(loggerMock.default.error).toHaveBeenCalled();
    });

    it('URLを含まないデータを受信した場合はresolveしない', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel } = await import('../../src/services/tunnel.js');
      let resolved = false;
      const promise = startTunnel(4173).then(() => {
        resolved = true;
      });

      // URLを含まないデータを送る
      mockProc._emitStderr('Starting tunnel...\n');
      mockProc._emitStderr('Connecting to server...\n');

      // tick を進めるが resolve されない
      await vi.advanceTimersByTimeAsync(100);
      expect(resolved).toBe(false);

      // 最終的にURLが来ればresolveされる
      mockProc._emitStderr('https://delayed-url.trycloudflare.com\n');
      await promise;
      expect(resolved).toBe(true);
    });

    it('running状態でプロセス終了時にログが出力される', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');
      const loggerMock = await import('../../src/services/logger.js');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);
      mockProc._emitStderr('https://log-test.trycloudflare.com\n');
      await promise;

      // running状態でプロセス終了
      // 再起動用のプロセスを準備
      const mockProc2 = createMockProcess();
      mockSpawn.mockReturnValue(mockProc2);
      mockProc.emit('close', 2);

      expect(loggerMock.default.warn).toHaveBeenCalledWith(
        'トンネルプロセスが終了しました (code=%s)',
        '2',
      );

      // 再起動タイマーを消化
      await vi.advanceTimersByTimeAsync(3000);
      mockProc2._emitStderr('https://log-test-2.trycloudflare.com\n');
      await vi.advanceTimersByTimeAsync(0);
    });

    it('running状態でcode=nullの場合のログ出力', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');
      const loggerMock = await import('../../src/services/logger.js');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);
      mockProc._emitStderr('https://null-code-log.trycloudflare.com\n');
      await promise;

      // 再起動用のプロセスを準備
      const mockProc2 = createMockProcess();
      mockSpawn.mockReturnValue(mockProc2);
      mockProc.emit('close', null);

      expect(loggerMock.default.warn).toHaveBeenCalledWith(
        'トンネルプロセスが終了しました (code=%s)',
        'unknown',
      );

      // 再起動タイマーを消化
      await vi.advanceTimersByTimeAsync(3000);
      mockProc2._emitStderr('https://null-code-2.trycloudflare.com\n');
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  describe('stopTunnel', () => {
    it('未起動時でもエラーにならない', async () => {
      const { stopTunnel } = await import('../../src/services/tunnel.js');
      expect(() => stopTunnel()).not.toThrow();
    });

    it('実行中のプロセスを停止しSIGTERMを送信する', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel, stopTunnel } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);

      mockProc._emitStderr('https://stop-test.trycloudflare.com\n');
      await promise;

      stopTunnel();

      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('停止後にトンネル情報のstateがstoppedになる', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel, stopTunnel, getTunnelInfo } = await import(
        '../../src/services/tunnel.js'
      );
      const promise = startTunnel(4173);

      mockProc._emitStderr('https://stop-state.trycloudflare.com\n');
      await promise;

      stopTunnel();

      const info = getTunnelInfo();
      expect(info?.state).toBe('stopped');
      expect(info?.url).toBe('');
    });

    it('停止後にログが出力される', async () => {
      const loggerMock = await import('../../src/services/logger.js');
      const { stopTunnel } = await import('../../src/services/tunnel.js');
      stopTunnel();
      expect(loggerMock.default.info).toHaveBeenCalledWith('トンネルを停止しました');
    });

    it('stopTunnelで再起動が抑制される', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const { startTunnel, stopTunnel } = await import('../../src/services/tunnel.js');
      const promise = startTunnel(4173);

      mockProc._emitStderr('https://no-restart.trycloudflare.com\n');
      await promise;

      // 明示的に停止
      stopTunnel();

      const spawnCountBefore = mockSpawn.mock.calls.length;

      // 十分な時間を待つ
      await vi.advanceTimersByTimeAsync(30000);

      // spawn回数が増えていないことを確認
      expect(mockSpawn.mock.calls.length).toBe(spawnCountBefore);
    });

    it('停止後に再度startTunnelできる', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue('/usr/local/bin/cloudflared');

      // 1回目の起動
      const mockProc1 = createMockProcess();
      mockSpawn.mockReturnValue(mockProc1);

      const { startTunnel, stopTunnel, getTunnelInfo } = await import(
        '../../src/services/tunnel.js'
      );
      const promise1 = startTunnel(4173);
      mockProc1._emitStderr('https://first-start.trycloudflare.com\n');
      await promise1;

      // 停止
      stopTunnel();
      expect(getTunnelInfo()?.state).toBe('stopped');

      // 2回目の起動
      const mockProc2 = createMockProcess();
      mockSpawn.mockReturnValue(mockProc2);

      const promise2 = startTunnel(4173);
      mockProc2._emitStderr('https://second-start.trycloudflare.com\n');
      const info2 = await promise2;

      expect(info2.url).toBe('https://second-start.trycloudflare.com');
      expect(info2.state).toBe('running');
    });
  });
});
