import fs from 'node:fs';

export interface LauncherSettings {
  /** id of the network interface chosen in the UI */
  nicId: string | null;
  autoUpdateCore: boolean;
  lastSeenLatestVersion: string | null;
}

const DEFAULTS: LauncherSettings = {
  nicId: null,
  autoUpdateCore: true,
  lastSeenLatestVersion: null,
};

export class Settings {
  private data: LauncherSettings;

  constructor(private readonly file: string) {
    this.data = { ...DEFAULTS };
    this.load();
  }

  private load(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<LauncherSettings>;
      this.data = { ...DEFAULTS, ...raw };
    } catch {
      // first run or corrupted file -> keep defaults
    }
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  get<K extends keyof LauncherSettings>(key: K): LauncherSettings[K] {
    return this.data[key];
  }

  set<K extends keyof LauncherSettings>(key: K, value: LauncherSettings[K]): void {
    this.data[key] = value;
    this.save();
  }
}
