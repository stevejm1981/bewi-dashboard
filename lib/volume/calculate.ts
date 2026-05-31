/**
 * Centralised volume calculation.
 *
 * NetM3 is the confirmed authoritative figure for the dashboard. Dimensional
 * calculation (Width × Height × Depth) is only a fallback when NetM3 is null,
 * empty, or unparseable.
 *
 * Do not inline-calculate volume anywhere else in the codebase. Use this
 * utility or its database equivalent (line_volume_m3 SQL function).
 */

export interface VolumeInputs {
  netM3?: number | string | null;
  width?: number | null;
  height?: number | null;
  depth?: number | null;
}

export type VolumeSource = 'netM3' | 'dimensional' | 'unavailable';

export interface VolumeResult {
  volumePerUnit: number | null;
  source: VolumeSource;
}

export function resolveProductVolumePerUnit(inputs: VolumeInputs): VolumeResult {
  // NetM3 first - it is the authoritative figure
  if (inputs.netM3 !== null && inputs.netM3 !== undefined && inputs.netM3 !== '') {
    const parsed = typeof inputs.netM3 === 'string' ? Number.parseFloat(inputs.netM3) : inputs.netM3;
    if (!Number.isNaN(parsed) && parsed > 0) {
      return { volumePerUnit: parsed, source: 'netM3' };
    }
  }

  // Dimensional fallback - all three dimensions must be present and positive
  const { width, height, depth } = inputs;
  if (
    width !== null && width !== undefined && width > 0 &&
    height !== null && height !== undefined && height > 0 &&
    depth !== null && depth !== undefined && depth > 0
  ) {
    return { volumePerUnit: width * height * depth, source: 'dimensional' };
  }

  return { volumePerUnit: null, source: 'unavailable' };
}

export function lineVolumeM3(inputs: VolumeInputs, quantity: number): number | null {
  const result = resolveProductVolumePerUnit(inputs);
  if (result.volumePerUnit === null) return null;
  if (quantity === 0 || Number.isNaN(quantity)) return 0;
  return result.volumePerUnit * quantity;
}

export function formatM3(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return value.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatKg(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return value.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatGBP(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return value.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
}
