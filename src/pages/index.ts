import type { DeckPageLoader } from '../app/Page';

export type PageRegistryEntry = {
  id: string;
  title: string;
  subtitle: string;
  exportable: boolean;
  defaultDuration: number;
  defaultFps: number;
  defaultSize: {
    width: number;
    height: number;
  };
  load: DeckPageLoader;
};

const DEFAULT_EXPORT_SIZE = {
  width: 1920,
  height: 1080,
};

const DEFAULT_EXPORT_FPS = 60;
const DEFAULT_EXPORT_DURATION = 8;

export const pageRegistry: PageRegistryEntry[] = [
  {
    id: 'pbr-showcase',
    title: 'PBR Showcase',
    subtitle: 'A reusable Three.js page using the shared PBR, GTAO, lighting, and animation shell.',
    exportable: true,
    defaultDuration: DEFAULT_EXPORT_DURATION,
    defaultFps: DEFAULT_EXPORT_FPS,
    defaultSize: DEFAULT_EXPORT_SIZE,
    load: async () => new (await import('./examples/PbrShowcasePage')).PbrShowcasePage(),
  },
  {
    id: 'template-page',
    title: 'Template Page',
    subtitle: 'A minimal DOM page template for new animation scenes.',
    exportable: false,
    defaultDuration: DEFAULT_EXPORT_DURATION,
    defaultFps: DEFAULT_EXPORT_FPS,
    defaultSize: DEFAULT_EXPORT_SIZE,
    load: async () => new (await import('./_template/TemplatePage')).TemplatePage(),
  },
];

export const pageLoaders: DeckPageLoader[] = pageRegistry.map((entry) => entry.load);
