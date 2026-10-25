// Maps Electron's process.platform / process.arch onto the names used in
// screego release asset file names.

const PLATFORM_MAP: Record<string, string> = {
  darwin: 'darwin',
  win32: 'windows',
  linux: 'linux',
};

const ARCH_MAP: Record<string, string> = {
  x64: 'amd64',
  arm64: 'arm64',
};

export function assetPlatform(platform: NodeJS.Platform = process.platform): string {
  return PLATFORM_MAP[platform] ?? platform;
}

export function assetArch(arch: string = process.arch): string {
  return ARCH_MAP[arch] ?? arch;
}

/** e.g. screego_1.12.6_darwin_arm64.tar.gz / screego_1.12.6_windows_amd64.zip */
export function assetName(
  version: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  const v = version.replace(/^v/, '');
  const p = assetPlatform(platform);
  const ext = p === 'windows' ? 'zip' : 'tar.gz';
  return `screego_${v}_${p}_${assetArch(arch)}.${ext}`;
}

export function binaryName(platform: NodeJS.Platform = process.platform): string {
  return assetPlatform(platform) === 'windows' ? 'screego.exe' : 'screego';
}
