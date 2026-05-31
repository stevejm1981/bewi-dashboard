/**
 * BEWI configuration accessor. Reads from the bewi_config table at runtime
 * so warehouse GUID and capacity values can be changed without redeploying.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/server';

export interface BewiConfig {
  howdenWarehouseGuid: string;
  howdenWarehouseCode: string;
  businessUnitName: string;
  cuttingLineCapacityM3: Record<'SC' | '5MCL' | 'LPC' | 'SPC', number>;
  staticThroughputThresholdMinutes: number;
}

let cached: { value: BewiConfig; fetchedAt: number } | null = null;
const TTL_MS = 60_000;

export async function getBewiConfig(): Promise<BewiConfig> {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.value;
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('bewi_config')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to read bewi_config: ${error.message}`);
  if (!data) throw new Error('bewi_config has no rows. Run the seed migration.');

  const value: BewiConfig = {
    howdenWarehouseGuid: data.howden_warehouse_guid,
    howdenWarehouseCode: data.howden_warehouse_code,
    businessUnitName: data.business_unit_name,
    cuttingLineCapacityM3: data.cutting_line_capacity_m3,
    staticThroughputThresholdMinutes: data.static_throughput_threshold_minutes,
  };

  cached = { value, fetchedAt: Date.now() };
  return value;
}

export function invalidateBewiConfigCache() {
  cached = null;
}
