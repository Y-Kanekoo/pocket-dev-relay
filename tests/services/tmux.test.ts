import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/shell.js', () => ({
  exec: vi.fn(),
  which: vi.fn(),
}));

import {
  isInstalled,
  getStatus,
  listSessions,
  hasSession,
  createSession,
  killSession,
  getAttachCommand,
  createSessionFromLayout,
} from '../../src/services/tmux.js';
import { exec, which } from '../../src/utils/shell.js';
import type { TmuxLayout } from '../../src/types.js';

const mockedExec = vi.mocked(exec);
const mockedWhich = vi.mocked(which);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tmux', () => {
  describe('isInstalled()', () => {
    it('returns true when tmux is found', async () => {
      mockedWhich.mockResolvedValue(true);

      const result = await isInstalled();

      expect(mockedWhich).toHaveBeenCalledWith('tmux');
      expect(result).toBe(true);
    });

    it('returns false when tmux is not found', async () => {
      mockedWhich.mockResolvedValue(false);

      const result = await isInstalled();

      expect(result).toBe(false);
    });
  });

  describe('getStatus()', () => {
    it('returns not-installed status when tmux is not found', async () => {
      mockedWhich.mockResolvedValue(false);

      const status = await getStatus();

      expect(status).toEqual({
        installed: false,
        serverRunning: false,
        version: null,
        sessions: [],
      });
    });

    it('returns full status when installed with sessions', async () => {
      mockedWhich.mockResolvedValue(true);

      mockedExec.mockImplementation(async (cmd: string, args: string[] = []) => {
        // tmux -V: return version
        if (cmd === 'tmux' && args[0] === '-V') {
          return { stdout: 'tmux 3.3a', stderr: '', exitCode: 0 };
        }

        // tmux list-sessions -F ...: return session data
        if (cmd === 'tmux' && args[0] === 'list-sessions') {
          // If it has -F flag, return formatted output
          if (args.includes('-F')) {
            return {
              stdout: 'dev|3|1|1700000000|200x50\nwork|2|0|1700000100|200x50',
              stderr: '',
              exitCode: 0,
            };
          }
          // Bare list-sessions call for serverRunning probe
          return { stdout: '', stderr: '', exitCode: 0 };
        }

        return { stdout: '', stderr: '', exitCode: 0 };
      });

      const status = await getStatus();

      expect(status).toEqual({
        installed: true,
        serverRunning: true,
        version: '3.3a',
        sessions: [
          { name: 'dev', windows: 3, attached: true, created: '1700000000', size: '200x50' },
          { name: 'work', windows: 2, attached: false, created: '1700000100', size: '200x50' },
        ],
      });
    });
  });

  describe('listSessions()', () => {
    it('parses pipe-delimited output correctly', async () => {
      mockedExec.mockResolvedValue({
        stdout: 'main|5|1|1700000000|240x60\nbackground|1|0|1700001000|120x40',
        stderr: '',
        exitCode: 0,
      });

      const sessions = await listSessions();

      expect(sessions).toEqual([
        { name: 'main', windows: 5, attached: true, created: '1700000000', size: '240x60' },
        { name: 'background', windows: 1, attached: false, created: '1700001000', size: '120x40' },
      ]);
    });

    it('returns empty array when no sessions exist', async () => {
      mockedExec.mockResolvedValue({ stdout: '', stderr: 'no server running', exitCode: 1 });

      const sessions = await listSessions();

      expect(sessions).toEqual([]);
    });
  });

  describe('hasSession()', () => {
    it('returns true when session exists', async () => {
      mockedExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const result = await hasSession('dev');

      expect(mockedExec).toHaveBeenCalledWith('tmux', ['has-session', '-t', 'dev']);
      expect(result).toBe(true);
    });

    it('returns false when session does not exist', async () => {
      mockedExec.mockResolvedValue({ stdout: '', stderr: "can't find session: dev", exitCode: 1 });

      const result = await hasSession('dev');

      expect(result).toBe(false);
    });
  });

  describe('createSession()', () => {
    it('returns true on success', async () => {
      mockedExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const result = await createSession('dev');

      expect(mockedExec).toHaveBeenCalledWith('tmux', ['new-session', '-d', '-s', 'dev']);
      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      mockedExec.mockResolvedValue({ stdout: '', stderr: 'duplicate session', exitCode: 1 });

      const result = await createSession('dev');

      expect(result).toBe(false);
    });
  });

  describe('killSession()', () => {
    it('returns true on success', async () => {
      mockedExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const result = await killSession('dev');

      expect(mockedExec).toHaveBeenCalledWith('tmux', ['kill-session', '-t', 'dev']);
      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      mockedExec.mockResolvedValue({ stdout: '', stderr: "can't find session", exitCode: 1 });

      const result = await killSession('dev');

      expect(result).toBe(false);
    });
  });

  describe('getAttachCommand()', () => {
    it('returns the correct attach command string', () => {
      const cmd = getAttachCommand('dev');

      expect(cmd).toBe('tmux attach-session -t dev');
    });
  });

  describe('createSessionFromLayout()', () => {
    it('creates a session from a simple layout with correct tmux commands', async () => {
      mockedExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const layout: TmuxLayout = {
        name: 'test',
        description: 'Test layout',
        windows: [
          { name: 'editor', command: 'vim .' },
          { name: 'terminal' },
        ],
      };

      const result = await createSessionFromLayout(layout);

      expect(result).toBe(true);

      // Verify the sequence of exec calls
      const calls = mockedExec.mock.calls;

      // 1. Create detached session
      expect(calls[0]).toEqual(['tmux', ['new-session', '-d', '-s', 'test']]);

      // 2. Create first window (editor) at index 1
      expect(calls[1]).toEqual(['tmux', ['new-window', '-t', 'test:1', '-n', 'editor']]);

      // 3. Send command to first window (window has command, no panes)
      expect(calls[2]).toEqual(['tmux', ['send-keys', '-t', 'test:1.0', 'vim .', 'Enter']]);

      // 4. Create second window (terminal) at index 2
      expect(calls[3]).toEqual(['tmux', ['new-window', '-t', 'test:2', '-n', 'terminal']]);

      // 5. Kill the auto-created window 0
      expect(calls[4]).toEqual(['tmux', ['kill-window', '-t', 'test:0']]);
    });

    it('creates panes with correct split commands', async () => {
      mockedExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const layout: TmuxLayout = {
        name: 'split',
        description: 'Split layout',
        windows: [
          {
            name: 'main',
            panes: [
              { command: 'htop' },
              { split: 'horizontal', command: 'tail -f log' },
            ],
          },
        ],
      };

      const result = await createSessionFromLayout(layout);

      expect(result).toBe(true);

      const calls = mockedExec.mock.calls;

      // 1. Create detached session
      expect(calls[0]).toEqual(['tmux', ['new-session', '-d', '-s', 'split']]);

      // 2. Create window at index 1
      expect(calls[1]).toEqual(['tmux', ['new-window', '-t', 'split:1', '-n', 'main']]);

      // 3. Send command to first pane (pane 0 already exists)
      expect(calls[2]).toEqual(['tmux', ['send-keys', '-t', 'split:1.0', 'htop', 'Enter']]);

      // 4. Split for second pane (horizontal)
      expect(calls[3]).toEqual(['tmux', ['split-window', '-t', 'split:1', '-h']]);

      // 5. Send command to second pane
      expect(calls[4]).toEqual(['tmux', ['send-keys', '-t', 'split:1.1', 'tail -f log', 'Enter']]);

      // 6. Kill auto-created window 0
      expect(calls[5]).toEqual(['tmux', ['kill-window', '-t', 'split:0']]);
    });

    it('returns false when session creation fails', async () => {
      mockedExec.mockResolvedValue({ stdout: '', stderr: 'error', exitCode: 1 });

      const layout: TmuxLayout = {
        name: 'fail',
        description: 'Failing layout',
        windows: [{ name: 'win' }],
      };

      const result = await createSessionFromLayout(layout);

      expect(result).toBe(false);
    });
  });
});
