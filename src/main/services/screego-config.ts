import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { SECRET_PLACEHOLDER, type NicInfo } from '../../shared/types';

// Written on first run; afterwards the file belongs to the user and can be
// edited freely with an external editor. LAN mode only: HTTP, no TLS.
const TEMPLATE = `# Screego server configuration (managed by Screego Launcher)
# Docs: https://screego.net/#/config
#
# LAN mode: plain HTTP, no TLS certificates required.
# Every device on the network must open the URL shown in the launcher,
# otherwise screen sharing will not work.

# External IP announced to clients. The launcher rewrites this line on start
# based on the network interface you selected.
SCREEGO_EXTERNAL_IP={{EXTERNAL_IP}}

# Secret used for cookie authentication (auto-generated, keep private).
SCREEGO_SECRET={{SECRET}}

# LAN mode -> no TLS.
SCREEGO_SERVER_TLS=false
SCREEGO_TLS_CERT_FILE=
SCREEGO_TLS_KEY_FILE=

# HTTP server listen address.
SCREEGO_SERVER_ADDRESS=0.0.0.0:5050

# TURN server listen address.
SCREEGO_TURN_ADDRESS=0.0.0.0:3478

# Login is not required inside a trusted LAN.
SCREEGO_AUTH_MODE=none

# Log level: debug, info, warn, error
SCREEGO_LOG_LEVEL=info
`;

const MAX_CONFIG_BYTES = 64 * 1024;
const SECRET_LINE_RE = /^(\s*SCREEGO_SECRET\s*=\s*)(.*?)\s*$/m;
const KEY_VALUE_RE = /^SCREEGO_[A-Z0-9_]+\s*=.*$/;

export class ConfigValidationError extends Error {
  override name = 'ConfigValidationError';
}

export function randomSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** IPv4 interfaces usable as the LAN address; en0 (macOS Wi-Fi) first. */
export function listInterfaces(): NicInfo[] {
  const result: NicInfo[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    const ipv4 = (addrs ?? []).find((a) => a.family === 'IPv4' && !a.internal);
    if (!ipv4) continue;
    result.push({
      id: name,
      name,
      address: ipv4.address,
      netmask: ipv4.netmask,
      mac: ipv4.mac,
      recommended: name === 'en0',
    });
  }
  result.sort(
    (a, b) => Number(b.recommended) - Number(a.recommended) || a.name.localeCompare(b.name),
  );
  return result;
}

export function ensureConfigFile(file: string, externalIp: string): boolean {
  if (fs.existsSync(file)) return false;
  const content = TEMPLATE.replace('{{EXTERNAL_IP}}', externalIp).replace(
    '{{SECRET}}',
    randomSecret(),
  );
  fs.writeFileSync(file, content, { mode: 0o600 });
  return true;
}

export function readConfig(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Config text for the renderer with the SCREEGO_SECRET value replaced by
 * SECRET_PLACEHOLDER — the secret never crosses the IPC boundary.
 */
export function readConfigRedacted(file: string): string {
  return readConfig(file).replace(SECRET_LINE_RE, `$1${SECRET_PLACEHOLDER}`);
}

/**
 * Validates user-edited config text: every non-blank, non-comment line must be
 * a `SCREEGO_*=value` pair. Throws ConfigValidationError with a line number.
 */
export function validateConfigContent(content: string): void {
  if (typeof content !== 'string') throw new ConfigValidationError('配置内容必须是字符串');
  if (content.length > MAX_CONFIG_BYTES) throw new ConfigValidationError('配置内容过大（上限 64KB）');
  if (!content.trim()) throw new ConfigValidationError('配置内容不能为空');
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!KEY_VALUE_RE.test(trimmed)) {
      throw new ConfigValidationError(
        `第 ${i + 1} 行无效：只允许 SCREEGO_* 键（注释请以 # 开头）`,
      );
    }
  }
}

/**
 * Persists edited config. Comments survive untouched (we write the user's text
 * verbatim); when the SECRET line still carries the redaction placeholder the
 * current on-disk secret is restored, so a round-trip never leaks or loses it.
 */
export function writeConfig(file: string, content: string): void {
  validateConfigContent(content);
  const currentSecret = parseConfig(file)['SCREEGO_SECRET'];
  let next = content;
  if (currentSecret) {
    next = next.replace(SECRET_LINE_RE, (m, prefix: string, value: string) =>
      value.trim() === SECRET_PLACEHOLDER ? `${prefix}${currentSecret}` : m,
    );
  }
  fs.writeFileSync(file, next.endsWith('\n') ? next : `${next}\n`, { mode: 0o600 });
}

export function parseConfig(file: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readConfig(file).split(/\r?\n/)) {
    const m = line.match(/^\s*(SCREEGO_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] !== undefined) values[m[1]] = m[2] ?? '';
  }
  return values;
}

/** Rewrites SCREEGO_EXTERNAL_IP in place, keeping comments and other keys. */
export function setExternalIp(file: string, ip: string): boolean {
  const content = readConfig(file);
  const re = /^\s*SCREEGO_EXTERNAL_IP=.*$/m;
  if (re.test(content)) {
    const next = content.replace(re, `SCREEGO_EXTERNAL_IP=${ip}`);
    if (next === content) return false;
    fs.writeFileSync(file, next);
    return true;
  }
  fs.writeFileSync(file, `${content.trimEnd()}\nSCREEGO_EXTERNAL_IP=${ip}\n`);
  return true;
}

export function parsePort(address: string | undefined, fallback: number): number {
  if (!address) return fallback;
  const idx = address.lastIndexOf(':');
  if (idx === -1) return fallback;
  const port = Number(address.slice(idx + 1));
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}
