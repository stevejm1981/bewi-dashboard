-- BEWI Howden Dashboard - Aggregates
--
-- These views power the dashboard. They are refreshed by a scheduled job
-- a few minutes after the sync completes. For the prototype they are
-- standard views (always fresh); they can be converted to materialised
-- views with a refresh schedule once volumes warrant it.

-- =========================================================================
-- Volume helper: line volume in m3
-- =========================================================================
-- Centralised volume calculation. NetM3 is authoritative; fall back to
-- dimensional calculation only when NetM3 is null.

create or replace function public.line_volume_m3(
  p_product_guid text,
  p_quantity numeric
) returns numeric as $$
declare
  v_net_m3 numeric;
  v_width numeric;
  v_height numeric;
  v_depth numeric;
begin
  if p_quantity is null or p_quantity = 0 then
    return 0;
  end if;

  select net_m3, width, height, depth
  into v_net_m3, v_width, v_height, v_depth
  from public.products
  where guid = p_product_guid;

  if v_net_m3 is not null and v_net_m3 > 0 then
    return v_net_m3 * p_quantity;
  end if;

  if v_width is not null and v_height is not null and v_depth is not null
     and v_width > 0 and v_height > 0 and v_depth > 0 then
    return v_width * v_height * v_depth * p_quantity;
  end if;

  return null;
end;
$$ language plpgsql stable;

-- =========================================================================
-- Howden filter helper
-- =========================================================================

create or replace function public.howden_warehouse_guid() returns text as $$
  select howden_warehouse_guid from public.bewi_config limit 1;
$$ language sql stable;

-- =========================================================================
-- Volume matrix - open SO demand by Product Group
-- =========================================================================

create or replace view public.v_open_so_volume_by_group as
select
  pg.guid as product_group_guid,
  pg.group_name,
  sum(coalesce(public.line_volume_m3(sol.product_guid, sol.order_quantity), 0)) as volume_m3,
  sum(coalesce(p.weight * sol.order_quantity, 0)) as weight_kg,
  sum(coalesce(sol.line_total, 0)) as net_sale_value,
  count(distinct so.guid) as order_count,
  count(sol.guid) as line_count
from public.sales_orders so
join public.sales_order_lines sol on sol.order_guid = so.guid
join public.products p on p.guid = sol.product_guid and p.is_active
join public.product_groups pg on pg.guid = p.product_group_guid
where so.warehouse_guid = public.howden_warehouse_guid()
  and so.order_status not in ('Completed')
group by pg.guid, pg.group_name;

-- =========================================================================
-- Volume matrix - in-stock by Product Group at Howden
-- =========================================================================

create or replace view public.v_stock_volume_by_group as
select
  pg.guid as product_group_guid,
  pg.group_name,
  sum(coalesce(public.line_volume_m3(soh.product_guid, soh.available_quantity), 0)) as volume_m3,
  sum(coalesce(p.weight * soh.available_quantity, 0)) as weight_kg,
  sum(soh.available_quantity) as units
from public.stock_on_hand soh
join public.products p on p.guid = soh.product_guid and p.is_active
join public.product_groups pg on pg.guid = p.product_group_guid
where soh.warehouse_guid = public.howden_warehouse_guid()
  and soh.available_quantity > 0
group by pg.guid, pg.group_name;

-- =========================================================================
-- Volume matrix - works order in-progress by Product Group AND cutting line
-- =========================================================================

create or replace view public.v_works_order_volume_by_group_cutting_line as
select
  pg.guid as product_group_guid,
  pg.group_name,
  wo.cutting_line,
  sum(coalesce(public.line_volume_m3(wo.product_guid, wo.quantity), 0)) as volume_m3,
  count(wo.works_order_id) as order_count
from public.works_orders wo
join public.products p on p.guid = wo.product_guid and p.is_active
join public.product_groups pg on pg.guid = p.product_group_guid
where wo.is_terminal = false
  and wo.missing_from_feed = false
group by pg.guid, pg.group_name, wo.cutting_line;

-- =========================================================================
-- Volume matrix - flattened headline view (one row per group, all columns)
-- =========================================================================

