type RgbColor = {
  r: number;
  g: number;
  b: number;
};

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

export function interpolateHexColor(from: string, to: string, progress: number): string {
  const fromRgb = parseHexColor(from);
  const toRgb = parseHexColor(to);
  if (!fromRgb || !toRgb) {
    return from;
  }

  const amount = clamp01(progress);
  return formatHexColor({
    r: fromRgb.r + (toRgb.r - fromRgb.r) * amount,
    g: fromRgb.g + (toRgb.g - fromRgb.g) * amount,
    b: fromRgb.b + (toRgb.b - fromRgb.b) * amount,
  });
}

function parseHexColor(value: string): RgbColor | null {
  if (!isHexColor(value)) {
    return null;
  }

  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

function formatHexColor(color: RgbColor): string {
  return `#${formatChannel(color.r)}${formatChannel(color.g)}${formatChannel(color.b)}`;
}

function formatChannel(value: number): string {
  return clampByte(Math.round(value)).toString(16).padStart(2, '0');
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
