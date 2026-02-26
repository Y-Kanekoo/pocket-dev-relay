import { exec, which } from '../utils/shell.js';
import type { MoshStatus } from '../types.js';

/**
 * Checks whether both `mosh` and `mosh-server` binaries are available on the system.
 */
export async function isInstalled(): Promise<boolean> {
  const [hasMosh, hasServer] = await Promise.all([
    which('mosh'),
    which('mosh-server'),
  ]);
  return hasMosh && hasServer;
}

/**
 * Extracts a version string from the output of `mosh-server --version` or
 * `mosh --version`. Both commands print the version on stderr in the form
 * "mosh X.Y.Z ...". We fall back to stdout in case the behaviour changes
 * between distributions.
 */
async function getVersion(): Promise<string | null> {
  const result = await exec('mosh-server', ['--version']);
  const output = result.stderr || result.stdout;

  if (!output) {
    return null;
  }

  const match = output.match(/mosh\s+(\d+\.\d+(?:\.\d+)?)/i);
  return match ? match[1] : output.split('\n')[0].trim() || null;
}

/**
 * Returns the PIDs of any running mosh-server processes, or an empty array
 * when none are found.
 */
async function getServerPids(): Promise<number[]> {
  const result = await exec('pgrep', ['mosh-server']);

  if (result.exitCode !== 0 || result.stdout === '') {
    return [];
  }

  return result.stdout
    .split('\n')
    .map((line) => parseInt(line.trim(), 10))
    .filter((pid) => !Number.isNaN(pid));
}

/**
 * Discovers the UDP ports currently held open by mosh-server processes by
 * inspecting `ss -ulnp`. Falls back to the common 60000-61000 range heuristic
 * if `ss` is unavailable.
 */
async function getOpenPorts(): Promise<number[]> {
  const result = await exec('ss', ['-ulnp']);

  if (result.exitCode !== 0 || result.stdout === '') {
    return [];
  }

  const ports: number[] = [];
  const lines = result.stdout.split('\n');

  for (const line of lines) {
    if (!line.includes('mosh-server')) {
      continue;
    }

    // ss output contains a local address column in the form *:PORT or 0.0.0.0:PORT
    const portMatch = line.match(/:(\d+)\s/);
    if (portMatch) {
      const port = parseInt(portMatch[1], 10);
      if (!Number.isNaN(port)) {
        ports.push(port);
      }
    }
  }

  return [...new Set(ports)].sort((a, b) => a - b);
}

/**
 * Returns the full Mosh status including installation, running state, version,
 * and the list of open server ports.
 */
export async function getStatus(): Promise<MoshStatus> {
  const installed = await isInstalled();

  if (!installed) {
    return {
      installed: false,
      serverRunning: false,
      version: null,
      ports: [],
    };
  }

  const [pids, version, ports] = await Promise.all([
    getServerPids(),
    getVersion(),
    getOpenPorts(),
  ]);

  return {
    installed: true,
    serverRunning: pids.length > 0,
    version,
    ports,
  };
}

/**
 * Starts `mosh-server` with an optional port range.
 *
 * @param portRange - A colon-separated range such as "60000:60010". When
 *   omitted mosh-server uses its built-in default range.
 * @returns The raw stdout/stderr from `mosh-server` which typically contains
 *   the MOSH CONNECT line, or an error message if the start failed.
 */
export async function startServer(portRange?: string): Promise<{ ok: boolean; message: string }> {
  const args: string[] = ['new', '-s'];

  if (portRange) {
    const [start, end] = portRange.split(':');
    if (start && end) {
      args.push('-p', `${start}:${end}`);
    }
  }

  const result = await exec('mosh-server', args);
  const output = result.stdout || result.stderr;

  if (result.exitCode !== 0) {
    return {
      ok: false,
      message: output || 'mosh-server exited with a non-zero status.',
    };
  }

  return {
    ok: true,
    message: output,
  };
}

/**
 * Stops all running mosh-server processes by sending SIGTERM via `pkill`.
 * Returns true when at least one process was signalled or none were running.
 */
export async function stopServer(): Promise<boolean> {
  const pids = await getServerPids();

  if (pids.length === 0) {
    return true;
  }

  const result = await exec('pkill', ['mosh-server']);
  return result.exitCode === 0;
}

/**
 * Builds the mosh connection command a remote client would use to connect to
 * this machine.
 *
 * @param ip - The IP address (typically a Tailscale IP) of this machine.
 * @param sshPort - The SSH port to tunnel through (defaults to 22).
 * @returns A ready-to-paste mosh connection string.
 */
export function getConnectionCommand(ip: string, sshPort: number = 22): string {
  const user = process.env.USER ?? process.env.LOGNAME ?? 'user';
  return `mosh ${user}@${ip} --ssh="ssh -p ${sshPort}"`;
}
