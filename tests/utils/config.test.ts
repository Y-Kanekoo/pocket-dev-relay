import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { loadConfig, getConfigPath, DEFAULT_CONFIG } from '../../src/utils/config.js';
import { readFile } from 'node:fs/promises';

const mockedReadFile = vi.mocked(readFile);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('config', () => {
  describe('loadConfig()', () => {
    it('returns default config when no file exists', async () => {
      mockedReadFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const config = await loadConfig();

      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('merges file config with defaults', async () => {
      const fileConfig = {
        mosh: {
          ports: '61000:61010',
          server: 'mosh-server',
        },
      };

      mockedReadFile.mockResolvedValue(JSON.stringify(fileConfig));

      const config = await loadConfig();

      expect(config.mosh.ports).toBe('61000:61010');
      // Default values for other keys should still be present
      expect(config.tmux).toEqual(DEFAULT_CONFIG.tmux);
      expect(config.tailscale).toEqual(DEFAULT_CONFIG.tailscale);
    });
  });

  describe('getConfigPath()', () => {
    it('returns expected path under home directory', () => {
      const expected = join(homedir(), '.config', 'pocket-dev-relay', 'config.json');
      const result = getConfigPath();

      expect(result).toBe(expected);
    });
  });
});