create or replace view public.v_volume_matrix as
with groups as (
  select distinct pg.guid, pg.group_name
  from public.product_groups pg
  where exists (
    select 1 from public.products p
    where p.product_group_guid = pg.guid and p.is_active
  )
)
select
  g.guid as product_group_guid,
  g.group_name,
  coalesce(d.volume_m3, 0) as demand_m3,
  coalesce(d.weight_kg, 0) as demand_kg,
  coalesce(d.net_sale_value, 0) as demand_value,
  coalesce(s.volume_m3, 0) as stock_m3,
  coalesce(sc.volume_m3, 0) as cutting_sc_m3,
  coalesce(fmcl.volume_m3, 0) as cutting_5mcl_m3,
  coalesce(lpc.volume_m3, 0) as cutting_lpc_m3,
  coalesce(spc.volume_m3, 0) as cutting_spc_m3
from groups g
left join public.v_open_so_volume_by_group d on d.product_group_guid = g.guid
left join public.v_stock_volume_by_group s on s.product_group_guid = g.guid
left join public.v_works_order_volume_by_group_cutting_line sc
  on sc.product_group_guid = g.guid and sc.cutting_line = 'SC'
left join public.v_works_order_volume_by_group_cutting_line fmcl
  on fmcl.product_group_guid = g.guid and fmcl.cutting_line = '5MCL'
left join public.v_works_order_volume_by_group_cutting_line lpc
  on lpc.product_group_guid = g.guid and lpc.cutting_line = 'LPC'
left join public.v_works_order_volume_by_group_cutting_line spc
  on spc.product_group_guid = g.guid and spc.cutting_line = 'SPC'
order by g.group_name;

-- =========================================================================
-- Cutting line capacity - daily throughput vs capacity
-- =========================================================================

create or replace view public.v_cutting_line_capacity as
with completed_today as (
  select
    cutting_line,
    sum(coalesce(public.line_volume_m3(product_guid, quantity), 0)) as completed_m3,
    count(*) as completed_count,
    max(completed_at) as last_completion_at
  from public.works_orders
  where completed_at >= current_date and completed_at < current_date + interval '1 day'
    and status = 'Completed'
  group by cutting_line
),
in_progress as (
  select
    cutting_line,
    sum(coalesce(public.line_volume_m3(product_guid, quantity), 0)) as in_progress_m3,
    count(*) as in_progress_count
  from public.works_orders
  where is_terminal = false and missing_from_feed = false
  group by cutting_line
),
capacities as (
  select
    key as cutting_line,
    value::numeric as daily_capacity_m3
  from public.bewi_config, jsonb_each_text(cutting_line_capacity_m3)
)
select
  c.cutting_line,
  c.daily_capacity_m3,
  coalesce(ct.completed_m3, 0) as completed_today_m3,
  coalesce(ct.completed_count, 0) as completed_today_count,
  coalesce(ip.in_progress_m3, 0) as in_progress_m3,
  coalesce(ip.in_progress_count, 0) as in_progress_count,
  greatest(c.daily_capacity_m3 - coalesce(ct.completed_m3, 0), 0) as remaining_capacity_m3,
  ct.last_completion_at,
  case
    when ct.last_completion_at is null then null
    when ct.last_completion_at > now() - interval '30 minutes' then 'active'
    else 'static'
  end as throughput_state
from capacities c
left join completed_today ct on ct.cutting_line = c.cutting_line
left join in_progress ip on ip.cutting_line = c.cutting_line
order by c.cutting_line;

-- =========================================================================
-- Sales order timeline - open SO volume by expected ship date
-- =========================================================================

create or replace view public.v_so_timeline as
select
  so.required_date,
  pg.group_name,
  sum(coalesce(public.line_volume_m3(sol.product_guid, sol.order_quantity), 0)) as volume_m3,
  count(distinct so.guid) as order_count
from public.sales_orders so
join public.sales_order_lines sol on sol.order_guid = so.guid
join public.products p on p.guid = sol.product_guid and p.is_active
join public.product_groups pg on pg.guid = p.product_group_guid
where so.warehouse_guid = public.howden_warehouse_guid()
  and so.order_status not in ('Completed')
  and so.required_date is not null
