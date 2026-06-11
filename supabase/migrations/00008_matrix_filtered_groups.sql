-- Volume Matrix view: exclude product groups per Lee's request (10 Jun 2026)
-- Space-stripped uppercase comparison catches naming variations.

drop view if exists v_volume_matrix;

create view v_volume_matrix as
select
  pg.guid as product_group_guid,
  pg.group_name,
  coalesce(d.volume_m3, 0) as demand_m3,
  coalesce(d.weight_kg, 0) as demand_kg,
  coalesce(d.net_sale_value, 0) as demand_value,
  coalesce(s.stock_m3, 0) as stock_m3,
  coalesce(wo.cutting_sc_m3, 0) as cutting_sc_m3,
  coalesce(wo.cutting_5mcl_m3, 0) as cutting_5mcl_m3,
  coalesce(wo.cutting_lpc_m3, 0) as cutting_lpc_m3,
  coalesce(wo.cutting_spc_m3, 0) as cutting_spc_m3
from product_groups pg
left join v_open_so_volume_by_group d on d.product_group_guid = pg.guid
left join v_stock_volume_by_group s on s.product_group_guid = pg.guid
left join (
  select
    product_group_guid,
    sum(case when cutting_line = 'SC' then volume_m3 else 0 end) as cutting_sc_m3,
    sum(case when cutting_line = '5MCL' then volume_m3 else 0 end) as cutting_5mcl_m3,
    sum(case when cutting_line = 'LPC' then volume_m3 else 0 end) as cutting_lpc_m3,
    sum(case when cutting_line = 'SPC' then volume_m3 else 0 end) as cutting_spc_m3
  from v_works_order_volume_by_group_cutting_line
  group by product_group_guid
) wo on wo.product_group_guid = pg.guid
where upper(replace(pg.group_name, ' ', '')) not in (
  'BEAD', 'BIP', 'CONSUMABLES', 'FREIGHTJAB', 'FRI', 'FRIAVM',
  'FRIUPSTANDBOARD', 'FRIWFRLF/MEMBRANE', 'JACKONANCILLARY',
  'JACKONCONSTRUCTIONBOARD', 'JACKONSHOWERBOARD', 'MISCJAB',
  'MISCJACKON', 'NONSTOCKPURCHASE', 'NONSTOCKPURCHASES', 'PREFOAM',
  'RECYCLING-CARD', 'RECYCLING-REPS', 'RECYCLING-RPE', 'RECYCLING-RPP'
)
order by pg.group_name;

grant select on v_volume_matrix to authenticated, anon;
notify pgrst, 'reload schema';
