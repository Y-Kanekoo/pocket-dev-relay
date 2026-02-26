import { execFile, spawn } from 'node:child_process';
import type { CommandResult } from '../types.js';

export function exec(command: string, args: string[] = []): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 15000 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout?.toString().trim() ?? '',
        stderr: stderr?.toString().trim() ?? '',
        exitCode: error?.code !== undefined ? (typeof error.code === 'number' ? error.code : 1) : 0,
      });
    });
  });
}

export function which(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('which', [command], (error) => {
      resolve(!error);
    });
  });
}

export function spawnInteractive(command: string, args: string[] = []): void {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
  });

  child.on('error', (err) => {
    console.error(`Failed to start ${command}: ${err.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}
