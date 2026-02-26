const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

function colorize(color: keyof typeof COLORS, text: string): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

export function info(message: string): void {
  console.log(`${colorize('blue', 'ℹ')} ${message}`);
}

export function success(message: string): void {
  console.log(`${colorize('green', '✔')} ${message}`);
}

export function warn(message: string): void {
  console.log(`${colorize('yellow', '⚠')} ${message}`);
}

export function error(message: string): void {
  console.error(`${colorize('red', '✖')} ${message}`);
}

export function header(message: string): void {
  console.log(`\n${colorize('bold', colorize('cyan', message))}`);
  console.log(colorize('gray', '─'.repeat(message.length + 4)));
}

export function label(key: string, value: string): void {
  console.log(`  ${colorize('gray', key + ':')} ${value}`);
}

export function statusIcon(ok: boolean): string {
  return ok ? colorize('green', '●') : colorize('red', '○');
}
