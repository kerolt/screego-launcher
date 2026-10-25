import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { parseConfig, parsePort, setExternalIp } from './screego-config';
import { IPC } from '../../shared/ipc-channels';
import type { ServerState, StartResult } from '../../shared/types';
import type { RuntimePaths } from './paths';

const MAX_LOG_CHARS = 200 * 1024;

export interface StartOptions {
  binary: string;
  externalIp: string;
  configFile: string;
}

type Emit = {
  (channel: typeof IPC.ServerLog, payload: string): void;
  (channel: typeof IPC.ServerState, payload: ServerState): void;
};

/**
 * Spawns/stops `screego serve` and keeps a bounded ring buffer of its output
 * so the UI can show logs without external files.
 */
export class ServerManager {
  private child: ChildProcess | null = null;
  private logBuffer = '';
  private lastExit: ServerState['lastExit'] = null;
  private url: string | null = null;
  private intentionalStop = false;

  constructor(
    private readonly runtime: RuntimePaths,
    private readonly emit: Emit = () => {},
  ) {}

  isRunning(): boolean {
    return !!this.child && this.child.exitCode === null && !this.child.killed;
  }

  private appendLog(chunk: string): void {
    this.logBuffer += chunk;
    if (this.logBuffer.length > MAX_LOG_CHARS) {
      this.logBuffer = this.logBuffer.slice(-MAX_LOG_CHARS);
    }
    this.emit(IPC.ServerLog, chunk);
  }

  /** Applies the selected NIC, starts the server, and returns the LAN URL. */
  async start(options: StartOptions): Promise<StartResult> {
    if (this.isRunning()) throw new Error('server is already running');
    const { binary, externalIp, configFile } = options;

    // Persist the chosen NIC into the managed config, then materialize an
    // effective config next to the kernel binary: screego only auto-loads
    // config files that live beside the executable (or in a few fixed OS
    // locations), so we run it with cwd = the kernel's directory where a
    // freshly written `screego.config` waits.
    setExternalIp(configFile, externalIp);
    const effectiveConfig = path.join(path.dirname(binary), 'screego.config');
    fs.copyFileSync(configFile, effectiveConfig);

    const conf = parseConfig(effectiveConfig);
    const port = parsePort(conf['SCREEGO_SERVER_ADDRESS'], 5050);
    const scheme = conf['SCREEGO_SERVER_TLS'] === 'true' ? 'https' : 'http';

    this.intentionalStop = false;
    this.lastExit = null;
    this.url = null;
    this.appendLog(
      `\n[launcher] starting ${binary} serve\n[launcher] config: ${effectiveConfig}\n`,
    );

    // screego's env vars win over the config file; strip any SCREEGO_* that
    // leak in from the user's shell so the file is the single source of truth.
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith('SCREEGO_')) delete env[key];
    }

    const child = spawn(binary, ['serve'], {
      cwd: path.dirname(binary),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;

    child.stdout?.on('data', (d: Buffer) => this.appendLog(d.toString()));
    child.stderr?.on('data', (d: Buffer) => this.appendLog(d.toString()));
    child.on('error', (err) => {
      this.appendLog(`[launcher] failed to spawn: ${err.message}\n`);
      this.url = null;
      this.emitState();
    });
    child.on('exit', (code, signal) => {
      this.lastExit = { code, signal, intentional: this.intentionalStop, at: Date.now() };
      this.appendLog(`[launcher] screego exited (code=${code}, signal=${signal})\n`);
      this.child = null;
      this.url = null;
      this.emitState();
    });

    await this.waitForPort(port, externalIp, 8000, child);
    this.url = `${scheme}://${externalIp}:${port}`;
    this.emitState();
    return { url: this.url, port, scheme };
  }

  /** Polls until the HTTP server answers or the process dies. */
  private async waitForPort(
    port: number,
    host: string,
    timeoutMs: number,
    child: ChildProcess,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`screego exited immediately (code=${child.exitCode}); check the log`);
      }
      try {
        const res = await fetch(`http://${host}:${port}/`, { signal: AbortSignal.timeout(1500) });
        if (res.status > 0) return; // any HTTP response means the server is up
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error('screego did not start listening within 8s; check the log');
  }

  async stop(opts: { silent?: boolean } = {}): Promise<void> {
    if (!this.isRunning()) return;
    this.intentionalStop = true;
    if (!opts.silent) this.appendLog('[launcher] stopping screego...\n');
    const child = this.child!;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 4000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill('SIGTERM');
    });
    this.emitState();
  }

  emitState(): void {
    this.emit(IPC.ServerState, this.state());
  }

  state(): ServerState {
    return { running: this.isRunning(), url: this.url, lastExit: this.lastExit };
  }

  logs(): string {
    return this.logBuffer;
  }

  async dispose(): Promise<void> {
    await this.stop({ silent: true });
  }

  /**
   * Last-resort cleanup for the process signal path: fire-and-forget SIGTERM
   * to the screego child, no waiting (the caller exits immediately after).
   */
  killChildSync(): void {
    if (!this.child) return;
    this.intentionalStop = true;
    this.child.kill('SIGTERM');
    this.child = null;
  }
}
