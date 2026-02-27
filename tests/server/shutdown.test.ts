/**
 * グレースフルシャットダウンのテスト
 * cleanupAllSessions の動作を中心に検証
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// config.js のモック
vi.mock('../../src/config.js', () => ({
  AUTH_TOKEN: '',
  ROOT_DIR: '/tmp/test',
  ENABLE_SESSION_LOGS: false,
  LOG_DIR: '/tmp/test-logs',
  LOG_MAX_AGE_DAYS: 7,
  LOG_MAX_SIZE_MB: 100,
  LOG_LEVEL: 'silent',
  APP_VERSION: '0.0.0-test',
}));

// node-pty のモック
vi.mock('node-pty', () => ({
  spawn: vi.fn(),
}));

// nanoid のモック
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test123456'),
}));

// ssh2 のモック
vi.mock('ssh2', () => ({
  Client: vi.fn(),
}));

// ssh.js のモック
vi.mock('../../src/services/ssh.js', () => ({
  createSSHSession: vi.fn(),
  resizeSSHChannel: vi.fn(),
  closeSSHConnection: vi.fn(),
  isSSHEnabled: vi.fn(() => false),
}));

// notifier.js のモック
vi.mock('../../src/services/notifier.js', () => ({
  detectError: vi.fn(),
  sendErrorNotification: vi.fn(),
  sendExitNotification: vi.fn(),
  clearNotificationState: vi.fn(),
}));

// pty.js のモック
vi.mock('../../src/services/pty.js', () => ({
  spawnForMode: vi.fn(() => ({
    command: '/bin/bash',
    args: [],
    label: 'テスト',
  })),
}));

// path.js のモック
vi.mock('../../src/utils/path.js', () => ({
  resolvePath: vi.fn((p: string) => p),
}));

describe('cleanupAllSessions', () => {
  let sessions: Map<string, unknown>;
  let sessionLogs: Map<string, unknown>;
  let cleanupAllSessions: () => void;

  beforeEach(async () => {
    vi.resetModules();

    // config.js を再モック
    vi.doMock('../../src/config.js', () => ({
      AUTH_TOKEN: '',
      ROOT_DIR: '/tmp/test',
      ENABLE_SESSION_LOGS: false,
      LOG_DIR: '/tmp/test-logs',
      LOG_MAX_AGE_DAYS: 7,
      LOG_MAX_SIZE_MB: 100,
      LOG_LEVEL: 'silent',
      APP_VERSION: '0.0.0-test',
    }));

    vi.doMock('node-pty', () => ({
      spawn: vi.fn(),
    }));

    vi.doMock('nanoid', () => ({
      nanoid: vi.fn(() => 'test123456'),
    }));

    vi.doMock('ssh2', () => ({
      Client: vi.fn(),
    }));

    vi.doMock('../../src/services/ssh.js', () => ({
      createSSHSession: vi.fn(),
      resizeSSHChannel: vi.fn(),
      closeSSHConnection: vi.fn(),
      isSSHEnabled: vi.fn(() => false),
    }));

    vi.doMock('../../src/services/notifier.js', () => ({
      detectError: vi.fn(),
      sendErrorNotification: vi.fn(),
      sendExitNotification: vi.fn(),
      clearNotificationState: vi.fn(),
    }));

    vi.doMock('../../src/services/pty.js', () => ({
      spawnForMode: vi.fn(() => ({
        command: '/bin/bash',
        args: [],
        label: 'テスト',
      })),
    }));

    vi.doMock('../../src/utils/path.js', () => ({
      resolvePath: vi.fn((p: string) => p),
    }));

    const mod = await import('../../src/services/session.js');
    sessions = mod.sessions;
    sessionLogs = mod.sessionLogs;
    cleanupAllSessions = mod.cleanupAllSessions;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // 基本動作
  // ============================================================

  describe('基本動作', () => {
    it('セッションがない場合でもエラーにならないこと', () => {
      expect(() => cleanupAllSessions()).not.toThrow();
      expect(sessions.size).toBe(0);
    });

    it('全セッションがクリアされること', () => {
      // ダミーセッションを登録
      const mockPty = { kill: vi.fn() };
      sessions.set('session-1', {
        id: 'session-1',
        mode: 'shell',
        cwd: '.',
        label: 'テスト1',
        pty: mockPty,
        sshClient: null,
        sshChannel: null,
        ws: null,
        logStream: null,
        logFileName: null,
      });
      sessions.set('session-2', {
        id: 'session-2',
        mode: 'shell',
        cwd: '.',
        label: 'テスト2',
        pty: mockPty,
        sshClient: null,
        sshChannel: null,
        ws: null,
        logStream: null,
        logFileName: null,
      });

      expect(sessions.size).toBe(2);
      cleanupAllSessions();
      expect(sessions.size).toBe(0);
    });

    it('セッションログのメタデータもクリアされること', () => {
      sessionLogs.set('session-1', {
        id: 'session-1',
        fileName: 'test.log',
        mode: 'shell',
        label: 'テスト',
        cwd: '.',
        startedAt: new Date().toISOString(),
        endedAt: null,
      });

      expect(sessionLogs.size).toBe(1);
      cleanupAllSessions();
      expect(sessionLogs.size).toBe(0);
    });
  });

  // ============================================================
  // PTYセッションのクリーンアップ
  // ============================================================

  describe('PTYセッションのクリーンアップ', () => {
    it('PTYプロセスのkillが呼ばれること', () => {
      const mockPty = { kill: vi.fn() };
      sessions.set('session-pty', {
        id: 'session-pty',
        mode: 'shell',
        cwd: '.',
        label: 'テスト',
        pty: mockPty,
        sshClient: null,
        sshChannel: null,
        ws: null,
        logStream: null,
        logFileName: null,
      });

      cleanupAllSessions();
      expect(mockPty.kill).toHaveBeenCalledTimes(1);
    });

    it('PTYのkillがエラーを投げても他のセッションが処理されること', () => {
      const mockPty1 = {
        kill: vi.fn(() => {
          throw new Error('kill失敗');
        }),
      };
      const mockPty2 = { kill: vi.fn() };

      sessions.set('session-1', {
        id: 'session-1',
        mode: 'shell',
        cwd: '.',
        label: 'テスト1',
        pty: mockPty1,
        sshClient: null,
        sshChannel: null,
        ws: null,
        logStream: null,
        logFileName: null,
      });
      sessions.set('session-2', {
        id: 'session-2',
        mode: 'shell',
        cwd: '.',
        label: 'テスト2',
        pty: mockPty2,
        sshClient: null,
        sshChannel: null,
        ws: null,
        logStream: null,
        logFileName: null,
      });

      expect(() => cleanupAllSessions()).not.toThrow();
      expect(mockPty1.kill).toHaveBeenCalled();
      expect(mockPty2.kill).toHaveBeenCalled();
      expect(sessions.size).toBe(0);
    });

    it('PTYがnullの場合はkillが呼ばれないこと', () => {
      sessions.set('session-no-pty', {
        id: 'session-no-pty',
        mode: 'shell',
        cwd: '.',
        label: 'テスト',
        pty: null,
        sshClient: null,
        sshChannel: null,
        ws: null,
        logStream: null,
        logFileName: null,
      });

      expect(() => cleanupAllSessions()).not.toThrow();
      expect(sessions.size).toBe(0);
    });
  });

  // ============================================================
  // SSHセッションのクリーンアップ
  // ============================================================

  describe('SSHセッションのクリーンアップ', () => {
    it('SSH接続のcloseSSHConnectionが呼ばれること', async () => {
      const sshMod = await import('../../src/services/ssh.js');
      const mockSshClient = { end: vi.fn() };

      sessions.set('session-ssh', {
        id: 'session-ssh',
        mode: 'ssh',
        cwd: 'host:22',
        label: 'SSH: user@host',
        pty: null,
        sshClient: mockSshClient,
        sshChannel: null,
        ws: null,
        logStream: null,
        logFileName: null,
      });

      cleanupAllSessions();
      expect(sshMod.closeSSHConnection).toHaveBeenCalledWith(mockSshClient);
      expect(sessions.size).toBe(0);
    });
  });

  // ============================================================
  // ログストリームのクリーンアップ
  // ============================================================

  describe('ログストリームのクリーンアップ', () => {
    it('ログストリームのendが呼ばれること', () => {
      const mockLogStream = { end: vi.fn() };
      const mockPty = { kill: vi.fn() };

      sessions.set('session-log', {
        id: 'session-log',
        mode: 'shell',
        cwd: '.',
        label: 'テスト',
        pty: mockPty,
        sshClient: null,
        sshChannel: null,
        ws: null,
        logStream: mockLogStream,
        logFileName: 'test.log',
      });

      cleanupAllSessions();
      expect(mockLogStream.end).toHaveBeenCalledTimes(1);
    });

    it('ログストリームがnullの場合はendが呼ばれないこと', () => {
      const mockPty = { kill: vi.fn() };

      sessions.set('session-no-log', {
        id: 'session-no-log',
        mode: 'shell',
        cwd: '.',
        label: 'テスト',
        pty: mockPty,
        sshClient: null,
        sshChannel: null,
        ws: null,
        logStream: null,
        logFileName: null,
      });

      // エラーなく完了すればOK
      expect(() => cleanupAllSessions()).not.toThrow();
    });
  });

  // ============================================================
  // 複合シナリオ
  // ============================================================

  describe('複合シナリオ', () => {
    it('PTY・SSH・ログストリームが混在するセッションが全て処理されること', async () => {
      const sshMod = await import('../../src/services/ssh.js');

      const mockPty = { kill: vi.fn() };
      const mockLogStream1 = { end: vi.fn() };
      const mockLogStream2 = { end: vi.fn() };
      const mockSshClient = { end: vi.fn() };

      // PTYセッション（ログあり）
      sessions.set('session-pty', {
        id: 'session-pty',
        mode: 'shell',
        cwd: '.',
        label: 'Shell',
        pty: mockPty,
        sshClient: null,
        sshChannel: null,
        ws: null,
        logStream: mockLogStream1,
        logFileName: 'pty.log',
      });

      // SSHセッション（ログあり）
      sessions.set('session-ssh', {
        id: 'session-ssh',
        mode: 'ssh',
        cwd: 'host:22',
        label: 'SSH',
        pty: null,
        sshClient: mockSshClient,
        sshChannel: null,
        ws: null,
        logStream: mockLogStream2,
        logFileName: 'ssh.log',
      });

      // ログメタデータも登録
      sessionLogs.set('session-pty', {
        id: 'session-pty',
        fileName: 'pty.log',
        mode: 'shell',
        label: 'Shell',
        cwd: '.',
        startedAt: new Date().toISOString(),
        endedAt: null,
      });
      sessionLogs.set('session-ssh', {
        id: 'session-ssh',
        fileName: 'ssh.log',
        mode: 'ssh',
        label: 'SSH',
        cwd: 'host:22',
        startedAt: new Date().toISOString(),
        endedAt: null,
      });

      cleanupAllSessions();

      // 全PTYがkillされること
      expect(mockPty.kill).toHaveBeenCalled();
      // SSH接続がクローズされること
      expect(sshMod.closeSSHConnection).toHaveBeenCalledWith(mockSshClient);
      // 全ログストリームがendされること
      expect(mockLogStream1.end).toHaveBeenCalled();
      expect(mockLogStream2.end).toHaveBeenCalled();
      // セッションがクリアされること
      expect(sessions.size).toBe(0);
      // ログメタデータもクリアされること
      expect(sessionLogs.size).toBe(0);
    });
  });
});

// ============================================================
// stopSession のテスト
// ============================================================

describe('stopSession', () => {
  let sessions: Map<string, unknown>;
  let sessionLogs: Map<string, unknown>;
  let stopSession: (sessionId: string, reason: string) => void;

  beforeEach(async () => {
    vi.resetModules();

    vi.doMock('../../src/config.js', () => ({
      AUTH_TOKEN: '',
      ROOT_DIR: '/tmp/test',
      ENABLE_SESSION_LOGS: false,
      LOG_DIR: '/tmp/test-logs',
      LOG_MAX_AGE_DAYS: 7,
      LOG_MAX_SIZE_MB: 100,
      LOG_LEVEL: 'silent',
      APP_VERSION: '0.0.0-test',
    }));

    vi.doMock('node-pty', () => ({
      spawn: vi.fn(),
    }));

    vi.doMock('nanoid', () => ({
      nanoid: vi.fn(() => 'test123456'),
    }));

    vi.doMock('ssh2', () => ({
      Client: vi.fn(),
    }));

    vi.doMock('../../src/services/ssh.js', () => ({
      createSSHSession: vi.fn(),
      resizeSSHChannel: vi.fn(),
      closeSSHConnection: vi.fn(),
      isSSHEnabled: vi.fn(() => false),
    }));

    vi.doMock('../../src/services/notifier.js', () => ({
      detectError: vi.fn(),
      sendErrorNotification: vi.fn(),
      sendExitNotification: vi.fn(),
      clearNotificationState: vi.fn(),
    }));

    vi.doMock('../../src/services/pty.js', () => ({
      spawnForMode: vi.fn(() => ({
        command: '/bin/bash',
        args: [],
        label: 'テスト',
      })),
    }));

    vi.doMock('../../src/utils/path.js', () => ({
      resolvePath: vi.fn((p: string) => p),
    }));

    const mod = await import('../../src/services/session.js');
    sessions = mod.sessions;
    sessionLogs = mod.sessionLogs;
    stopSession = mod.stopSession;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('存在しないセッションIDの場合はエラーにならないこと', () => {
    expect(() => stopSession('non-existent', 'テスト')).not.toThrow();
  });

  it('PTYセッションを停止できること', () => {
    const mockPty = { kill: vi.fn() };
    const mockWs = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
    };

    sessions.set('session-stop', {
      id: 'session-stop',
      mode: 'shell',
      cwd: '.',
      label: 'テスト',
      pty: mockPty,
      sshClient: null,
      sshChannel: null,
      ws: mockWs,
      logStream: null,
      logFileName: null,
    });

    stopSession('session-stop', 'ユーザーによる停止');

    expect(mockPty.kill).toHaveBeenCalled();
    expect(sessions.has('session-stop')).toBe(false);
    // WebSocketにstoppedメッセージが送信されること
    expect(mockWs.send).toHaveBeenCalled();
    const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
    expect(sentData.type).toBe('stopped');
    expect(sentData.reason).toBe('ユーザーによる停止');
  });

  it('SSHセッションを停止できること', async () => {
    const sshMod = await import('../../src/services/ssh.js');
    const mockSshClient = { end: vi.fn() };
    const mockWs = {
      readyState: 1,
      send: vi.fn(),
    };

    sessions.set('session-ssh-stop', {
      id: 'session-ssh-stop',
      mode: 'ssh',
      cwd: 'host:22',
      label: 'SSH',
      pty: null,
      sshClient: mockSshClient,
      sshChannel: null,
      ws: mockWs,
      logStream: null,
      logFileName: null,
    });

    stopSession('session-ssh-stop', 'タイムアウト');

    expect(sshMod.closeSSHConnection).toHaveBeenCalledWith(mockSshClient);
    expect(sessions.has('session-ssh-stop')).toBe(false);
  });

  it('ログストリームが閉じられ、メタデータが更新されること', () => {
    const mockPty = { kill: vi.fn() };
    const mockLogStream = { write: vi.fn(), end: vi.fn() };
    const mockWs = {
      readyState: 1,
      send: vi.fn(),
    };

    sessions.set('session-log-stop', {
      id: 'session-log-stop',
      mode: 'shell',
      cwd: '.',
      label: 'テスト',
      pty: mockPty,
      sshClient: null,
      sshChannel: null,
      ws: mockWs,
      logStream: mockLogStream,
      logFileName: 'test.log',
    });

    // sessionLogsにメタデータも登録
    sessionLogs.set('session-log-stop', {
      id: 'session-log-stop',
      fileName: 'test.log',
      mode: 'shell',
      label: 'テスト',
      cwd: '.',
      startedAt: '2024-01-01T00:00:00.000Z',
      endedAt: null,
    });

    stopSession('session-log-stop', '手動停止');

    // ログストリームにフッターが書き込まれること
    expect(mockLogStream.write).toHaveBeenCalled();
    const writtenContent = mockLogStream.write.mock.calls[0][0] as string;
    expect(writtenContent).toContain('セッション停止');
    expect(writtenContent).toContain('手動停止');
    // endが呼ばれること
    expect(mockLogStream.end).toHaveBeenCalled();
    // メタデータが更新されること
    const logMeta = sessionLogs.get('session-log-stop') as Record<string, unknown>;
    expect(logMeta.endedAt).not.toBeNull();
    expect(logMeta.stopReason).toBe('手動停止');
  });
});
