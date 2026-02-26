import { loadConfig, getConfigPath } from '../utils/config.js';
import * as log from '../utils/logger.js';

/**
 * Displays the current configuration, including the file path, the resolved
 * JSON values, and the available tmux layouts.
 */
export async function configCommand(): Promise<void> {
  const configPath = getConfigPath();
  const config = await loadConfig();

  // ── Config file path ───────────────────────────────────────────────────
  log.header('Configuration');
  log.label('Config file', configPath);

  // ── Current configuration ──────────────────────────────────────────────
  log.header('Current Configuration');
  console.log();
  console.log(JSON.stringify(config, null, 2));

  // ── Tmux layouts ───────────────────────────────────────────────────────
  log.header('Available Tmux Layouts');

  if (config.tmux.layouts.length === 0) {
    log.warn('No layouts defined. Edit the config file to add layouts.');
  } else {
    for (const layout of config.tmux.layouts) {
      const windowNames = layout.windows.map((w) => w.name).join(', ');
      log.label(layout.name, `${layout.description} [${windowNames}]`);
    }
  }

  console.log();
  log.info(`Edit the config file to customise: ${configPath}`);
  console.log();
}
