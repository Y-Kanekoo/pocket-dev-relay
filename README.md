# Pocket Dev Relay

Pocket Dev Relay is a mobile-first local web app that lets you run Codex CLI or Claude Code sessions from your phone. It streams a real terminal over WebSocket, so you can keep coding even when you are away from your desk.

## Features
- Mobile-focused UI with a live terminal powered by xterm.js.
- Presets for Codex CLI, Claude Code, or a plain shell.
- Optional custom commands (disabled by default).
- Read-only file browser with optional write support.
- Works on your local network; no cloud required.

## Requirements
- Node.js 18+ recommended.
- Codex CLI and/or Claude Code installed and available on your PATH.

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment settings (optional but recommended):
   ```bash
   cp .env.example .env
   ```
3. Set your token and workspace root in `.env`.
4. Start the server:
   ```bash
   npm start
   ```
5. Open the printed LAN URL from your phone (same Wi-Fi).

## Environment Options
- `AUTH_TOKEN`: Require a token to connect (recommended).
- `WORKSPACE_ROOT`: Root directory to expose in the file browser and terminals.
- `ALLOW_CUSTOM_COMMANDS`: Enable custom command mode.
- `ALLOW_FILE_WRITE`: Enable file editing in the browser.
- `CODEX_CMD` / `CODEX_ARGS`: Override the Codex command and args.
- `CLAUDE_CMD` / `CLAUDE_ARGS`: Override the Claude command and args.
- `SHELL_CMD` / `SHELL_ARGS`: Override the shell command.
- `MAX_FILE_SIZE`: Maximum file size for previews (bytes).

## Notes
- If a CLI tool is missing, the terminal will show an error when you start a session.
- For best security, keep this on a trusted LAN and set `AUTH_TOKEN`.

## Troubleshooting
- If `node-pty` fails to install, make sure build tools for Node.js are available on your system.
- If the UI shows "未接続", check that your phone can reach the LAN URL.

## 日本語メモ
- スマホは同じWi-Fiに接続してください。画面のQRから開くのが簡単です。
- `mDNS (hostname.local)` が使える場合はIP不要で接続できます。
- 外出先から使う場合はTailscaleなどのVPN経由が安全で簡単です。
- サーバーはPC上で動くので、PCは起動したままにしてください。
- Macでスリープを防ぐ場合は `npm run start:awake` を使ってください。
