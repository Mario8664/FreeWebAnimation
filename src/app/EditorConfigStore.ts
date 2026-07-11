export type GlobalEditorConfig = {
  activePageIndex: number;
};

const fallbackConfig: GlobalEditorConfig = {
  activePageIndex: 0,
};

type EditorConfigUrls = {
  config: string;
  saveConfig: string;
};

export class EditorConfigStore {
  private readonly urls: EditorConfigUrls = {
    config: '/assets/data/editor.json',
    saveConfig: '/__editor/config',
  };

  async load(): Promise<GlobalEditorConfig> {
    try {
      const response = await fetch(this.urls.config, { cache: 'no-store' });
      if (response.ok && isJsonResponse(response)) {
        return normalizeEditorConfig(await response.json() as Partial<GlobalEditorConfig>);
      }
    } catch (error) {
      console.warn('Failed to load global editor config. Using fallback settings.', error);
    }

    return { ...fallbackConfig };
  }

  async save(value: GlobalEditorConfig): Promise<void> {
    const response = await fetch(this.urls.saveConfig, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(normalizeEditorConfig(value)),
    });

    if (!response.ok) {
      throw new Error(`Failed to save global editor config: ${response.status}`);
    }
  }
}

function isJsonResponse(response: Response): boolean {
  return response.headers.get('content-type')?.includes('application/json') ?? false;
}

function normalizeEditorConfig(value: Partial<GlobalEditorConfig>): GlobalEditorConfig {
  return {
    activePageIndex: normalizePageIndex(value.activePageIndex),
  };
}

function normalizePageIndex(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallbackConfig.activePageIndex;
  }

  return Math.max(0, Math.floor(value));
}
