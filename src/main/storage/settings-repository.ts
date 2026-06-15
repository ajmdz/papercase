import type { DatabaseSync } from "node:sqlite";
import type {
  AppSettings,
  AppTheme,
  SettingsUpdateInput,
} from "../../shared/papercase-api";

type SettingRow = {
  value_json: string;
};

const defaultSettings: AppSettings = {
  theme: "system",
};

export class SettingsRepository {
  constructor(private readonly database: DatabaseSync) {}

  getSettings(): AppSettings {
    return {
      theme: this.getTheme(),
    };
  }

  updateSettings(input: SettingsUpdateInput): AppSettings {
    if (input.theme !== undefined) {
      this.setSetting("theme", input.theme);
    }

    return this.getSettings();
  }

  private getTheme(): AppTheme {
    const value = this.getSetting("theme");

    return isAppTheme(value) ? value : defaultSettings.theme;
  }

  private getSetting(key: string): unknown {
    const row = this.database
      .prepare("SELECT value_json FROM settings WHERE key = ?")
      .get(key) as SettingRow | undefined;

    if (!row) {
      return null;
    }

    try {
      return JSON.parse(row.value_json) as unknown;
    } catch {
      return null;
    }
  }

  private setSetting(key: string, value: unknown): void {
    const now = new Date().toISOString();

    this.database
      .prepare(
        `
          INSERT INTO settings (key, value_json, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(key, JSON.stringify(value), now);
  }
}

function isAppTheme(value: unknown): value is AppTheme {
  return value === "system" || value === "light" || value === "dark";
}
