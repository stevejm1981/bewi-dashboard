-- BEWI Howden Dashboard - RLS Policies
--
-- Single-tenant deployment for BEWI I&C. All authenticated users have
-- full read access; mutations (sync, ingestion) happen via service-role
-- backend code only.

alter table public.bewi_config enable row level security;
alter table public.warehouses enable row level security;
alter table public.product_groups enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.product_attributes enable row level security;
alter table public.product_warehouse_info enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;
alter table public.sales_shipments enable row level security;
alter table public.sales_shipment_lines enable row level security;
alter table public.stock_on_hand enable row level security;
alter table public.works_orders enable row level security;
alter table public.works_order_quarantine enable row level security;
alter table public.works_order_ingest_runs enable row level security;
alter table public.sync_runs enable row level security;
alter table public.sync_checkpoints enable row level security;
alter table public.audit_events enable row level security;

-- All authenticated users can read everything (single-tenant by design)
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'create policy "authenticated read %I"
        on public.%I for select to authenticated using (true)',
      t, t
    );
  end loop;
end $$;

-- No client-side insert/update/delete policies are created. All mutations
-- happen via service-role connections in backend route handlers. This
-- keeps the surface area small and avoids accidental data tampering.
