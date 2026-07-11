export type TimelineStep = {
  id: string;
  duration: number;
};

export type TimelineState = {
  step: TimelineStep;
  index: number;
  localTime: number;
  progress: number;
  elapsedBeforeStep: number;
};

export class Timeline {
  private readonly steps: TimelineStep[];
  private readonly totalDuration: number;

  constructor(steps: TimelineStep[]) {
    if (steps.length === 0) {
      throw new Error('Timeline requires at least one step.');
    }

    for (const step of steps) {
      if (step.duration <= 0) {
        throw new Error(`Timeline step "${step.id}" must have a positive duration.`);
      }
    }

    this.steps = steps;
    this.totalDuration = steps.reduce((total, step) => total + step.duration, 0);
  }

  get duration(): number {
    return this.totalDuration;
  }

  at(timeSeconds: number, options: { loop?: boolean } = {}): TimelineState {
    const normalizedTime = this.normalizeTime(timeSeconds, options.loop ?? false);
    let cursor = 0;

    for (let index = 0; index < this.steps.length; index += 1) {
      const step = this.steps[index]!;
      const nextCursor = cursor + step.duration;
      const isLastStep = index === this.steps.length - 1;

      if (normalizedTime < nextCursor || isLastStep) {
        const localTime = Math.min(step.duration, Math.max(0, normalizedTime - cursor));
        return {
          step,
          index,
          localTime,
          progress: localTime / step.duration,
          elapsedBeforeStep: cursor,
        };
      }

      cursor = nextCursor;
    }

    throw new Error('Timeline state could not be resolved.');
  }

  private normalizeTime(timeSeconds: number, loop: boolean): number {
    const safeTime = Math.max(0, timeSeconds);

    if (!loop) {
      return Math.min(safeTime, this.totalDuration);
    }

    return safeTime % this.totalDuration;
  }
}
