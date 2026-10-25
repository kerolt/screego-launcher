#!/usr/bin/env node
/**
 * Downloads screego release binaries into assets/cores/ so the app ships
 * with a built-in kernel, and writes assets/cores/core-manifest.json which
 * the main process reads at runtime.
 *
 * Usage:
 *   node scripts/pack-core.mjs                      # latest release, current platform
 *   node scripts/pack-core.mjs --all                # latest release, all platforms
 *   node scripts/pack-core.mjs --version v1.12.6 --platform darwin --arch arm64
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const REPO = 'screego/server';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORES_DIR = path.join(ROOT, 'assets', 'cores');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const PLATFORM_MAP = { darwin: 'darwin', win32: 'windows', linux: 'linux' };
const ARCH_MAP = { x64: 'amd64', arm64: 'arm64' };

const TARGETS = has('all')
  ? [
      ['darwin', 'amd64'],
      ['darwin', 'arm64'],
      ['linux', 'amd64'],
      ['linux', 'arm64'],
      ['windows', 'amd64'],
      ['windows', 'arm64'],
    ]
  : [
      [
        PLATFORM_MAP[flag('platform') ?? process.platform] ?? flag('platform') ?? process.platform,
        ARCH_MAP[flag('arch') ?? process.arch] ?? flag('arch') ?? process.arch,
      ],
    ];

async function getRelease(version) {
  const url = version
    ? `https://api.github.com/repos/${REPO}/releases/tags/${version}`
    : `https://api.github.com/repos/${REPO}/releases/latest`;
  const res = await fetch(url, { headers: { 'User-Agent': 'screego-launcher' } });
  if (!res.ok) throw new Error(`GitHub API responded ${res.status} for ${url}`);
  return res.json();
}

async function download(url, dest) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'screego-launcher', Accept: 'application/octet-stream' },
  });
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status} (${url})`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
}

function extract(archive, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (archive.endsWith('.zip')) {
    execFileSync('unzip', ['-o', archive, '-d', destDir], { stdio: 'pipe' });
  } else {
    execFileSync('tar', ['-xzf', archive, '-C', destDir], { stdio: 'pipe' });
  }
}

function findBinary(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findBinary(full);
      if (found) return found;
    } else if (/^screego(\.exe)?$/.test(entry.name)) {
      return full;
    }
  }
  return null;
}

const release = await getRelease(flag('version'));
const version = release.tag_name;
console.log(`packing screego ${version} for ${TARGETS.map((t) => t.join('/')).join(', ')}`);

fs.mkdirSync(CORES_DIR, { recursive: true });
const manifest = { version, assets: {} };

for (const [platform, arch] of TARGETS) {
  const ext = platform === 'windows' ? 'zip' : 'tar.gz';
  const name = `screego_${version.replace(/^v/, '')}_${platform}_${arch}.${ext}`;
  const asset = release.assets.find((a) => a.name === name);
  if (!asset) {
    console.warn(`  ! no asset ${name}, skipping`);
    continue;
  }

  const dir = `${version}-${platform}-${arch}`;
  const destDir = path.join(CORES_DIR, dir);
  const tmpArchive = path.join(CORES_DIR, `.tmp-${name}`);

  console.log(`  ↓ ${name}`);
  await download(asset.browser_download_url, tmpArchive);

  const stageDir = path.join(CORES_DIR, `.stage-${dir}`);
  extract(tmpArchive, stageDir);
  const binary = findBinary(stageDir);
  if (!binary) throw new Error(`archive ${name} did not contain a screego binary`);

  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  const target = path.join(destDir, path.basename(binary));
  fs.copyFileSync(binary, target);
  fs.chmodSync(target, 0o755);
  fs.rmSync(tmpArchive, { force: true });
  fs.rmSync(stageDir, { recursive: true, force: true });

  manifest.assets[`${platform}-${arch}`] = { name, dir };
  console.log(`  ✓ ${dir}`);
}

fs.writeFileSync(path.join(CORES_DIR, 'core-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`manifest written for ${Object.keys(manifest.assets).length} platform(s)`);
