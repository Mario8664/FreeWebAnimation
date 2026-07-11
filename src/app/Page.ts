export type PageMeta = {
  id: string;
  title: string;
  subtitle: string;
};

export type PageContext = {
  host: HTMLDivElement;
  parameterHost: HTMLDivElement;
  animationHost: HTMLDivElement;
  animationTabHost: HTMLDivElement;
  axisHost: HTMLDivElement;
  globalParameters: GlobalParameterRegistry;
};

export type GlobalParameterListener<TSettings extends object> = (settings: TSettings) => void;

export type GlobalParameterHandle<TSettings extends object> = {
  getSettings(): TSettings;
  subscribe(listener: GlobalParameterListener<TSettings>): () => void;
};

export type GlobalParameterRegistry = {
  get<TSettings extends object>(id: string): GlobalParameterHandle<TSettings> | null;
};

export const EMPTY_GLOBAL_PARAMETER_REGISTRY: GlobalParameterRegistry = {
  get: () => null,
};

export interface DeckPage {
  readonly meta: PageMeta;
  mount(context: PageContext): void;
  update(timeSeconds: number, deltaSeconds: number): void;
  resize(width: number, height: number): void;
  unmount(): void;
}

export type DeckPageLoader = () => Promise<DeckPage>;
