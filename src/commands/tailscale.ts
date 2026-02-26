import * as tailscale from '../services/tailscale.js';
import * as log from '../utils/logger.js';

/**
 * Prints a formatted overview of the current Tailscale status.
 */
async function showStatus(): Promise<void> {
  const status = await tailscale.getStatus();

  log.header('Tailscale Status');

  log.label('Installed', `${log.statusIcon(status.installed)} ${status.installed ? 'yes' : 'no'}`);

  if (!status.installed) {
    log.warn('Tailscale is not installed. Install it from https://tailscale.com/download');
    return;
  }

  log.label('Running', `${log.statusIcon(status.running)} ${status.running ? 'yes' : 'no'}`);

  if (!status.running) {
    log.warn('Tailscale is not running. Start it with: pocket-dev-relay tailscale up');
    return;
  }

  log.label('IP', status.ip ?? 'unknown');
  log.label('Hostname', status.hostname ?? 'unknown');
  log.label('Tailnet', status.tailnet ?? 'unknown');
  log.label('Version', status.version ?? 'unknown');
  log.label('Exit Node', status.exitNode ? 'active' : 'inactive');
}

/**
 * Attempts to bring Tailscale up and reports the result.
 */
async function bringUp(): Promise<void> {
  log.info('Starting Tailscale...');

  const ok = await tailscale.up();

  if (ok) {
    log.success('Tailscale is connected.');
    const ip = await tailscale.getIp();
    if (ip) {
      log.label('IP', ip);
    }
  } else {
    log.error('Failed to start Tailscale. Is the daemon running?');
  }
}

/**
 * Attempts to bring Tailscale down and reports the result.
 */
async function bringDown(): Promise<void> {
  log.info('Stopping Tailscale...');

  const ok = await tailscale.down();

  if (ok) {
    log.success('Tailscale has been disconnected.');
  } else {
    log.error('Failed to stop Tailscale.');
  }
}

/**
 * Prints just the Tailscale IPv4 address.
 */
async function showIp(): Promise<void> {
  const ip = await tailscale.getIp();

  if (ip) {
    log.success(ip);
  } else {
    log.error('Could not retrieve Tailscale IP. Is Tailscale running?');
  }
}

/**
 * Entry point for the `tailscale` CLI sub-command.
 *
 * @param action - One of "status" (default), "up", "down", or "ip".
 */
export async function tailscaleCommand(action?: string): Promise<void> {
  const resolved = action ?? 'status';

  switch (resolved) {
    case 'status':
      await showStatus();
      break;
    case 'up':
      await bringUp();
      break;
    case 'down':
      await bringDown();
      break;
    case 'ip':
      await showIp();
      break;
    default:
      log.error(`Unknown action: ${resolved}`);
      log.info('Available actions: status, up, down, ip');
  }
}
