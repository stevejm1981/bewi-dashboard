-- Seed BEWI config with the confirmed Howden warehouse GUID
-- Replace the GUID below with the actual value from your environment if different.

insert into public.bewi_config (howden_warehouse_guid, howden_warehouse_code, business_unit_name)
values (
  '5fdfc2ce-d926-4cd0-90d2-3a2048c523bf',
  'S03',
  'BEWI Insulation and Construction Ltd'
)
on conflict do nothing;