group by so.required_date, pg.group_name
order by so.required_date, pg.group_name;

-- =========================================================================
-- Works order timeline - in-progress by cutting line and expected completion
-- =========================================================================

create or replace view public.v_works_order_timeline as
select
  date(expected_completion_at) as expected_date,
  cutting_line,
  sum(coalesce(public.line_volume_m3(product_guid, quantity), 0)) as volume_m3,
  count(*) as order_count
from public.works_orders
where is_terminal = false
  and missing_from_feed = false
  and expected_completion_at is not null
group by date(expected_completion_at), cutting_line
order by expected_date, cutting_line;

-- =========================================================================
-- Expected to ship - open shipments by required date
-- =========================================================================

create or replace view public.v_expected_to_ship as
select
  ss.guid as shipment_guid,
  ss.shipment_number,
  ss.required_date,
  ss.shipment_status,
  c.customer_name,
  ss.carrier_name,
  ss.shipment_method,
  pg.group_name as product_group,
  sum(coalesce(public.line_volume_m3(ssl.product_guid, ssl.shipped_quantity), 0)) as volume_m3,
  sum(coalesce(p.weight * ssl.shipped_quantity, 0)) as weight_kg,
  sum(coalesce(ssl.line_total, 0)) as line_total
from public.sales_shipments ss
join public.sales_shipment_lines ssl on ssl.shipment_guid = ss.guid
join public.products p on p.guid = ssl.product_guid and p.is_active
join public.product_groups pg on pg.guid = p.product_group_guid
left join public.customers c on c.guid = ss.customer_guid
where ss.warehouse_guid = public.howden_warehouse_guid()
  and ss.shipment_status not in ('Dispatched')
group by ss.guid, ss.shipment_number, ss.required_date, ss.shipment_status,
         c.customer_name, ss.carrier_name, ss.shipment_method, pg.group_name
order by ss.required_date nulls last, ss.shipment_number;

-- =========================================================================
-- Carrier view - shipment volume by carrier
-- Important: volume is calculated from shipped quantity, not parent
-- order total. This is the fix vs the existing Power BI flaw.
-- =========================================================================

create or replace view public.v_carrier_volume as
select
  coalesce(ss.carrier_name, 'Unspecified') as carrier_name,
  ss.shipment_status,
  count(distinct ss.guid) as shipment_count,
  sum(coalesce(public.line_volume_m3(ssl.product_guid, ssl.shipped_quantity), 0)) as volume_m3,
  sum(coalesce(p.weight * ssl.shipped_quantity, 0)) as weight_kg
from public.sales_shipments ss
join public.sales_shipment_lines ssl on ssl.shipment_guid = ss.guid
join public.products p on p.guid = ssl.product_guid and p.is_active
where ss.warehouse_guid = public.howden_warehouse_guid()
  and ss.shipment_status not in ('Dispatched')
group by ss.carrier_name, ss.shipment_status
order by volume_m3 desc;

-- =========================================================================
-- Data quality - products missing volume data
-- =========================================================================

create or replace view public.v_data_quality_missing_volume as
select
  p.product_code,
  p.product_description,
  pg.group_name as product_group,
  p.cutting_line,
  p.net_m3,
  p.width, p.height, p.depth,
  case
    when p.net_m3 is null and (p.width is null or p.height is null or p.depth is null) then 'No volume data'
    when p.net_m3 is null then 'NetM3 missing, using dimensional fallback'
    when p.width is null or p.height is null or p.depth is null then 'Dimensions incomplete'
  end as issue
from public.products p
left join public.product_groups pg on pg.guid = p.product_group_guid
where p.is_active
  and (
    p.net_m3 is null
    or p.width is null or p.height is null or p.depth is null
  );

-- =========================================================================
-- Sync status - last successful sync per entity
-- =========================================================================

create or replace view public.v_sync_status as
select
  entity,
  max(completed_at) filter (where status = 'success') as last_success_at,
  max(started_at) as last_attempt_at,
  (
    select status from public.sync_runs sr2
    where sr2.entity = sr.entity
    order by started_at desc
    limit 1
  ) as last_status
from public.sync_runs sr
group by entity;
