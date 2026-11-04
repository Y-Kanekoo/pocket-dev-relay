/**
 * PTY（擬似端末）操作サービス
 * コマンドプリセットと引数パーサー
 */

import { SessionMode, Presets } from '../types/index.js';
import { ALLOW_CUSTOM_COMMANDS, SHELL_CMD } from '../config.js';

// ============================================================
// 引数パーサー
// ============================================================

/**
 * 引数文字列をパース
 * @param input 引数文字列（JSON配列またはスペース区切り）
 * @returns 引数配列
 */
export function parseArgs(input: string | undefined): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // JSON解析失敗時はsplitArgsにフォールスルー
  }
  return splitArgs(input);
}

/**
 * 引数文字列をスペース区切りで分割（クォート対応）
 * @param input 引数文字列
 * @returns 引数配列
 */
export function splitArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: string | null = null;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === '\\' && i + 1 < input.length) {
        i += 1;
        current += input[i];
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    if (char === '\\' && i + 1 < input.length) {
      i += 1;
      current += input[i];
      continue;
    }

    current += char;
  }

  if (current) args.push(current);
  return args;
}

// ============================================================
// コマンドプリセット
// ============================================================

/** コマンドプリセット定義 */
export const PRESETS: Presets = {
  codex: {
    label: 'Codex CLI',
    command: process.env.CODEX_CMD || 'codex',
    args: parseArgs(process.env.CODEX_ARGS),
  },
  claude: {
    label: 'Claude Code',
    command: process.env.CLAUDE_CMD || 'claude',
    args: parseArgs(process.env.CLAUDE_ARGS),
  },
  shell: {
    label: 'Shell',
    command: SHELL_CMD,
    args: parseArgs(process.env.SHELL_ARGS),
  },
};

// ============================================================
// スポーン設定
// ============================================================

/** スポーン設定 */
export interface SpawnConfig {
  command: string;
  args: string[];
  label: string;
}

/** 実行を拒否する危険なコマンド */
const BLOCKED_COMMANDS: ReadonlySet<string> = new Set([
  'rm',
  'rmdir',
  'mkfs',
  'dd',
  'format',
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'chmod',
  'chown',
  'chgrp',
  'su',
  'sudo',
  'passwd',
  'useradd',
  'userdel',
  'usermod',
  'iptables',
  'ip6tables',
]);

/**
 * シェルメタ文字を含むかチェック
 * ブロック対象:
 *   ; | & ` — パイプライン・コマンド連結・バッククォート置換
 *   $ — 変数展開 ($VAR), コマンド置換 $(cmd), 算術展開 $((expr))
 *   ( ) { } — サブシェル・ブレース展開
 *   > < — リダイレクト（>> << 含む）
 *   \n \r — 改行によるコマンド注入（実際の改行文字およびエスケープリテラル）
 */
function containsShellMetaChars(input: string): boolean {
  // 実際の改行文字 + エスケープされたリテラル表現（\\n, \\r）も検出
  return /[;|&`$(){}<>\n\r]|\\n|\\r/.test(input);
}

/**
 * モードに応じたスポーン設定を取得
 * @param mode セッションモード
 * @param customCommand カスタムコマンド（customモード時）
 * @returns スポーン設定
 */
export function spawnForMode(mode: SessionMode, customCommand: string | undefined): SpawnConfig {
  if (mode === 'custom') {
    if (!ALLOW_CUSTOM_COMMANDS) {
      throw new Error('custom-commands-disabled');
    }
    if (containsShellMetaChars(customCommand || '')) {
      throw new Error('shell-metachar-detected');
    }
    const parts = splitArgs(customCommand || '');
    const command = parts.shift();
    if (!command) {
      throw new Error('missing-command');
    }
    const baseCommand = command.split('/').pop() || command;
    if (BLOCKED_COMMANDS.has(baseCommand)) {
      throw new Error('blocked-command');
    }
    return { command, args: parts, label: 'Custom' };
  }

  // SSHモードはPTYプリセットを使用しない（session.tsで別途処理）
  if (mode === 'ssh') {
    throw new Error('ssh-mode-not-pty');
  }

  const preset = PRESETS[mode];
  if (!preset) {
    throw new Error('unknown-mode');
  }

  return { command: preset.command, args: preset.args, label: preset.label };
}
