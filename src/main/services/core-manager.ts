import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { assetName, assetPlatform, assetArch, binaryName } from './platform';
import { IPC } from '../../shared/ipc-channels';
import type { ActiveCore, CoreProgress, CoreStatus, UpdateInfo } from '../../shared/types';
import type { BundledPaths, RuntimePaths } from './paths';

const REPO = 'screego/server';
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Oldest release the launcher's config-injection approach is tested with. */
export const MIN_SUPPORTED_VERSION = '1.10.0';

export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

interface CurrentPointer {
  version: string;
  dir: string;
  binary: string;
  source: 'bundled' | 'downloaded';
}

interface BundledManifestAsset {
  name: string;
  /** directory name inside assets/cores */
  dir: string;
}

interface BundledManifest {
  version: string;
  assets: Record<string, BundledManifestAsset>;
}

interface ReleaseAsset {
  name: string;
  size: number;
}

interface LatestRelease {
  tag_name: string;
  published_at: string;
  assets: ReleaseAsset[];
}

type Emit = (channel: typeof IPC.CoreProgress, payload: CoreProgress) => void;

function request(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    redirect: 'follow',
    ...init,
    headers: {
      'User-Agent': 'screego-launcher',
      Accept: 'application/vnd.github+json',
      ...(init?.headers ?? {}),
    },
  });
}

