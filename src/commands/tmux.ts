import * as tmux from '../services/tmux.js';
import * as log from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';

/**
 * Prints a formatted overview of the current tmux status including server
 * state, version, and a summary of active sessions.
 */
async function showStatus(): Promise<void> {
  const status = await tmux.getStatus();

  log.header('Tmux Status');

  log.label('Installed', `${log.statusIcon(status.installed)} ${status.installed ? 'yes' : 'no'}`);

  if (!status.installed) {
    log.warn('tmux is not installed. Install it with: apt install tmux');
    return;
  }

  log.label('Version', status.version ?? 'unknown');
  log.label(
    'Server',
    `${log.statusIcon(status.serverRunning)} ${status.serverRunning ? 'running' : 'stopped'}`,
  );

  if (status.sessions.length > 0) {
    log.label('Sessions', String(status.sessions.length));
    console.log();
    for (const session of status.sessions) {
      const attachedTag = session.attached ? ' (attached)' : '';
      log.info(`  ${session.name} - ${session.windows} window(s), ${session.size}${attachedTag}`);
    }
  } else {
    log.label('Sessions', 'none');
  }
}

/**
 * Lists all active tmux sessions in a compact format.
 */
async function listSessions(): Promise<void> {
  const installed = await tmux.isInstalled();

  if (!installed) {
    log.error('tmux is not installed. Install it with: apt install tmux');
    return;
  }

  const sessions = await tmux.listSessions();

  log.header('Tmux Sessions');

  if (sessions.length === 0) {
    log.info('No active sessions.');
    return;
  }

  for (const session of sessions) {
    const attachedTag = session.attached ? ' (attached)' : '';
    log.info(`${session.name} - ${session.windows} window(s), ${session.size}${attachedTag}`);
  }
}

/**
 * Creates a new tmux session. Falls back to the default session name from
 * config when none is provided.
 */
async function newSession(name?: string): Promise<void> {
  const installed = await tmux.isInstalled();

  if (!installed) {
    log.error('tmux is not installed. Install it with: apt install tmux');
    return;
  }

  const config = await loadConfig();
  const sessionName = name ?? config.tmux.defaultSession;

  const exists = await tmux.hasSession(sessionName);
  if (exists) {
    log.warn(`Session "${sessionName}" already exists.`);
    log.info(`Attach with: ${tmux.getAttachCommand(sessionName)}`);
    return;
  }

  log.info(`Creating session "${sessionName}"...`);

  const ok = await tmux.createSession(sessionName);

  if (ok) {
    log.success(`Session "${sessionName}" created.`);
    log.info(`Attach with: ${tmux.getAttachCommand(sessionName)}`);
  } else {
    log.error(`Failed to create session "${sessionName}".`);
  }
}

/**
 * Creates a session from a predefined layout. When no layout name is provided
 * the available layouts are listed instead.
 */
async function applyLayout(name?: string): Promise<void> {
  const installed = await tmux.isInstalled();

  if (!installed) {
    log.error('tmux is not installed. Install it with: apt install tmux');
    return;
  }

  const config = await loadConfig();
  const layouts = config.tmux.layouts;

  if (!name) {
    log.header('Available Layouts');

    if (layouts.length === 0) {
      log.info('No layouts configured.');
      return;
    }

    for (const layout of layouts) {
      log.info(`${layout.name} - ${layout.description} (${layout.windows.length} window(s))`);
    }

    log.info('');
    log.info('Usage: pocket-dev-relay tmux layout <name>');
    return;
  }

  const layout = layouts.find((l) => l.name === name);

  if (!layout) {
    log.error(`Layout "${name}" not found.`);
    log.info('Available layouts: ' + layouts.map((l) => l.name).join(', '));
    return;
  }

  const exists = await tmux.hasSession(layout.name);
  if (exists) {
    log.warn(`Session "${layout.name}" already exists.`);
    log.info(`Attach with: ${tmux.getAttachCommand(layout.name)}`);
    return;
  }

  log.info(`Creating session "${layout.name}" from layout (${layout.description})...`);

  const ok = await tmux.createSessionFromLayout(layout);

  if (ok) {
    log.success(`Session "${layout.name}" created from layout.`);
    log.info(`Attach with: ${tmux.getAttachCommand(layout.name)}`);
  } else {
    log.error(`Failed to create session from layout "${layout.name}".`);
  }
}

/**
 * Kills a tmux session by name. When no name is provided, warns the user.
 */
async function killSession(name?: string): Promise<void> {
  const installed = await tmux.isInstalled();

  if (!installed) {
    log.error('tmux is not installed. Install it with: apt install tmux');
    return;
  }

  if (!name) {
    log.error('Please specify a session name to kill.');
    log.info('Usage: pocket-dev-relay tmux kill <name>');
    return;
  }

  const exists = await tmux.hasSession(name);
  if (!exists) {
    log.error(`Session "${name}" does not exist.`);
    return;
  }

  log.info(`Killing session "${name}"...`);

  const ok = await tmux.killSession(name);

  if (ok) {
    log.success(`Session "${name}" has been killed.`);
  } else {
    log.error(`Failed to kill session "${name}".`);
  }
}

/**
 * Prints the command to attach to a tmux session. Since attaching requires an
 * interactive terminal, we output the command for the user to run manually.
 */
async function attachSession(name?: string): Promise<void> {
  const installed = await tmux.isInstalled();

  if (!installed) {
    log.error('tmux is not installed. Install it with: apt install tmux');
    return;
  }

  const config = await loadConfig();
  const sessionName = name ?? config.tmux.defaultSession;

  const exists = await tmux.hasSession(sessionName);
  if (!exists) {
    log.error(`Session "${sessionName}" does not exist.`);

    const sessions = await tmux.listSessions();
    if (sessions.length > 0) {
      log.info('Available sessions: ' + sessions.map((s) => s.name).join(', '));
    } else {
      log.info('No active sessions. Create one with: pocket-dev-relay tmux new');
    }
    return;
  }

  log.header('Attach to Session');
  log.info('Run this command to attach:');
  console.log();
  log.success(tmux.getAttachCommand(sessionName));
}

/**
 * Entry point for the `tmux` CLI sub-command.
 *
 * @param action - One of "status" (default), "list", "new", "layout", "kill",
 *   or "attach".
 * @param extra  - An optional extra argument; used as the session/layout name.
 */
export async function tmuxCommand(action?: string, extra?: string): Promise<void> {
  const resolved = action ?? 'status';

  switch (resolved) {
    case 'status':
      await showStatus();
      break;
    case 'list':
      await listSessions();
      break;
    case 'new':
      await newSession(extra);
      break;
    case 'layout':
      await applyLayout(extra);
      break;
    case 'kill':
      await killSession(extra);
      break;
    case 'attach':
      await attachSession(extra);
      break;
    default:
      log.error(`Unknown action: ${resolved}`);
      log.info('Available actions: status, list, new [name], layout [name], kill <name>, attach [name]');
  }
}
