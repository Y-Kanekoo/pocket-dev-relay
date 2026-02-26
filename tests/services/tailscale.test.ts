import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/shell.js', () => ({
  exec: vi.fn(),
  which: vi.fn(),
}));

import { getStatus, up, down, getIp } from '../../src/services/tailscale.js';
import { exec, which } from '../../src/utils/shell.js';

const mockedExec = vi.mocked(exec);
const mockedWhich = vi.mocked(which);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tailscale', () => {
  describe('getStatus()', () => {
    it('returns not-installed status when tailscale is not found', async () => {
      mockedWhich.mockResolvedValue(false);

      const status = await getStatus();

      expect(mockedWhich).toHaveBeenCalledWith('tailscale');
      expect(status).toEqual({
        installed: false,
        running: false,
        ip: null,
        hostname: null,
        tailnet: null,
        version: null,
        exitNode: false,
      });
    });

    it('returns offline status when tailscale is installed but not running', async () => {
      mockedWhich.mockResolvedValue(true);
      mockedExec.mockResolvedValue({ stdout: '', stderr: 'not running', exitCode: 1 });

      const status = await getStatus();

      expect(mockedWhich).toHaveBeenCalledWith('tailscale');
      expect(mockedExec).toHaveBeenCalledWith('tailscale', ['status', '--json']);
      expect(status).toEqual({
        installed: true,
        running: false,
        ip: null,
        hostname: null,
        tailnet: null,
        version: null,
        exitNode: false,
      });
    });

    it('returns full status when tailscale is running with valid JSON', async () => {
      mockedWhich.mockResolvedValue(true);

      const jsonPayload = JSON.stringify({
        Version: '1.62.0',
        Self: {
          TailscaleIPs: ['100.64.0.1', 'fd7a:115c:a1e0::1'],
          HostName: 'mypc',
          ExitNode: false,
        },
        MagicDNSSuffix: 'tail12345.ts.net',
      });

      mockedExec.mockResolvedValue({ stdout: jsonPayload, stderr: '', exitCode: 0 });

      const status = await getStatus();

      expect(status).toEqual({
        installed: true,
        running: true,
        ip: '100.64.0.1',
        hostname: 'mypc',
        tailnet: 'tail12345',
        version: '1.62.0',
        exitNode: false,
      });
    });
  });

  describe('up()', () => {
    it('returns true on success', async () => {
      mockedExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const result = await up();

      expect(mockedExec).toHaveBeenCalledWith('tailscale', ['up']);
      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      mockedExec.mockResolvedValue({ stdout: '', stderr: 'error', exitCode: 1 });

      const result = await up();

      expect(mockedExec).toHaveBeenCalledWith('tailscale', ['up']);
      expect(result).toBe(false);
    });
  });

  describe('down()', () => {
    it('returns true on success', async () => {
      mockedExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const result = await down();

      expect(mockedExec).toHaveBeenCalledWith('tailscale', ['down']);
      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      mockedExec.mockResolvedValue({ stdout: '', stderr: 'error', exitCode: 1 });

      const result = await down();

      expect(mockedExec).toHaveBeenCalledWith('tailscale', ['down']);
      expect(result).toBe(false);
    });
  });

  describe('getIp()', () => {
    it('returns an IP address when available', async () => {
      mockedExec.mockResolvedValue({ stdout: '100.64.0.1', stderr: '', exitCode: 0 });

      const ip = await getIp();

      expect(mockedExec).toHaveBeenCalledWith('tailscale', ['ip', '-4']);
      expect(ip).toBe('100.64.0.1');
    });

    it('returns null when tailscale is not connected', async () => {
      mockedExec.mockResolvedValue({ stdout: '', stderr: 'not running', exitCode: 1 });

      const ip = await getIp();

      expect(ip).toBeNull();
    });
  });
});