function execFileText(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 60_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

/** Sorts installed cores newest-first by parsed version, not raw dir name. */
function byVersionDesc(a: { dir: string }, b: { dir: string }): number {
  const va = parseVersionFromDir(a.dir);
  const vb = parseVersionFromDir(b.dir);
  if (va && vb) return compareSemver(vb, va);
  if (va) return -1; // versioned dirs rank above unversioned ones
  if (vb) return 1;
  return b.dir.localeCompare(a.dir);
}

/**
 * Owns everything about the screego kernel: the bundled copy, downloaded
 * copies in userData/cores, checking GitHub for updates, and (on macOS)
 * removing the quarantine attribute so unsigned binaries can run.
 */
export class CoreManager {
  constructor(
    private readonly runtime: RuntimePaths,
    private readonly bundled: BundledPaths,
    private readonly emit: Emit = () => {},
  ) {}

  // ---- bundled core ----

  bundledManifest(): { version: string; asset: BundledManifestAsset } | null {
    try {
      const raw = JSON.parse(fs.readFileSync(this.bundled.manifestFile, 'utf8')) as BundledManifest;
      const key = `${assetPlatform()}-${assetArch()}`;
      const asset = raw.assets?.[key];
      if (!asset) return null;
      return { version: raw.version, asset };
    } catch {
      return null; // dev environment without a packed core
    }
  }

  private bundledBinaryPath(): string | null {
    const m = this.bundledManifest();
    if (!m) return null;
    return path.join(this.bundled.bundledCoresDir, m.asset.dir, binaryName());
  }

  // ---- installed cores ----

  readCurrent(): CurrentPointer | null {
    try {
      return JSON.parse(fs.readFileSync(this.runtime.currentFile, 'utf8')) as CurrentPointer;
    } catch {
      return null;
    }
  }

  writeCurrent(info: CurrentPointer): void {
    fs.writeFileSync(this.runtime.currentFile, JSON.stringify(info, null, 2));
  }

  listInstalled(): Array<{ dir: string; binary: string }> {
    let dirs: fs.Dirent[];
    try {
      dirs = fs.readdirSync(this.runtime.coresDir, { withFileTypes: true });
    } catch {
      return [];
    }
    return dirs
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => ({ dir: d.name, binary: path.join(this.runtime.coresDir, d.name, binaryName()) }))
      .filter((c) => fs.existsSync(c.binary));
  }

  /**
   * Resolves which binary `screego serve` should run, with fallbacks:
   * current.json -> any installed core -> bundled core.
   */
  async resolveActive(): Promise<ActiveCore | null> {
    const current = this.readCurrent();
    if (current && fs.existsSync(current.binary)) {
      return {
        binary: current.binary,
        version: current.version,
        source: current.source,
        dir: current.dir,
      };
    }
    const installed = this.listInstalled();
    if (installed.length > 0) {
      // sort by parsed version so directory suffixes (e.g. "-darwin-arm64")
      // can never turn compareSemver's input into NaN
      const latest = [...installed].sort(byVersionDesc)[0]!;
      return {
        binary: latest.binary,
        version: parseVersionFromDir(latest.dir),
        source: 'downloaded',
        dir: latest.dir,
      };
    }
    const bundledBinary = this.bundledBinaryPath();
    if (bundledBinary && fs.existsSync(bundledBinary)) {
      return {
        binary: bundledBinary,
        version: this.bundledManifest()!.version,
        source: 'bundled',
        dir: null, // lives inside the app bundle, not the cores dir
      };
    }
    return null;
  }

  /**
   * Switches the active kernel to an already-installed core directory. The
   * caller (ipc layer) is responsible for restarting a running server.
   */
  async setActive(dir: string): Promise<CoreStatus> {
    const target = this.listInstalled().find((c) => c.dir === dir);
    if (!target) throw new Error(`未安装的内核：${dir}`);
    const version =
      parseVersionFromDir(dir) ?? (await this.binaryVersion(target.binary)) ?? 'unknown';
    const source = dir === this.bundledManifest()?.asset.dir ? 'bundled' : 'downloaded';
    this.writeCurrent({ version, dir, binary: target.binary, source });
    return this.status();
  }

  /**
   * Copies the bundled core into userData so quarantine removal and future
   * updates never touch the read-only app bundle. Safe to call on every boot.
   */
  async provisionBundledCore(): Promise<{ provisioned: boolean; version?: string; reason?: string }> {
    const m = this.bundledManifest();
    if (!m) return { provisioned: false, reason: 'no bundled manifest' };
    const current = this.readCurrent();
    if (current && fs.existsSync(current.binary)) {
      return { provisioned: false, reason: 'a core is already active', version: current.version };
    }
    if (this.listInstalled().length > 0) {
      return { provisioned: false, reason: 'cores already installed' };
    }
    const srcDir = path.join(this.bundled.bundledCoresDir, m.asset.dir);
    const destDir = path.join(this.runtime.coresDir, m.asset.dir);
    if (!fs.existsSync(srcDir)) return { provisioned: false, reason: 'bundled core files missing' };

    fs.cpSync(srcDir, destDir, { recursive: true });
    const binary = path.join(destDir, binaryName());
    fs.chmodSync(binary, 0o755);
    await this.dequarantine(destDir);
    this.writeCurrent({ version: m.version, dir: m.asset.dir, binary, source: 'bundled' });
    return { provisioned: true, version: m.version };
  }

  /**
   * Unsigned release binaries copied out of the app bundle (or downloaded)
   * are quarantined by macOS Gatekeeper; strip the attribute like Clash
   * Verge style launchers do, otherwise exec fails with "killed: 9".
   */
  private async dequarantine(targetPath: string): Promise<void> {
    if (process.platform !== 'darwin') return;
    try {
      await execFileText('xattr', ['-dr', 'com.apple.quarantine', targetPath]);
    } catch {
      // attribute may not exist -> fine
    }
  }

  // ---- version detection ----

  async binaryVersion(binary: string): Promise<string | null> {
    try {
      const out = await execFileText(binary, ['--version']);
      const m = out.match(/(\d+\.\d+\.\d+)/);
      return m?.[1] ? `v${m[1]}` : null;
    } catch {
      return null;
    }
  }

  async status(): Promise<CoreStatus> {
    const active = await this.resolveActive();
    return {
      active,
      installed: [...this.listInstalled()]
        .sort(byVersionDesc)
        .map((c) => ({ dir: c.dir, version: parseVersionFromDir(c.dir) })),
      bundled: this.bundledManifest() ? { version: this.bundledManifest()!.version } : null,
      minSupported: MIN_SUPPORTED_VERSION,
    };
  }

  // ---- update flow ----

  async checkLatest(): Promise<UpdateInfo> {
    const res = await request(LATEST_API);
    if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
    const data = (await res.json()) as LatestRelease;
    const version = data.tag_name;
    const name = assetName(version);
    const asset = data.assets.find((a) => a.name === name);
    if (!asset) {
      throw new Error(`release ${version} has no asset for this platform (${name})`);
    }
    const active = await this.resolveActive();
    return {
      latest: version,
      publishedAt: data.published_at,
      assetName: name,
      size: asset.size,
      current: active?.version ?? null,
      updateAvailable: !active?.version || compareSemver(version, active.version) > 0,
    };
  }

  /**
   * Clash Verge style update: download -> extract -> verify -> atomically
   * switch current.json -> clean up the old core. If anything fails the
   * previous kernel stays active; a running server is restarted afterwards.
   */
  async updateToLatest(server: {
    isRunning(): boolean;
    stop(opts?: { silent?: boolean }): Promise<void>;
    start(options?: never): Promise<unknown>;
  }): Promise<{ updated: boolean; version: string | null }> {
    const info = await this.checkLatest();
    if (!info.updateAvailable) {
      return { updated: false, version: info.current };
    }
    if (compareSemver(info.latest, MIN_SUPPORTED_VERSION) < 0) {
      throw new Error(`screego ${info.latest} is older than the minimum supported v${MIN_SUPPORTED_VERSION}`);
    }

    const wasRunning = server.isRunning();
    if (wasRunning) {
      await server.stop({ silent: true });
      // give the OS a moment to release the HTTP/TURN ports
      await new Promise((r) => setTimeout(r, 600));
    }

    const previous = this.readCurrent();
    try {
      const installed = await this.downloadAndInstall(info.latest);
      const ok = await this.verifyBinary(installed.binary, info.latest);
      if (!ok) throw new Error('the downloaded kernel failed its version check');
      this.writeCurrent({ ...installed, source: 'downloaded' });
      if (previous?.dir && previous.dir !== installed.dir) this.removeCoreDir(previous.dir);
      if (wasRunning) await server.start();
      return { updated: true, version: info.latest };
    } catch (err) {
      // roll back to the previously working kernel
      if (previous && fs.existsSync(previous.binary)) this.writeCurrent(previous);
      if (wasRunning) {
        try {
          await server.start();
        } catch {
          // restart after rollback failed; the UI will show the server stopped
        }
      }
      throw err;
    }
  }

  async downloadAndInstall(version: string): Promise<{ version: string; dir: string; binary: string }> {
    const name = assetName(version);
    const url = `https://github.com/${REPO}/releases/download/${version}/${name}`;
    const tmpArchive = path.join(this.runtime.tmpDir, `${Date.now()}-${name}`);
    const stageDir = path.join(this.runtime.tmpDir, `stage-${Date.now()}`);
    const dirName = `${version}-${assetPlatform()}-${assetArch()}`;
    const finalDir = path.join(this.runtime.coresDir, dirName);

    try {
      this.emit(IPC.CoreProgress, { phase: 'download', percent: 0, version });
      await this.downloadFile(url, tmpArchive, (percent) => {
        this.emit(IPC.CoreProgress, { phase: 'download', percent, version });
      });

      this.emit(IPC.CoreProgress, { phase: 'extract', percent: null, version });
      fs.mkdirSync(stageDir, { recursive: true });
      await extractArchive(tmpArchive, stageDir);
      const found = findBinary(stageDir);
      if (!found) throw new Error(`archive ${name} did not contain a screego binary`);

      fs.rmSync(finalDir, { recursive: true, force: true });
      fs.mkdirSync(finalDir, { recursive: true });
      const binary = path.join(finalDir, binaryName());
      fs.copyFileSync(found, binary);
      fs.chmodSync(binary, 0o755);
      await this.dequarantine(finalDir);

      this.emit(IPC.CoreProgress, { phase: 'done', percent: 100, version });
      return { version, dir: dirName, binary };
    } finally {
      fs.rmSync(tmpArchive, { force: true });
      fs.rmSync(stageDir, { recursive: true, force: true });
    }
  }

  private async downloadFile(
    url: string,
    dest: string,
    onProgress: (percent: number) => void,
  ): Promise<void> {
    const res = await request(url, { headers: { Accept: 'application/octet-stream' } });
    if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);

    const total = Number(res.headers.get('content-length')) || 0;
    let received = 0;
    const reader = res.body.getReader();
    const nodeStream = new Readable({
      async read() {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
          return;
        }
        received += (value as Uint8Array).length;
        if (total > 0) onProgress(Math.round((received / total) * 100));
        this.push(Buffer.from(value as Uint8Array));
      },
    });
    await pipeline(nodeStream, fs.createWriteStream(dest));
  }

  private async verifyBinary(binary: string, expectedVersion: string): Promise<boolean> {
    const version = await this.binaryVersion(binary);
    if (!version) return false;
    return compareSemver(version, expectedVersion) === 0;
  }

  private removeCoreDir(dir: string): void {
    try {
      fs.rmSync(path.join(this.runtime.coresDir, dir), { recursive: true, force: true });
    } catch {
      // keep leftovers, they do no harm
    }
  }

  /** Drops all downloaded cores; the next start falls back to the bundled one. */
  async rollbackToBundled(): Promise<void> {
    const bundledDir = this.bundledManifest()?.asset.dir;
    for (const core of this.listInstalled()) {
      if (core.dir === bundledDir) continue;
      this.removeCoreDir(core.dir);
    }
    fs.rmSync(this.runtime.currentFile, { force: true });
    await this.provisionBundledCore();
  }
}

export function parseVersionFromDir(dir: string): string | null {
  const m = dir.match(/^v?(\d+\.\d+\.\d+)/);
  return m?.[1] ? `v${m[1]}` : null;
}

async function extractArchive(archive: string, destDir: string): Promise<void> {
  if (archive.endsWith('.zip')) {
    await execFileText('unzip', ['-o', archive, '-d', destDir]);
  } else {
    await execFileText('tar', ['-xzf', archive, '-C', destDir]);
  }
}

function findBinary(dir: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findBinary(full);
      if (found) return found;
    } else if (entry.name === binaryName()) {
      return full;
    }
  }
  return null;
}
