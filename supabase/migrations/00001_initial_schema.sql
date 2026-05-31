-- BEWI Howden Volume Reporting Dashboard
-- Initial schema migration
--
-- Tables follow conventions from the BEWI PO Boards app:
--   id uuid primary key default gen_random_uuid()
--   created_at timestamptz default now()
--   updated_at timestamptz default now()
--   RLS enabled on every table

create extension if not exists "uuid-ossp";

-- =========================================================================
-- Configuration
-- =========================================================================

create table public.bewi_config (
  id uuid primary key default gen_random_uuid(),
  howden_warehouse_guid text not null,
  howden_warehouse_code text not null default 'S03',
  business_unit_name text not null default 'BEWI Insulation and Construction Ltd',
  cutting_line_capacity_m3 jsonb not null default
    '{"SC": 1500, "5MCL": 1200, "LPC": 1000, "SPC": 800}'::jsonb,
  static_throughput_threshold_minutes int not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.bewi_config is 'Single-row configuration for BEWI Howden dashboard. Howden warehouse GUID, cutting line capacities, thresholds.';

-- =========================================================================
-- Reference data (synced from Unleashed)
-- =========================================================================

create table public.warehouses (
  guid text primary key,
  warehouse_code text not null,
  warehouse_name text not null,
  obsolete boolean not null default false,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_warehouses_code on public.warehouses(warehouse_code);

create table public.product_groups (
  guid text primary key,
  group_name text not null,
  parent_group_guid text,
  last_modified_on timestamptz,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_product_groups_name on public.product_groups(group_name);

create table public.customers (
  guid text primary key,
  customer_code text not null,
  customer_name text not null,
  obsolete boolean not null default false,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_customers_name on public.customers(customer_name);

-- =========================================================================
-- Products
-- =========================================================================
-- Denormalised convenience columns (cutting_line, net_m3, is_active) live
-- alongside the raw API fields for query performance. Full attribute set
-- is stored in product_attributes for flexibility.

create table public.products (
  guid text primary key,
  product_code text not null unique,
  product_description text,
  product_group_guid text references public.product_groups(guid),
  width numeric,
  height numeric,
  depth numeric,
  weight numeric,
  pack_size numeric,
  unit_of_measure text,
  is_sellable boolean not null default true,
  obsolete boolean not null default false,
  -- Denormalised from attributes for query speed
  net_m3 numeric,
  cutting_line text check (cutting_line in ('SC', '5MCL', 'LPC', 'SPC') or cutting_line is null),
  -- Computed active flag
  is_active boolean generated always as (is_sellable and not obsolete) stored,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_products_active on public.products(is_active) where is_active;
create index idx_products_group on public.products(product_group_guid);
create index idx_products_cutting_line on public.products(cutting_line);
create index idx_products_code on public.products(product_code);

comment on column public.products.net_m3 is 'Authoritative cubic volume per unit, sourced from NetM3 product attribute. Falls back to width*height*depth when null.';
comment on column public.products.cutting_line is 'Sourced from the Category product attribute. Values: SC, 5MCL, LPC, SPC.';

create table public.product_attributes (
  product_guid text references public.products(guid) on delete cascade,
  attribute_name text not null,
  attribute_value text,
  attribute_guid text,
  is_required boolean not null default false,
  primary key (product_guid, attribute_name)
);

create index idx_product_attributes_name on public.product_attributes(attribute_name);

-- Warehouse-specific product info (bin locations, alert levels)
create table public.product_warehouse_info (
  product_guid text references public.products(guid) on delete cascade,
  warehouse_guid text references public.warehouses(guid),
  bin_location text,
  min_stock_alert numeric,
  max_stock_alert numeric,
  primary key (product_guid, warehouse_guid)
);

-- =========================================================================
-- Sales orders
-- =========================================================================

create table public.sales_orders (
  guid text primary key,
  order_number text not null,
  order_status text not null,
  customer_guid text references public.customers(guid),
  warehouse_guid text references public.warehouses(guid),
  order_date date,
  required_date date,
  sub_total numeric,
  tax_total numeric,
  total numeric,
  currency_code text,
  last_modified_on timestamptz,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sales_orders_warehouse on public.sales_orders(warehouse_guid);
create index idx_sales_orders_status on public.sales_orders(order_status);
create index idx_sales_orders_required_date on public.sales_orders(required_date);

create table public.sales_order_lines (
  guid text primary key,
  order_guid text not null references public.sales_orders(guid) on delete cascade,
  product_guid text references public.products(guid),
  line_number int,
  order_quantity numeric not null,
  unit_price numeric,
  line_total numeric,
  line_tax numeric,
  comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sales_order_lines_order on public.sales_order_lines(order_guid);
create index idx_sales_order_lines_product on public.sales_order_lines(product_guid);

-- =========================================================================
-- Sales shipments
-- =========================================================================

create table public.sales_shipments (
  guid text primary key,
  shipment_number text not null,
  shipment_status text not null,
  order_guid text references public.sales_orders(guid),
  order_number text,
  customer_guid text references public.customers(guid),
  warehouse_guid text references public.warehouses(guid),
  carrier_name text,
  shipment_method text,
  required_date date,
  shipment_date date,
  last_modified_on timestamptz,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sales_shipments_warehouse on public.sales_shipments(warehouse_guid);
create index idx_sales_shipments_status on public.sales_shipments(shipment_status);
create index idx_sales_shipments_carrier on public.sales_shipments(carrier_name);
create index idx_sales_shipments_required_date on public.sales_shipments(required_date);

create table public.sales_shipment_lines (
  guid text primary key,
  shipment_guid text not null references public.sales_shipments(guid) on delete cascade,
  product_guid text references public.products(guid),
  order_line_guid text,
  line_number int,
  shipped_quantity numeric not null,
  unit_price numeric,
  line_total numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sales_shipment_lines_shipment on public.sales_shipment_lines(shipment_guid);
create index idx_sales_shipment_lines_product on public.sales_shipment_lines(product_guid);

-- =========================================================================
-- Stock on hand
-- =========================================================================

create table public.stock_on_hand (
  product_guid text references public.products(guid) on delete cascade,
  warehouse_guid text references public.warehouses(guid),
  available_quantity numeric not null default 0,
  on_hand_quantity numeric not null default 0,
  allocated_quantity numeric not null default 0,
  last_synced_at timestamptz not null default now(),
  primary key (product_guid, warehouse_guid)
);

create index idx_stock_warehouse on public.stock_on_hand(warehouse_guid);

-- =========================================================================
-- Works orders (ingested from Works Order App)
-- =========================================================================

create table public.works_orders (
  works_order_id text primary key,
  sku text not null,
  product_guid text references public.products(guid),
  quantity numeric not null,
  cutting_line text not null check (cutting_line in ('SC', '5MCL', 'LPC', 'SPC')),
  status text not null,
  is_terminal boolean generated always as (status in ('Completed', 'Cancelled', 'Rejected')) stored,
  app_created_at timestamptz,
  expected_completion_at timestamptz,
  completed_at timestamptz,
  missing_from_feed boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_works_orders_cutting_line on public.works_orders(cutting_line);
create index idx_works_orders_status on public.works_orders(status);
create index idx_works_orders_terminal on public.works_orders(is_terminal);
create index idx_works_orders_completion on public.works_orders(expected_completion_at);

create table public.works_order_quarantine (
  id uuid primary key default gen_random_uuid(),
  works_order_id text,
  sku text,
  raw_row jsonb not null,
  failure_reason text not null,
  ingest_run_id uuid,
  created_at timestamptz not null default now()
);

create table public.works_order_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  row_count int,
  upserted_count int,
  quarantined_count int,
  marked_missing_count int,
  source_ip text,
  error text
);

-- =========================================================================
-- Sync tracking
-- =========================================================================

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  trigger text not null check (trigger in ('scheduled', 'manual', 'reconciliation')),
  triggered_by_user uuid,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'failed', 'partial')),
  records_processed int,
  records_upserted int,
  pages_processed int,
  error text
);

create index idx_sync_runs_entity on public.sync_runs(entity);
create index idx_sync_runs_started on public.sync_runs(started_at desc);

-- Checkpoints for resumable paginated sync
create table public.sync_checkpoints (
  entity text primary key,
  last_completed_page int,
  last_modified_cursor timestamptz,
  in_progress boolean not null default false,
  started_at timestamptz,
  updated_at timestamptz not null default now()
);

-- =========================================================================
-- Audit
-- =========================================================================

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text,
  event_type text not null,
  actor_user_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_entity on public.audit_events(entity_type, entity_id);
create index idx_audit_created on public.audit_events(created_at desc);

-- =========================================================================
-- Updated_at trigger
-- =========================================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply to all tables that have updated_at
do $$
declare
  t text;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'updated_at'
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end $$;
