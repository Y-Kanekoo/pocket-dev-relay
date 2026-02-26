#!/usr/bin/env node

import { statusCommand } from './commands/status.js';
import { setupCommand } from './commands/setup.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { connectCommand } from './commands/connect.js';
import { tailscaleCommand } from './commands/tailscale.js';
import { moshCommand } from './commands/mosh.js';
import { tmuxCommand } from './commands/tmux.js';
import { configCommand } from './commands/config.js';
import * as log from './utils/logger.js';

const VERSION = '1.0.0';

/**
 * Prints the application banner with name and version.
 */
function showBanner(): void {
  console.log();
  console.log('  \x1b[1m\x1b[36mpocket-dev-relay\x1b[0m  \x1b[90mv' + VERSION + '\x1b[0m');
  console.log('  \x1b[90mTailscale + mosh + tmux remote dev manager\x1b[0m');
  console.log();
}

/**
 * Prints the help text listing all available commands.
 */
function showHelp(): void {
  showBanner();

  console.log('  \x1b[1mUsage:\x1b[0m');
  console.log('    pdr <command> [options]');
  console.log();
  console.log('  \x1b[1mCommands:\x1b[0m');
  console.log('    status              Show status of all components (default)');
  console.log('    setup               Run the setup wizard');
  console.log('    start               Start all services');
  console.log('    stop                Stop all services');
  console.log('    connect             Show connection info and QR code');
  console.log('    tailscale [action]  Tailscale sub-commands (status, up, down, ip)');
  console.log('    mosh [action]       Mosh sub-commands (status, start, stop, command)');
  console.log('    tmux [action]       Tmux sub-commands (status, list, new, layout, kill, attach)');
  console.log('    config              Show config file path and current config');
  console.log('    help                Show this help text');
  console.log('    version             Show version');
  console.log();
  console.log('  \x1b[1mExamples:\x1b[0m');
  console.log('    pdr start           Start tailscale, mosh-server, and tmux session');
  console.log('    pdr connect         Show connection command and QR code');
  console.log('    pdr tailscale up    Bring Tailscale online');
  console.log('    pdr tmux layout dev Create tmux session from "dev" layout');
  console.log();
}

/**
 * Prints the application version.
 */
function showVersion(): void {
  console.log(`pocket-dev-relay v${VERSION}`);
}

/**
 * Parses process.argv and dispatches to the appropriate command handler.
 */
async function main(): Promise<void> {
  // argv[0] = node, argv[1] = script path, argv[2+] = user arguments
  const args = process.argv.slice(2);
  const command = args[0] ?? 'status';
  const action = args[1];
  const extra = args[2];

  try {
    switch (command) {
      case 'status':
        showBanner();
        await statusCommand();
        break;

      case 'setup':
        showBanner();
        await setupCommand();
        break;

      case 'start':
        showBanner();
        await startCommand();
        break;

      case 'stop':
        showBanner();
        await stopCommand();
        break;

      case 'connect':
        showBanner();
        await connectCommand();
        break;

      case 'tailscale':
        await tailscaleCommand(action);
        break;

      case 'mosh':
        await moshCommand(action, extra);
        break;

      case 'tmux':
        await tmuxCommand(action, extra);
        break;

      case 'config':
        await configCommand();
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      case 'version':
      case '--version':
      case '-v':
        showVersion();
        break;

      default:
        log.error(`Unknown command: ${command}`);
        showHelp();
        process.exitCode = 1;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Fatal error: ${message}`);
    process.exitCode = 1;
  }
}

main();
