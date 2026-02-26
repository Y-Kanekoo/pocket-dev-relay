import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Config } from '../types.js';

const CONFIG_DIR = join(homedir(), '.config', 'pocket-dev-relay');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: Config = {
  tmux: {
    defaultSession: 'dev',
    layouts: [
      {
        name: 'dev',
        description: 'Editor + Terminal + Log',
        windows: [
          { name: 'editor', command: '$EDITOR .' },
          { name: 'terminal' },
          { name: 'log', command: 'tail -f /var/log/syslog 2>/dev/null || echo "ready"' },
        ],
      },
      {
        name: 'split',
        description: 'Split pane layout',
        windows: [
          {
            name: 'main',
            panes: [
              { command: undefined },
              { split: 'horizontal' },
              { split: 'vertical' },
            ],
          },
        ],
      },
    ],
  },
  mosh: {
    ports: '60000:60010',
    server: 'mosh-server',
  },
  tailscale: {
    exitNode: false,
    acceptRoutes: true,
  },
};

export async function loadConfig(): Promise<Config> {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Config>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export { DEFAULT_CONFIG };
