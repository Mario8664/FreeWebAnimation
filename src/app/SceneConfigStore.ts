export type SceneConfigStoreOptions<SceneConfig, EditorConfig> = {
  sceneId: string;
  createSceneFallback: () => SceneConfig;
  createEditorFallback: () => EditorConfig;
  mergeSceneConfig: (base: SceneConfig, override: Partial<SceneConfig>) => SceneConfig;
  mergeEditorConfig: (base: EditorConfig, override: Partial<EditorConfig>) => EditorConfig;
};

type SceneConfigUrls = {
  sceneConfig: string;
  editorConfig: string;
  saveSceneConfig: string;
  saveEditorConfig: string;
};

export class SceneConfigStore<SceneConfig, EditorConfig> {
  private readonly options: SceneConfigStoreOptions<SceneConfig, EditorConfig>;
  private readonly urls: SceneConfigUrls;

  constructor(options: SceneConfigStoreOptions<SceneConfig, EditorConfig>) {
    this.options = options;
    this.urls = createSceneConfigUrls(options.sceneId);
  }

  loadSceneConfig(): Promise<SceneConfig> {
    return loadJson(
      this.urls.sceneConfig,
      this.options.createSceneFallback,
      this.options.mergeSceneConfig,
      'scene config',
    );
  }

  loadEditorConfig(): Promise<EditorConfig> {
    return loadJson(
      this.urls.editorConfig,
      this.options.createEditorFallback,
      this.options.mergeEditorConfig,
      'editor config',
    );
  }

  saveSceneConfig(value: SceneConfig): Promise<void> {
    return saveJson(this.urls.saveSceneConfig, value);
  }

  saveEditorConfig(value: EditorConfig): Promise<void> {
    return saveJson(this.urls.saveEditorConfig, value);
  }
}

function createSceneConfigUrls(sceneId: string): SceneConfigUrls {
  const encodedSceneId = encodeURIComponent(sceneId);

  return {
    sceneConfig: `/assets/data/${encodedSceneId}.json`,
    editorConfig: `/assets/data/${encodedSceneId}.editor.json`,
    saveSceneConfig: `/__editor/scenes/${encodedSceneId}/config`,
    saveEditorConfig: `/__editor/scenes/${encodedSceneId}/editor-config`,
  };
}

async function loadJson<T>(
  url: string,
  createFallback: () => T,
  merge: (base: T, override: Partial<T>) => T,
  label: string,
): Promise<T> {
  let value = createFallback();

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (response.ok && isJsonResponse(response)) {
      value = merge(value, await response.json() as Partial<T>);
    }
  } catch (error) {
    console.warn(`Failed to load ${label}. Using fallback settings.`, error);
  }

  return value;
}

function isJsonResponse(response: Response): boolean {
  return response.headers.get('content-type')?.includes('application/json') ?? false;
}

async function saveJson(url: string, value: unknown): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  });

  if (!response.ok) {
    throw new Error(`Failed to save JSON: ${response.status}`);
  }
}
