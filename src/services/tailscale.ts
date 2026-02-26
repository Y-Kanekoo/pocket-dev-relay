import { exec, which } from '../utils/shell.js';
import type { TailscaleStatus } from '../types.js';

/**
 * Parses the JSON output of `tailscale status --json` into a TailscaleStatus object.
 * Returns a partial status with running=true on parse failure so callers still
 * know Tailscale is up even if the response shape changes between versions.
 */
function parseStatusJson(raw: string): Partial<TailscaleStatus> {
  try {
    const json = JSON.parse(raw);
    const self = json.Self ?? {};
    const tailnet = json.MagicDNSSuffix
      ? json.MagicDNSSuffix.replace(/\.ts\.net$/, '')
      : json.CurrentTailnet?.Name ?? null;

    const selfIps: string[] = self.TailscaleIPs ?? [];
    const ipv4 = selfIps.find((ip: string) => ip.includes('.')) ?? null;

    return {
      running: true,
      ip: ipv4,
      hostname: self.HostName ?? null,
      tailnet,
      version: json.Version ?? null,
      exitNode: self.ExitNode ?? false,
    };
  } catch {
    return { running: true };
  }
}

/**
 * Returns the full Tailscale status by checking installation, daemon state,
 * and parsing the machine's self-node information.
 */
export async function getStatus(): Promise<TailscaleStatus> {
  const installed = await which('tailscale');

  const offline: TailscaleStatus = {
    installed,
    running: false,
    ip: null,
    hostname: null,
    tailnet: null,
    version: null,
    exitNode: false,
  };

  if (!installed) {
    return offline;
  }

  const result = await exec('tailscale', ['status', '--json']);

  if (result.exitCode !== 0) {
    // A non-zero exit code typically means the daemon isn't running.
    return offline;
  }

  const parsed = parseStatusJson(result.stdout);

  return {
    ...offline,
    ...parsed,
  };
}

/**
 * Brings Tailscale up and connects to the tailnet.
 * Returns true when the command exits successfully.
 */
export async function up(): Promise<boolean> {
  const result = await exec('tailscale', ['up']);
  return result.exitCode === 0;
}

/**
 * Disconnects Tailscale from the tailnet.
 * Returns true when the command exits successfully.
 */
export async function down(): Promise<boolean> {
  const result = await exec('tailscale', ['down']);
  return result.exitCode === 0;
}

/**
 * Returns the machine's Tailscale IPv4 address, or null if unavailable.
 */
export async function getIp(): Promise<string | null> {
  const result = await exec('tailscale', ['ip', '-4']);
  if (result.exitCode !== 0 || result.stdout === '') {
    return null;
  }
  return result.stdout;
}
