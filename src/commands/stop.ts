import { down } from '../services/tailscale.js';
import { stopServer } from '../services/mosh.js';
import { killSession } from '../services/tmux.js';
import { loadConfig } from '../utils/config.js';
import * as log from '../utils/logger.js';

/**
 * Entry point for the `stop` command. Tears down the tmux session, mosh-server,
 * and Tailscale connection in reverse order of how `start` brings them up.
 *
 * Each step is attempted independently so that a failure in one does not prevent
 * the others from being cleaned up.
 */
export async function stopCommand(): Promise<void> {
  const config = await loadConfig();
  let allOk = true;

  // 1. Kill the default tmux session.
  log.header('Tmux Session');

  const sessionName = config.tmux.defaultSession;
  log.info(`Killing session "${sessionName}"...`);

  const tmuxOk = await killSession(sessionName);

  if (tmuxOk) {
    log.success(`Session "${sessionName}" stopped.`);
  } else {
    log.warn(`Session "${sessionName}" was not running or could not be killed.`);
    allOk = false;
  }

  // 2. Stop all mosh-server processes.
  log.header('Mosh Server');
  log.info('Stopping mosh-server...');

  const moshOk = await stopServer();

  if (moshOk) {
    log.success('mosh-server stopped.');
  } else {
    log.warn('mosh-server could not be stopped (it may not be running).');
    allOk = false;
  }

  // 3. Disconnect Tailscale.
  log.header('Tailscale');
  log.info('Disconnecting Tailscale...');

  const tsOk = await down();

  if (tsOk) {
    log.success('Tailscale disconnected.');
  } else {
    log.warn('Tailscale could not be disconnected (it may not be running).');
    allOk = false;
  }

  // Summary
  console.log();

  if (allOk) {
    log.success('All services have been stopped.');
  } else {
    log.info('Some services were already stopped or could not be reached.');
  }
}
