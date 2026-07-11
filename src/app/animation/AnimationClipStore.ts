import {
  cloneClipLibrary,
  createEmptyClipLibrary,
  normalizeClipLibrary,
  type AnimationClipLibrary,
} from './AnimationClip';

type AnimationClipStoreUrls = {
  clipLibrary: string;
  saveClipLibrary: string;
};

export class AnimationClipStore {
  private readonly sceneId: string;
  private readonly urls: AnimationClipStoreUrls;

  constructor(sceneId: string) {
    this.sceneId = sceneId;
    this.urls = createAnimationClipUrls(sceneId);
  }

  async loadClipLibrary(): Promise<AnimationClipLibrary> {
    let value = createEmptyClipLibrary(this.sceneId);

    try {
      const response = await fetch(this.urls.clipLibrary, { cache: 'no-store' });
      if (response.ok && isJsonResponse(response)) {
        value = normalizeClipLibrary(this.sceneId, await response.json() as Partial<AnimationClipLibrary>);
      }
    } catch (error) {
      console.warn('Failed to load animation clip library. Using fallback clip.', error);
    }

    return value;
  }

  async saveClipLibrary(value: AnimationClipLibrary): Promise<void> {
    const response = await fetch(this.urls.saveClipLibrary, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cloneClipLibrary(value)),
    });

    if (!response.ok) {
      throw new Error(`Failed to save animation clips: ${response.status}`);
    }
  }
}

function isJsonResponse(response: Response): boolean {
  return response.headers.get('content-type')?.includes('application/json') ?? false;
}

function createAnimationClipUrls(sceneId: string): AnimationClipStoreUrls {
  const encodedSceneId = encodeURIComponent(sceneId);

  return {
    clipLibrary: `/assets/animations/${encodedSceneId}.animation.json`,
    saveClipLibrary: `/__editor/animations/${encodedSceneId}/clips`,
  };
}
