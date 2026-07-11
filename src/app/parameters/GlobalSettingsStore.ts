export type GlobalSettingsStoreOptions<TSettings extends object> = {
  fileName: string;
  createFallbackSettings: () => TSettings;
  mergeSettings: (base: TSettings, override: Partial<TSettings>) => TSettings;
};

type GlobalSettingsUrls = {
  settings: string;
  saveSettings: string;
};

export class GlobalSettingsStore<TSettings extends object> {
  private readonly options: GlobalSettingsStoreOptions<TSettings>;
  private readonly urls: GlobalSettingsUrls;

  constructor(options: GlobalSettingsStoreOptions<TSettings>) {
    this.options = options;
    this.urls = {
      settings: `/assets/data/${options.fileName}`,
      saveSettings: `/__editor/assets/data/${options.fileName}`,
    };
  }

  async load(): Promise<TSettings> {
    let value = this.options.createFallbackSettings();

    try {
      const response = await fetch(this.urls.settings, { cache: 'no-store' });
      if (response.ok && isJsonResponse(response)) {
        value = this.options.mergeSettings(value, await response.json() as Partial<TSettings>);
      }
    } catch (error) {
      console.warn('Failed to load global settings. Using fallback settings.', error);
    }

    return value;
  }

  async save(value: TSettings): Promise<void> {
    const response = await fetch(this.urls.saveSettings, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(value),
    });

    if (!response.ok) {
      throw new Error(`Failed to save global settings: ${response.status}`);
    }
  }
}

function isJsonResponse(response: Response): boolean {
  return response.headers.get('content-type')?.includes('application/json') ?? false;
}
