export interface TailscaleStatus {
  installed: boolean;
  running: boolean;
  ip: string | null;
  hostname: string | null;
  tailnet: string | null;
  version: string | null;
  exitNode: boolean;
}

export interface MoshStatus {
  installed: boolean;
  serverRunning: boolean;
  version: string | null;
  ports: number[];
}

export interface TmuxStatus {
  installed: boolean;
  serverRunning: boolean;
  version: string | null;
  sessions: TmuxSession[];
}

export interface TmuxSession {
  name: string;
  windows: number;
  attached: boolean;
  created: string;
  size: string;
}

export interface TmuxLayout {
  name: string;
  description: string;
  windows: TmuxWindowConfig[];
}

export interface TmuxWindowConfig {
  name: string;
  command?: string;
  panes?: TmuxPaneConfig[];
}

export interface TmuxPaneConfig {
  command?: string;
  split?: 'horizontal' | 'vertical';
  size?: string;
}

export interface SystemStatus {
  tailscale: TailscaleStatus;
  mosh: MoshStatus;
  tmux: TmuxStatus;
}

export interface ConnectionInfo {
  tailscaleIp: string;
  hostname: string;
  moshCommand: string;
  tmuxSession: string;
  fullCommand: string;
}

export interface Config {
  tmux: {
    defaultSession: string;
    layouts: TmuxLayout[];
  };
  mosh: {
    ports: string;
    server: string;
  };
  tailscale: {
    exitNode: boolean;
    acceptRoutes: boolean;
  };
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
