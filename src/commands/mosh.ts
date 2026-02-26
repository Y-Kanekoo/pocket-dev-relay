import * as mosh from '../services/mosh.js';
import * as tailscale from '../services/tailscale.js';
import * as log from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';

/**
 * Prints a formatted overview of the current mosh-server status.
 */
async function showStatus(): Promise<void> {
  const status = await mosh.getStatus();

  log.header('Mosh Status');

  log.label('Installed', `${log.statusIcon(status.installed)} ${status.installed ? 'yes' : 'no'}`);

  if (!status.installed) {
    log.warn('Mosh is not installed. Install it with: apt install mosh');
    return;
  }

  log.label('Version', status.version ?? 'unknown');
  log.label(
    'Server',
    `${log.statusIcon(status.serverRunning)} ${status.serverRunning ? 'running' : 'stopped'}`,
  );

  if (status.ports.length > 0) {
    log.label('Ports', status.ports.join(', '));
  }
}

/**
 * Starts the mosh-server using the port range defined in the user's config.
 */
async function startMoshServer(): Promise<void> {
  const installed = await mosh.isInstalled();

  if (!installed) {
    log.error('Mosh is not installed. Install it with: apt install mosh');
    return;
  }

  const config = await loadConfig();
  const portRange = config.mosh.ports;

  log.info(`Starting mosh-server (ports ${portRange})...`);

  const result = await mosh.startServer(portRange);

  if (result.ok) {
    log.success('mosh-server is running.');
    if (result.message) {
      log.info(result.message);
    }
  } else {
    log.error('Failed to start mosh-server.');
    if (result.message) {
      log.error(result.message);
    }
  }
}

/**
 * Stops all running mosh-server processes.
 */
async function stopMoshServer(): Promise<void> {
  const status = await mosh.getStatus();

  if (!status.serverRunning) {
    log.info('No mosh-server processes are running.');
    return;
  }

  log.info('Stopping mosh-server...');

  const ok = await mosh.stopServer();

  if (ok) {
    log.success('All mosh-server processes have been stopped.');
  } else {
    log.error('Failed to stop mosh-server processes.');
  }
}

/**
 * Displays the mosh connection command a client would use to reach this machine.
 * When no IP is provided the function attempts to resolve the Tailscale IPv4
 * address automatically.
 */
async function showConnectionCommand(ip?: string): Promise<void> {
  let resolvedIp = ip;

  if (!resolvedIp) {
    log.info('No IP provided, trying to resolve Tailscale IP...');
    resolvedIp = (await tailscale.getIp()) ?? undefined;

    if (!resolvedIp) {
      log.error(
        'Could not determine Tailscale IP. Provide an IP manually: pocket-dev-relay mosh command <ip>',
      );
      return;
    }
  }

  const command = mosh.getConnectionCommand(resolvedIp);

  log.header('Mosh Connection Command');
  log.info('Run this on the client device to connect:');
  console.log();
  log.success(command);
}

/**
 * Entry point for the `mosh` CLI sub-command.
 *
 * @param action - One of "status" (default), "start", "stop", or "command".
 * @param extra  - An optional extra argument; used as the IP for "command".
 */
export async function moshCommand(action?: string, extra?: string): Promise<void> {
  const resolved = action ?? 'status';

  switch (resolved) {
    case 'status':
      await showStatus();
      break;
    case 'start':
      await startMoshServer();
      break;
    case 'stop':
      await stopMoshServer();
      break;
    case 'command':
      await showConnectionCommand(extra);
      break;
    default:
      log.error(`Unknown action: ${resolved}`);
      log.info('Available actions: status, start, stop, command [ip]');
  }
}
