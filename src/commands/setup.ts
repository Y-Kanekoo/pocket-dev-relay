import { getStatus as getTailscaleStatus } from '../services/tailscale.js';
import { getStatus as getMoshStatus } from '../services/mosh.js';
import { getStatus as getTmuxStatus } from '../services/tmux.js';
import { loadConfig, saveConfig, getConfigPath } from '../utils/config.js';
import * as log from '../utils/logger.js';

/**
 * Returns platform-specific install instructions for each tool.
 */
function getInstallInstructions(tool: 'tailscale' | 'mosh' | 'tmux'): string {
  const platform = process.platform;

  switch (tool) {
    case 'tailscale':
      if (platform === 'darwin') {
        return 'brew install tailscale';
      }
      if (platform === 'linux') {
        return 'curl -fsSL https://tailscale.com/install.sh | sh';
      }
      return 'See https://tailscale.com/download for install instructions.';

    case 'mosh':
      if (platform === 'darwin') {
        return 'brew install mosh';
      }
      if (platform === 'linux') {
        return 'sudo apt install mosh';
      }
      return 'See https://mosh.org/#getting for install instructions.';

    case 'tmux':
      if (platform === 'darwin') {
        return 'brew install tmux';
      }
      if (platform === 'linux') {
        return 'sudo apt install tmux';
      }
      return 'See https://github.com/tmux/tmux/wiki/Installing for install instructions.';
  }
}

/**
 * Runs the initial setup wizard. Checks whether each prerequisite is
 * installed, displays platform-appropriate install instructions for anything
 * that is missing, ensures a default configuration file exists, and then
 * prints the recommended next steps.
 */
export async function setupCommand(): Promise<void> {
  log.header('Setup Wizard');
  log.info('Checking prerequisites...');
  console.log();

  const [tailscale, mosh, tmux] = await Promise.all([
    getTailscaleStatus(),
    getMoshStatus(),
    getTmuxStatus(),
  ]);

  let allInstalled = true;

  // ── Tailscale ──────────────────────────────────────────────────────────
  log.header('Tailscale');

  if (tailscale.installed) {
    log.success('Tailscale is installed.');
    if (tailscale.version) {
      log.label('Version', tailscale.version);
    }
    if (tailscale.running) {
      log.success(`Connected as ${tailscale.hostname ?? 'unknown'} (${tailscale.ip ?? 'no IP'})`);
    } else {
      log.warn('Tailscale is installed but not running. Start it with: pdr tailscale up');
    }
  } else {
    allInstalled = false;
    log.error('Tailscale is not installed.');
    log.info(`Install with: ${getInstallInstructions('tailscale')}`);
  }

  // ── Mosh ───────────────────────────────────────────────────────────────
  log.header('Mosh');

  if (mosh.installed) {
    log.success('Mosh is installed.');
    if (mosh.version) {
      log.label('Version', mosh.version);
    }
    if (mosh.serverRunning) {
      log.success(`mosh-server is running on port(s): ${mosh.ports.join(', ') || 'unknown'}`);
    } else {
      log.info('mosh-server is not currently running. It will be started with: pdr start');
    }
  } else {
    allInstalled = false;
    log.error('Mosh is not installed.');
    log.info(`Install with: ${getInstallInstructions('mosh')}`);
  }

  // ── Tmux ───────────────────────────────────────────────────────────────
  log.header('Tmux');

  if (tmux.installed) {
    log.success('Tmux is installed.');
    if (tmux.version) {
      log.label('Version', tmux.version);
    }
    if (tmux.sessions.length > 0) {
      log.info(`${tmux.sessions.length} active session(s) found.`);
    }
  } else {
    allInstalled = false;
    log.error('Tmux is not installed.');
    log.info(`Install with: ${getInstallInstructions('tmux')}`);
  }

  // ── Configuration ──────────────────────────────────────────────────────
  log.header('Configuration');

  const configPath = getConfigPath();
  const config = await loadConfig();

  // Persist the default config so the user has a file to edit even if one did
  // not exist before.
  await saveConfig(config);
  log.success(`Config file written to: ${configPath}`);

  // ── Next steps ─────────────────────────────────────────────────────────
  log.header('Next Steps');

  if (!allInstalled) {
    log.warn('Some prerequisites are missing. Install them using the commands above, then re-run:');
    log.info('  pdr setup');
  } else {
    log.success('All prerequisites are installed!');
    console.log();
    log.info('Start all services:');
    log.info('  pdr start');
    console.log();
    log.info('Show connection info and QR code:');
    log.info('  pdr connect');
    console.log();
    log.info('Check service health at any time:');
    log.info('  pdr status');
    console.log();
    log.info('Customise your setup:');
    log.info(`  Edit ${configPath}`);
  }

  console.log();
}
