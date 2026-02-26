import { getIp } from '../services/tailscale.js';
import { getStatus } from '../services/tmux.js';
import { loadConfig } from '../utils/config.js';
import * as log from '../utils/logger.js';
import { generateQR } from '../utils/qr.js';

/**
 * Shows connection information for reaching this machine over Tailscale with
 * mosh and tmux. A QR code of the full connection command is rendered for easy
 * scanning from a mobile terminal emulator.
 */
export async function connectCommand(): Promise<void> {
  const [ip, tmuxStatus, config] = await Promise.all([
    getIp(),
    getStatus(),
    loadConfig(),
  ]);

  if (!ip) {
    log.error('Could not determine Tailscale IP. Is Tailscale connected?');
    log.info('Try running: pdr tailscale up');
    return;
  }

  const user = process.env.USER ?? process.env.LOGNAME ?? 'user';
  const sessionName = config.tmux.defaultSession;

  // Pick the first active session name if one exists, otherwise fall back to
  // the configured default.
  const activeSession =
    tmuxStatus.sessions.length > 0
      ? tmuxStatus.sessions[0].name
      : sessionName;

  const sshCmd = `ssh ${user}@${ip}`;
  const moshCmd = `mosh ${user}@${ip}`;
  const tmuxCmd = `tmux attach-session -t ${activeSession}`;
  const fullCmd = `mosh ${user}@${ip} -- tmux attach-session -t ${activeSession}`;

  // ── Connection details ─────────────────────────────────────────────────
  log.header('Connection Info');

  log.label('Tailscale IP', ip);
  log.label('User', user);
  log.label('Tmux Session', activeSession);

  // ── Full command ───────────────────────────────────────────────────────
  log.header('Full Command');
  console.log(`  ${fullCmd}`);

  // ── Individual commands ────────────────────────────────────────────────
  log.header('Individual Commands');
  log.label('SSH', sshCmd);
  log.label('Mosh', moshCmd);
  log.label('Tmux attach', tmuxCmd);

  // ── QR code ────────────────────────────────────────────────────────────
  log.header('QR Code');
  log.info('Scan to copy the full connection command:');
  console.log();

  const qr = await generateQR(fullCmd);
  console.log(qr);
}
