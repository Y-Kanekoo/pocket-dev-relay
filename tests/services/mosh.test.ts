import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/shell.js', () => ({
  exec: vi.fn(),
  which: vi.fn(),
}));

import { isInstalled, getStatus, startServer, stopServer, getConnectionCommand } from '../../src/services/mosh.js';
import { exec, which } from '../../src/utils/shell.js';

const mockedExec = vi.mocked(exec);
const mockedWhich = vi.mocked(which);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mosh', () => {
  describe('isInstalled()', () => {
    it('returns true when both mosh and mosh-server exist', async () => {
      mockedWhich.mockResolvedValue(true);

      const result = await isInstalled();

      expect(mockedWhich).toHaveBeenCalledWith('mosh');
      expect(mockedWhich).toHaveBeenCalledWith('mosh-server');
      expect(result).toBe(true);
    });

    it('returns false when only mosh exists but mosh-server does not', async () => {
      mockedWhich.mockImplementation(async (cmd: string) => {
        if (cmd === 'mosh') return true;
        if (cmd === 'mosh-server') return false;
        return false;
      });

      const result = await isInstalled();

      expect(result).toBe(false);
    });
  });

  describe('getStatus()', () => {
    it('returns not-installed status when mosh is not installed', async () => {
      mockedWhich.mockResolvedValue(false);

      const status = await getStatus();

      expect(status).toEqual({
        installed: false,
        serverRunning: false,
        version: null,
        ports: [],
      });
    });

    it('returns full status when installed and running with ports', async () => {
      mockedWhich.mockResolvedValue(true);

      mockedExec.mockImplementation(async (cmd: string, args: string[] = []) => {
        // pgrep mosh-server: return running PIDs
        if (cmd === 'pgrep' && args[0] === 'mosh-server') {
          return { stdout: '1234\n5678', stderr: '', exitCode: 0 };
        }

        // mosh-server --version: return version on stderr
        if (cmd === 'mosh-server' && args[0] === '--version') {
          return { stdout: '', stderr: 'mosh 1.4.0 (mosh-server)', exitCode: 0 };
        }

        // ss -ulnp: return ports
        if (cmd === 'ss' && args[0] === '-ulnp') {
          return {
            stdout: [
              'State  Recv-Q Send-Q  Local Address:Port  Peer Address:Port  Process',
              'UNCONN 0      0       *:60001 *:*  users:(("mosh-server",pid=1234,fd=4))',
              'UNCONN 0      0       *:60002 *:*  users:(("mosh-server",pid=5678,fd=4))',
            ].join('\n'),
            stderr: '',
            exitCode: 0,
          };
        }

        return { stdout: '', stderr: '', exitCode: 0 };
      });

      const status = await getStatus();

      expect(status).toEqual({
        installed: true,
        serverRunning: true,
        version: '1.4.0',
        ports: [60001, 60002],
      });
    });
  });

  describe('startServer()', () => {
    it('returns ok with message on success', async () => {
      mockedExec.mockResolvedValue({
        stdout: 'MOSH CONNECT 60001 somekey',
        stderr: '',
        exitCode: 0,
      });

      const result = await startServer();

      expect(mockedExec).toHaveBeenCalledWith('mosh-server', ['new', '-s']);
      expect(result).toEqual({
        ok: true,
        message: 'MOSH CONNECT 60001 somekey',
      });
    });

    it('passes port range arguments when provided', async () => {
      mockedExec.mockResolvedValue({
        stdout: 'MOSH CONNECT 60005 somekey',
        stderr: '',
        exitCode: 0,
      });

      await startServer('60000:60010');

      expect(mockedExec).toHaveBeenCalledWith('mosh-server', ['new', '-s', '-p', '60000:60010']);
    });

    it('returns not ok with error message on failure', async () => {
      mockedExec.mockResolvedValue({
        stdout: '',
        stderr: 'bind: Address already in use',
        exitCode: 1,
      });

      const result = await startServer();

      expect(result).toEqual({
        ok: false,
        message: 'bind: Address already in use',
      });
    });
  });

  describe('stopServer()', () => {
    it('returns true when no processes are running', async () => {
      // pgrep returns exit code 1 when no matches
      mockedExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 });

      const result = await stopServer();

      expect(mockedExec).toHaveBeenCalledWith('pgrep', ['mosh-server']);
      expect(result).toBe(true);
    });

    it('returns true when pkill succeeds', async () => {
      mockedExec
        .mockResolvedValueOnce({ stdout: '1234', stderr: '', exitCode: 0 }) // pgrep
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }); // pkill

      const result = await stopServer();

      expect(mockedExec).toHaveBeenCalledWith('pgrep', ['mosh-server']);
      expect(mockedExec).toHaveBeenCalledWith('pkill', ['mosh-server']);
      expect(result).toBe(true);
    });
  });

  describe('getConnectionCommand()', () => {
    it('builds the correct command string with default port', () => {
      const originalUser = process.env.USER;
      process.env.USER = 'testuser';

      const cmd = getConnectionCommand('100.64.0.1');

      expect(cmd).toBe('mosh testuser@100.64.0.1 --ssh="ssh -p 22"');

      process.env.USER = originalUser;
    });

    it('builds the correct command string with custom SSH port', () => {
      const originalUser = process.env.USER;
      process.env.USER = 'testuser';

      const cmd = getConnectionCommand('100.64.0.1', 2222);

      expect(cmd).toBe('mosh testuser@100.64.0.1 --ssh="ssh -p 2222"');

      process.env.USER = originalUser;
    });
  });
});
