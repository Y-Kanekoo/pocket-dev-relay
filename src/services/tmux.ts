import { exec, which } from '../utils/shell.js';
import type { TmuxStatus, TmuxSession, TmuxLayout } from '../types.js';

/**
 * Checks whether the `tmux` binary is available on the system.
 */
export async function isInstalled(): Promise<boolean> {
  return which('tmux');
}

/**
 * Extracts the version string from `tmux -V` output.
 * The output is typically "tmux 3.3a" or similar.
 */
async function getVersion(): Promise<string | null> {
  const result = await exec('tmux', ['-V']);

  if (result.exitCode !== 0 || result.stdout === '') {
    return null;
  }

  const match = result.stdout.match(/tmux\s+(.+)/i);
  return match ? match[1].trim() : result.stdout.split('\n')[0].trim() || null;
}

/**
 * Parses the output of `tmux list-sessions` into an array of TmuxSession
 * objects. Each line uses pipe-delimited fields produced by a custom format
 * string.
 */
function parseSessions(output: string): TmuxSession[] {
  if (!output) {
    return [];
  }

  const sessions: TmuxSession[] = [];

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parts = trimmed.split('|');
    if (parts.length < 5) {
      continue;
    }

    const [name, windows, attached, created, size] = parts;

    sessions.push({
      name,
      windows: parseInt(windows, 10) || 0,
      attached: attached === '1',
      created,
      size,
    });
  }

  return sessions;
}

/**
 * Lists all tmux sessions. Returns an empty array when the server is not
 * running or there are no sessions.
 */
export async function listSessions(): Promise<TmuxSession[]> {
  const format = '#{session_name}|#{session_windows}|#{session_attached}|#{session_created}|#{session_width}x#{session_height}';
  const result = await exec('tmux', ['list-sessions', '-F', format]);

  if (result.exitCode !== 0) {
    return [];
  }

  return parseSessions(result.stdout);
}

/**
 * Returns the full tmux status including installation, server state, version,
 * and the list of active sessions.
 */
export async function getStatus(): Promise<TmuxStatus> {
  const installed = await isInstalled();

  if (!installed) {
    return {
      installed: false,
      serverRunning: false,
      version: null,
      sessions: [],
    };
  }

  const [version, sessions] = await Promise.all([
    getVersion(),
    listSessions(),
  ]);

  // If we got sessions back the server is definitely running. Otherwise,
  // probe with `list-sessions` exit code -- a non-zero code means no server.
  const serverRunning = sessions.length > 0 || (await exec('tmux', ['list-sessions'])).exitCode === 0;

  return {
    installed: true,
    serverRunning,
    version,
    sessions,
  };
}

/**
 * Checks whether a session with the given name exists.
 */
export async function hasSession(name: string): Promise<boolean> {
  const result = await exec('tmux', ['has-session', '-t', name]);
  return result.exitCode === 0;
}

/**
 * Creates a new detached tmux session with the given name.
 * Returns true when the session is created successfully.
 */
export async function createSession(name: string): Promise<boolean> {
  const result = await exec('tmux', ['new-session', '-d', '-s', name]);
  return result.exitCode === 0;
}

/**
 * Kills the tmux session with the given name.
 * Returns true when the session is killed successfully.
 */
export async function killSession(name: string): Promise<boolean> {
  const result = await exec('tmux', ['kill-session', '-t', name]);
  return result.exitCode === 0;
}

/**
 * Returns the command string needed to attach to a tmux session. The actual
 * attach must happen interactively so this only builds the command.
 */
export function getAttachCommand(name: string): string {
  return `tmux attach-session -t ${name}`;
}

/**
 * Creates a full session from a TmuxLayout definition, including windows,
 * panes, and initial commands.
 *
 * The approach:
 * 1. Create a detached session (this auto-creates window 0).
 * 2. For each window in the layout, create a named window.
 * 3. For each pane in a window, split accordingly and send initial commands.
 * 4. Kill the auto-created first window (index 0) since the layout provides
 *    its own windows starting at index 1.
 */
export async function createSessionFromLayout(layout: TmuxLayout): Promise<boolean> {
  const session = layout.name;

  // Create the session in detached mode. This creates an initial window at
  // index 0 which we will remove after building the layout.
  const createResult = await exec('tmux', ['new-session', '-d', '-s', session]);
  if (createResult.exitCode !== 0) {
    return false;
  }

  for (let windowIndex = 0; windowIndex < layout.windows.length; windowIndex++) {
    const window = layout.windows[windowIndex];
    const tmuxWindowIndex = windowIndex + 1; // offset by 1 because window 0 is the auto-created one

    // Create a new named window inside the session.
    const newWindowResult = await exec('tmux', [
      'new-window', '-t', `${session}:${tmuxWindowIndex}`, '-n', window.name,
    ]);
    if (newWindowResult.exitCode !== 0) {
      return false;
    }

    // If the window has a top-level command and no panes, send it to the
    // first (and only) pane.
    if (window.command && (!window.panes || window.panes.length === 0)) {
      await exec('tmux', [
        'send-keys', '-t', `${session}:${tmuxWindowIndex}.0`, window.command, 'Enter',
      ]);
      continue;
    }

    // Create panes within this window.
    if (window.panes && window.panes.length > 0) {
      for (let paneIndex = 0; paneIndex < window.panes.length; paneIndex++) {
        const pane = window.panes[paneIndex];

        // The first pane (index 0) already exists from the new-window call,
        // so we only split for subsequent panes.
        if (paneIndex > 0) {
          const splitArgs: string[] = [
            'split-window',
            '-t', `${session}:${tmuxWindowIndex}`,
          ];

          if (pane.split === 'horizontal') {
            splitArgs.push('-h');
          } else {
            // Default to vertical split.
            splitArgs.push('-v');
          }

          if (pane.size) {
            splitArgs.push('-l', pane.size);
          }

          const splitResult = await exec('tmux', splitArgs);
          if (splitResult.exitCode !== 0) {
            return false;
          }
        }

        // Send the initial command if one is specified.
        if (pane.command) {
          await exec('tmux', [
            'send-keys', '-t', `${session}:${tmuxWindowIndex}.${paneIndex}`, pane.command, 'Enter',
          ]);
        }
      }
    }
  }

  // Remove the auto-created first window (index 0).
  await exec('tmux', ['kill-window', '-t', `${session}:0`]);

  return true;
}
