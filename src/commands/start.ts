import { getStatus, up } from '../services/tailscale.js';
import { startServer, getStatus as getMoshStatus } from '../services/mosh.js';
import {
  createSession,
  createSessionFromLayout,
  hasSession,
  getStatus as getTmuxStatus,
} from '../services/tmux.js';
import { loadConfig } from '../utils/config.js';
import * as log from '../utils/logger.js';

/**
 * Ensures Tailscale is connected. If already running, reports the current state.
 * Otherwise attempts to bring it up.
 *
 * @returns The Tailscale IPv4 address when connected, or null on failure.
 */
async function ensureTailscale(): Promise<string | null> {
  log.header('Tailscale');

  const status = await getStatus();

  if (!status.installed) {
    log.error('Tailscale is not installed. Install it from https://tailscale.com/download');
    return null;
  }

  if (status.running && status.ip) {
    log.success(`Tailscale is already connected (${status.ip})`);
    return status.ip;
  }

  log.info('Starting Tailscale...');
  const ok = await up();

  if (!ok) {
    log.error('Failed to start Tailscale. Is the daemon running?');
    return null;
  }

  // Re-fetch status to get the IP address after connecting.
  const updated = await getStatus();

  if (updated.ip) {
    log.success(`Tailscale connected (${updated.ip})`);
    return updated.ip;
  }

  log.warn('Tailscale is up but could not determine IP address.');
  return null;
}

/**
 * Ensures mosh-server is running. Starts it with the configured port range if
 * no instances are currently active.
 *
 * @returns true when the server is confirmed running, false otherwise.
 */
async function ensureMosh(portRange: string): Promise<boolean> {
  log.header('Mosh Server');

  const status = await getMoshStatus();

  if (!status.installed) {
    log.error('Mosh is not installed. Install it with: apt install mosh');
    return false;
  }

  if (status.serverRunning) {
    const portInfo = status.ports.length > 0 ? ` on port(s) ${status.ports.join(', ')}` : '';
    log.success(`mosh-server is already running${portInfo}`);
    return true;
  }

  log.info(`Starting mosh-server (ports ${portRange})...`);
  const result = await startServer(portRange);

  if (result.ok) {
    log.success('mosh-server started.');
    return true;
  }

  log.error('Failed to start mosh-server.');
  if (result.message) {
    log.error(result.message);
  }
  return false;
}

/**
 * Ensures a tmux session exists for the default session name. When a matching
 * layout is defined in the config, the session is created from that layout.
 * Otherwise a plain session is created.
 *
 * @returns true when a session is available (existing or newly created).
 */
async function ensureTmux(config: Awaited<ReturnType<typeof loadConfig>>): Promise<boolean> {
  log.header('Tmux Session');

  const status = await getTmuxStatus();

  if (!status.installed) {
    log.error('tmux is not installed. Install it with: apt install tmux');
    return false;
  }

  const sessionName = config.tmux.defaultSession;

  // If the session already exists, report it and move on.
  if (await hasSession(sessionName)) {
    log.success(`Session "${sessionName}" already exists.`);
    return true;
  }

  // Look for a layout whose name matches the default session name.
  const layout = config.tmux.layouts.find((l) => l.name === sessionName);

  if (layout) {
    log.info(`Creating session "${sessionName}" from layout (${layout.description})...`);
    const ok = await createSessionFromLayout(layout);

    if (ok) {
      log.success(`Session "${sessionName}" created from layout.`);
      return true;
    }

    log.error(`Failed to create session from layout "${layout.name}".`);
    return false;
  }

  // No matching layout -- create a plain session.
  log.info(`Creating session "${sessionName}"...`);
  const ok = await createSession(sessionName);

  if (ok) {
    log.success(`Session "${sessionName}" created.`);
    return true;
  }

  log.error(`Failed to create session "${sessionName}".`);
  return false;
}

/**
 * Displays a summary of connection information after all services have been
 * started. This gives the user everything they need to connect from a client.
 */
function showConnectionSummary(ip: string, sessionName: string): void {
  log.header('Connection Info');

  const user = process.env.USER ?? process.env.LOGNAME ?? 'user';
  const moshCmd = `mosh ${user}@${ip}`;
  const tmuxCmd = `tmux attach -t ${sessionName}`;
  const fullCmd = `mosh ${user}@${ip} -- tmux attach -t ${sessionName}`;

  log.label('Tailscale IP', ip);
  log.label('Mosh', moshCmd);
  log.label('Tmux', tmuxCmd);
  console.log();
  log.info('Full connection command:');
  log.success(fullCmd);
}

/**
 * Entry point for the `start` command. Brings up Tailscale, mosh-server, and
 * a tmux session in sequence, then displays connection information.
 */
export async function startCommand(): Promise<void> {
  const config = await loadConfig();

  // 1. Tailscale
  const ip = await ensureTailscale();

  // 2. Mosh server
  const moshOk = await ensureMosh(config.mosh.ports);

  // 3. Tmux session
  const tmuxOk = await ensureTmux(config);

  // Summary
  console.log();

  if (ip && moshOk && tmuxOk) {
    showConnectionSummary(ip, config.tmux.defaultSession);
  } else {
    log.header('Summary');

    if (!ip) {
      log.warn('Tailscale is not connected -- connection info unavailable.');
    }
    if (!moshOk) {
      log.warn('mosh-server failed to start.');
    }
    if (!tmuxOk) {
      log.warn('tmux session could not be created.');
    }

    log.info('Resolve the issues above and run `pdr start` again.');
  }
}
