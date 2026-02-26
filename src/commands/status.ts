import { getStatus as getTailscaleStatus } from '../services/tailscale.js';
import { getStatus as getMoshStatus } from '../services/mosh.js';
import { getStatus as getTmuxStatus } from '../services/tmux.js';
import { header, label, statusIcon, info, warn } from '../utils/logger.js';

/**
 * Displays a health overview of all three components: Tailscale, Mosh, and
 * Tmux. Each service is queried in parallel for responsiveness and the results
 * are rendered in a compact, colour-coded summary.
 */
export async function statusCommand(): Promise<void> {
  info('Checking service status...');

  const [tailscale, mosh, tmux] = await Promise.all([
    getTailscaleStatus(),
    getMoshStatus(),
    getTmuxStatus(),
  ]);

  // ── Tailscale ──────────────────────────────────────────────────────────
  header('Tailscale');

  label('Installed', `${statusIcon(tailscale.installed)} ${tailscale.installed ? 'yes' : 'no'}`);

  if (tailscale.installed) {
    label('Running', `${statusIcon(tailscale.running)} ${tailscale.running ? 'yes' : 'no'}`);
    label('IP', tailscale.ip ?? 'n/a');
    label('Hostname', tailscale.hostname ?? 'n/a');
    label('Tailnet', tailscale.tailnet ?? 'n/a');
    label('Version', tailscale.version ?? 'n/a');
    label('Exit Node', tailscale.exitNode ? 'active' : 'off');
  } else {
    warn('Tailscale is not installed. Run `pdr setup` for install instructions.');
  }

  // ── Mosh ───────────────────────────────────────────────────────────────
  header('Mosh');

  label('Installed', `${statusIcon(mosh.installed)} ${mosh.installed ? 'yes' : 'no'}`);

  if (mosh.installed) {
    label('Server Running', `${statusIcon(mosh.serverRunning)} ${mosh.serverRunning ? 'yes' : 'no'}`);
    label('Version', mosh.version ?? 'n/a');
    label('Ports', mosh.ports.length > 0 ? mosh.ports.join(', ') : 'none');
  } else {
    warn('Mosh is not installed. Run `pdr setup` for install instructions.');
  }

  // ── Tmux ───────────────────────────────────────────────────────────────
  header('Tmux');

  label('Installed', `${statusIcon(tmux.installed)} ${tmux.installed ? 'yes' : 'no'}`);

  if (tmux.installed) {
    label('Server Running', `${statusIcon(tmux.serverRunning)} ${tmux.serverRunning ? 'yes' : 'no'}`);
    label('Version', tmux.version ?? 'n/a');
    label('Sessions', String(tmux.sessions.length));

    if (tmux.sessions.length > 0) {
      console.log();
      for (const session of tmux.sessions) {
        const attachedTag = session.attached ? ' (attached)' : '';
        label(
          `  ${session.name}`,
          `${session.windows} window(s), ${session.size}${attachedTag}`,
        );
      }
    }
  } else {
    warn('Tmux is not installed. Run `pdr setup` for install instructions.');
  }

  console.log();
}
