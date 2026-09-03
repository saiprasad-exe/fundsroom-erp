-- Fundsroom Mini ERP + CRM — relational schema (PostgreSQL)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS challan_items CASCADE;
DROP TABLE IF EXISTS challans CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS follow_ups CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS app_role CASCADE;
DROP TYPE IF EXISTS customer_type CASCADE;
DROP TYPE IF EXISTS customer_status CASCADE;
DROP TYPE IF EXISTS movement_type CASCADE;
DROP TYPE IF EXISTS challan_status CASCADE;

CREATE TYPE app_role AS ENUM ('ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTS');
CREATE TYPE customer_type AS ENUM ('RETAIL', 'WHOLESALE', 'DISTRIBUTOR');
CREATE TYPE customer_status AS ENUM ('LEAD', 'ACTIVE', 'INACTIVE');
CREATE TYPE movement_type AS ENUM ('IN', 'OUT');
CREATE TYPE challan_status AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- Users (bcrypt password hashes; roles are a first-class column on their own table row)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          app_role NOT NULL DEFAULT 'SALES',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- CRM
CREATE TABLE customers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name  TEXT NOT NULL,
  mobile_number  TEXT NOT NULL,
  email          TEXT,
  business_name  TEXT,
  gst_number     TEXT,
  customer_type  customer_type NOT NULL DEFAULT 'RETAIL',
  address        TEXT,
  status         customer_status NOT NULL DEFAULT 'LEAD',
  follow_up_date DATE,
  notes          TEXT,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customers_mobile_format CHECK (mobile_number ~ '^[6-9][0-9]{9}$')
);
CREATE INDEX customers_name_idx ON customers (lower(customer_name));
CREATE INDEX customers_mobile_idx ON customers (mobile_number);
CREATE INDEX customers_status_idx ON customers (status);
CREATE TRIGGER customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE follow_ups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  note           TEXT NOT NULL,
  follow_up_date DATE,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX follow_ups_customer_idx ON follow_ups (customer_id, created_at DESC);

-- Inventory
CREATE TABLE products (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name           TEXT NOT NULL,
  sku                    TEXT NOT NULL UNIQUE,
  category               TEXT NOT NULL,
  unit_price             NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  current_stock          INTEGER NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  minimum_stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (minimum_stock_quantity >= 0),
  warehouse_location     TEXT,
  created_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON products (category);
CREATE INDEX products_name_idx ON products (lower(product_name));
CREATE TRIGGER products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE stock_movements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_changed INTEGER NOT NULL CHECK (quantity_changed > 0),
  movement_type    movement_type NOT NULL,
  reason           TEXT NOT NULL,
  reference        TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_product_idx ON stock_movements (product_id, created_at DESC);

-- Sales challans
CREATE SEQUENCE IF NOT EXISTS challan_number_seq START 1;
CREATE OR REPLACE FUNCTION next_challan_number() RETURNS TEXT AS $$
  SELECT 'CH-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('challan_number_seq')::TEXT, 6, '0');
$$ LANGUAGE sql;

CREATE TABLE challans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_number TEXT NOT NULL UNIQUE DEFAULT next_challan_number(),
  customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  total_quantity INTEGER NOT NULL DEFAULT 0,
  total_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  status         challan_status NOT NULL DEFAULT 'DRAFT',
  notes          TEXT,
  confirmed_at   TIMESTAMPTZ,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX challans_customer_idx ON challans (customer_id);
CREATE INDEX challans_status_idx ON challans (status);
CREATE TRIGGER challans_updated BEFORE UPDATE ON challans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Line items keep an immutable snapshot of name / SKU / unit price
CREATE TABLE challan_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_id            UUID NOT NULL REFERENCES challans(id) ON DELETE CASCADE,
  product_id            UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  sku_snapshot          TEXT NOT NULL,
  unit_price_snapshot   NUMERIC(12,2) NOT NULL CHECK (unit_price_snapshot >= 0),
  quantity              INTEGER NOT NULL CHECK (quantity > 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX challan_items_challan_idx ON challan_items (challan_id);

CREATE OR REPLACE FUNCTION recalc_challan_totals() RETURNS TRIGGER AS $$
DECLARE v_id UUID := coalesce(NEW.challan_id, OLD.challan_id);
BEGIN
  UPDATE challans SET
    total_quantity = coalesce((SELECT sum(quantity) FROM challan_items WHERE challan_id = v_id), 0),
    total_amount   = coalesce((SELECT sum(quantity * unit_price_snapshot) FROM challan_items WHERE challan_id = v_id), 0)
  WHERE id = v_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER challan_items_totals
AFTER INSERT OR UPDATE OR DELETE ON challan_items
FOR EACH ROW EXECUTE FUNCTION recalc_challan_totals();
