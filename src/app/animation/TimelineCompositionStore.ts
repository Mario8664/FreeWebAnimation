import {
  cloneTimelineComposition,
  createEmptyTimelineComposition,
  normalizeTimelineComposition,
  type TimelineComposition,
} from './TimelineComposition';

type TimelineCompositionStoreUrls = {
  timeline: string;
  saveTimeline: string;
};

export class TimelineCompositionStore {
  private readonly sceneId: string;
  private readonly urls: TimelineCompositionStoreUrls;

  constructor(sceneId: string) {
    this.sceneId = sceneId;
    this.urls = createTimelineCompositionUrls(sceneId);
  }

  async loadTimeline(): Promise<TimelineComposition> {
    let value = createEmptyTimelineComposition(this.sceneId);

    try {
      const response = await fetch(this.urls.timeline, { cache: 'no-store' });
      if (response.ok && isJsonResponse(response)) {
        value = normalizeTimelineComposition(this.sceneId, await response.json() as Partial<TimelineComposition>);
      }
    } catch (error) {
      console.warn('Failed to load timeline composition. Using fallback timeline.', error);
    }

    return value;
  }

  async saveTimeline(value: TimelineComposition): Promise<void> {
    const response = await fetch(this.urls.saveTimeline, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cloneTimelineComposition(value)),
    });

    if (!response.ok) {
      throw new Error(`Failed to save timeline composition: ${response.status}`);
    }
  }
}

function isJsonResponse(response: Response): boolean {
  return response.headers.get('content-type')?.includes('application/json') ?? false;
}

function createTimelineCompositionUrls(sceneId: string): TimelineCompositionStoreUrls {
  const encodedSceneId = encodeURIComponent(sceneId);

  return {
    timeline: `/assets/animations/${encodedSceneId}.timeline.json`,
    saveTimeline: `/__editor/animations/${encodedSceneId}/timeline`,
  };
}
