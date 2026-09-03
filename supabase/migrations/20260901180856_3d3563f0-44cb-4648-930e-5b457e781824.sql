-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('ADMIN','SALES','WAREHOUSE','ACCOUNTS');
CREATE TYPE public.customer_type AS ENUM ('RETAIL','WHOLESALE','DISTRIBUTOR');
CREATE TYPE public.customer_status AS ENUM ('LEAD','ACTIVE','INACTIVE');
CREATE TYPE public.movement_type AS ENUM ('IN','OUT');
CREATE TYPE public.challan_status AS ENUM ('DRAFT','CONFIRMED','CANCELLED');

-- ============ UTIL ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles));
$$;

CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'ADMIN'));

CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'ADMIN'));

-- ============ CUSTOMERS ============
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  mobile_number TEXT NOT NULL,
  email TEXT,
  business_name TEXT,
  gst_number TEXT,
  customer_type public.customer_type NOT NULL DEFAULT 'RETAIL',
  address TEXT,
  status public.customer_status NOT NULL DEFAULT 'LEAD',
  follow_up_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_name ON public.customers (customer_name);
CREATE INDEX idx_customers_mobile ON public.customers (mobile_number);
CREATE INDEX idx_customers_status ON public.customers (status);
CREATE INDEX idx_customers_type ON public.customers (customer_type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "customers_select" ON public.customers FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['ADMIN','SALES','ACCOUNTS']::public.app_role[]));
CREATE POLICY "customers_insert" ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['ADMIN','SALES']::public.app_role[]));
CREATE POLICY "customers_update" ON public.customers FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['ADMIN','SALES']::public.app_role[]));
CREATE POLICY "customers_delete" ON public.customers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'ADMIN'));

-- ============ FOLLOW UPS ============
CREATE TABLE public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  follow_up_date DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_follow_ups_customer ON public.follow_ups (customer_id, created_at DESC);
GRANT SELECT, INSERT ON public.follow_ups TO authenticated;
GRANT ALL ON public.follow_ups TO service_role;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follow_ups_select" ON public.follow_ups FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['ADMIN','SALES','ACCOUNTS']::public.app_role[]));
CREATE POLICY "follow_ups_insert" ON public.follow_ups FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['ADMIN','SALES']::public.app_role[]) AND created_by = auth.uid());

-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  current_stock INTEGER NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  minimum_stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (minimum_stock_quantity >= 0),
  warehouse_location TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_name ON public.products (product_name);
CREATE INDEX idx_products_category ON public.products (category);
GRANT SELECT, INSERT, UPDATE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "products_select" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_insert" ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['ADMIN','WAREHOUSE']::public.app_role[]));
CREATE POLICY "products_update" ON public.products FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['ADMIN','WAREHOUSE']::public.app_role[]));

-- ============ STOCK MOVEMENTS ============
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_changed INTEGER NOT NULL CHECK (quantity_changed > 0),
  movement_type public.movement_type NOT NULL,
  reason TEXT NOT NULL,
  reference TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_movements_product ON public.stock_movements (product_id, created_at DESC);
GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_movements_select" ON public.stock_movements FOR SELECT TO authenticated USING (true);

-- ============ CHALLANS ============
CREATE SEQUENCE public.challan_number_seq;
CREATE OR REPLACE FUNCTION public.next_challan_number()
RETURNS TEXT LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'CH-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.challan_number_seq')::TEXT, 6, '0');
$$;

CREATE TABLE public.challans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_number TEXT NOT NULL UNIQUE DEFAULT public.next_challan_number(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  total_quantity INTEGER NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status public.challan_status NOT NULL DEFAULT 'DRAFT',
  notes TEXT,
  confirmed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_challans_customer ON public.challans (customer_id);
CREATE INDEX idx_challans_status ON public.challans (status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.challans TO authenticated;
GRANT ALL ON public.challans TO service_role;
ALTER TABLE public.challans ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_challans_updated BEFORE UPDATE ON public.challans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "challans_select" ON public.challans FOR SELECT TO authenticated USING (true);
CREATE POLICY "challans_insert" ON public.challans FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['ADMIN','SALES']::public.app_role[]));
CREATE POLICY "challans_update" ON public.challans FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['ADMIN','SALES']::public.app_role[]) AND status = 'DRAFT');

-- ============ CHALLAN ITEMS ============
CREATE TABLE public.challan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_id UUID NOT NULL REFERENCES public.challans(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  sku_snapshot TEXT NOT NULL,
  unit_price_snapshot NUMERIC(12,2) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challan_id, product_id)
);
CREATE INDEX idx_challan_items_challan ON public.challan_items (challan_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challan_items TO authenticated;
GRANT ALL ON public.challan_items TO service_role;
ALTER TABLE public.challan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "challan_items_select" ON public.challan_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "challan_items_write" ON public.challan_items FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['ADMIN','SALES']::public.app_role[])
    AND EXISTS (SELECT 1 FROM public.challans c WHERE c.id = challan_id AND c.status = 'DRAFT')
  );
CREATE POLICY "challan_items_update" ON public.challan_items FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['ADMIN','SALES']::public.app_role[])
    AND EXISTS (SELECT 1 FROM public.challans c WHERE c.id = challan_id AND c.status = 'DRAFT')
  );
CREATE POLICY "challan_items_delete" ON public.challan_items FOR DELETE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['ADMIN','SALES']::public.app_role[])
    AND EXISTS (SELECT 1 FROM public.challans c WHERE c.id = challan_id AND c.status = 'DRAFT')
  );

-- ============ ACCOUNT BOOTSTRAP ============
CREATE OR REPLACE FUNCTION public.setup_account(_name TEXT, _role public.app_role)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_email TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: no active session' USING ERRCODE = '28000'; END IF;
  IF _name IS NULL OR length(btrim(_name)) < 2 THEN
    RAISE EXCEPTION 'VALIDATION: name must be at least 2 characters' USING ERRCODE = '22023';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  INSERT INTO public.profiles (id, name, email) VALUES (v_uid, btrim(_name), coalesce(v_email,''))
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, _role);
  END IF;
  RETURN jsonb_build_object('user_id', v_uid, 'role', (SELECT role FROM public.user_roles WHERE user_id = v_uid LIMIT 1));
END; $$;
REVOKE ALL ON FUNCTION public.setup_account(TEXT, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.setup_account(TEXT, public.app_role) TO authenticated;

-- ============ STOCK ADJUSTMENT ============
CREATE OR REPLACE FUNCTION public.adjust_stock(
  _product_id UUID, _quantity INTEGER, _movement_type public.movement_type, _reason TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_stock INTEGER; v_name TEXT; v_new INTEGER;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: no active session' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_any_role(v_uid, ARRAY['ADMIN','WAREHOUSE']::public.app_role[]) THEN
    RAISE EXCEPTION 'FORBIDDEN: only ADMIN or WAREHOUSE can adjust stock' USING ERRCODE = '42501';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'VALIDATION: quantity must be a positive integer' USING ERRCODE = '22023';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'VALIDATION: reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT current_stock, product_name INTO v_stock, v_name FROM public.products WHERE id = _product_id FOR UPDATE;
  IF v_stock IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: product not found' USING ERRCODE = 'P0002'; END IF;

  v_new := CASE WHEN _movement_type = 'IN' THEN v_stock + _quantity ELSE v_stock - _quantity END;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for product %. Available: %, Requested: %.', v_name, v_stock, _quantity
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.products SET current_stock = v_new WHERE id = _product_id;
  INSERT INTO public.stock_movements (product_id, quantity_changed, movement_type, reason, created_by)
    VALUES (_product_id, _quantity, _movement_type, btrim(_reason), v_uid);

  RETURN jsonb_build_object('product_id', _product_id, 'previous_stock', v_stock, 'current_stock', v_new);
END; $$;
REVOKE ALL ON FUNCTION public.adjust_stock(UUID, INTEGER, public.movement_type, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, INTEGER, public.movement_type, TEXT) TO authenticated;

-- ============ CHALLAN CONFIRM (TRANSACTIONAL) ============
CREATE OR REPLACE FUNCTION public.confirm_challan(_challan_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_status public.challan_status; v_number TEXT; itm RECORD; v_items INTEGER;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: no active session' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_any_role(v_uid, ARRAY['ADMIN','SALES']::public.app_role[]) THEN
    RAISE EXCEPTION 'FORBIDDEN: only ADMIN or SALES can confirm challans' USING ERRCODE = '42501';
  END IF;

  SELECT status, challan_number INTO v_status, v_number FROM public.challans WHERE id = _challan_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: challan not found' USING ERRCODE = 'P0002'; END IF;
  IF v_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'CONFLICT: challan % is already % and cannot be confirmed again', v_number, v_status USING ERRCODE = '23505';
  END IF;

  SELECT count(*) INTO v_items FROM public.challan_items WHERE challan_id = _challan_id;
  IF v_items = 0 THEN
    RAISE EXCEPTION 'VALIDATION: challan has no items' USING ERRCODE = '22023';
  END IF;

  -- lock all involved products, then validate every line before any write
  PERFORM 1 FROM public.products
    WHERE id IN (SELECT product_id FROM public.challan_items WHERE challan_id = _challan_id)
    ORDER BY id FOR UPDATE;

  FOR itm IN
    SELECT ci.product_id, ci.quantity, p.product_name, p.current_stock
    FROM public.challan_items ci JOIN public.products p ON p.id = ci.product_id
    WHERE ci.challan_id = _challan_id
  LOOP
    IF itm.current_stock < itm.quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for product %. Available: %, Requested: %.',
        itm.product_name, itm.current_stock, itm.quantity USING ERRCODE = '23514';
    END IF;
  END LOOP;

  FOR itm IN SELECT product_id, quantity FROM public.challan_items WHERE challan_id = _challan_id LOOP
    UPDATE public.products SET current_stock = current_stock - itm.quantity WHERE id = itm.product_id;
    INSERT INTO public.stock_movements (product_id, quantity_changed, movement_type, reason, reference, created_by)
      VALUES (itm.product_id, itm.quantity, 'OUT', 'Challan ' || v_number || ' confirmed', v_number, v_uid);
  END LOOP;

  UPDATE public.challans SET status = 'CONFIRMED', confirmed_at = now() WHERE id = _challan_id;

  RETURN jsonb_build_object('challan_id', _challan_id, 'challan_number', v_number, 'status', 'CONFIRMED', 'items', v_items);
END; $$;
REVOKE ALL ON FUNCTION public.confirm_challan(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_challan(UUID) TO authenticated;

-- ============ CHALLAN CANCEL ============
CREATE OR REPLACE FUNCTION public.cancel_challan(_challan_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_status public.challan_status; v_number TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: no active session' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_any_role(v_uid, ARRAY['ADMIN','SALES']::public.app_role[]) THEN
    RAISE EXCEPTION 'FORBIDDEN: only ADMIN or SALES can cancel challans' USING ERRCODE = '42501';
  END IF;
  SELECT status, challan_number INTO v_status, v_number FROM public.challans WHERE id = _challan_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: challan not found' USING ERRCODE = 'P0002'; END IF;
  IF v_status = 'CONFIRMED' THEN
    RAISE EXCEPTION 'CONFLICT: challan % is confirmed and cannot be cancelled', v_number USING ERRCODE = '23505';
  END IF;
  IF v_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'CONFLICT: challan % is already cancelled', v_number USING ERRCODE = '23505';
  END IF;
  UPDATE public.challans SET status = 'CANCELLED' WHERE id = _challan_id;
  RETURN jsonb_build_object('challan_id', _challan_id, 'status', 'CANCELLED');
END; $$;
REVOKE ALL ON FUNCTION public.cancel_challan(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_challan(UUID) TO authenticated;

-- ============ CHALLAN TOTALS TRIGGER ============
CREATE OR REPLACE FUNCTION public.recalc_challan_totals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID := coalesce(NEW.challan_id, OLD.challan_id);
BEGIN
  UPDATE public.challans c SET
    total_quantity = coalesce((SELECT sum(quantity) FROM public.challan_items WHERE challan_id = v_id), 0),
    total_amount = coalesce((SELECT sum(quantity * unit_price_snapshot) FROM public.challan_items WHERE challan_id = v_id), 0)
  WHERE c.id = v_id;
  RETURN NULL;
END; $$;
CREATE TRIGGER trg_challan_items_totals AFTER INSERT OR UPDATE OR DELETE ON public.challan_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_challan_totals();

-- ============ SEED DEMO DATA ============
INSERT INTO public.customers (id, customer_name, mobile_number, email, business_name, gst_number, customer_type, address, status, follow_up_date, notes) VALUES
 ('11111111-1111-4111-8111-111111111101','Rakesh Sharma','9820011221','rakesh@sharmatraders.in','Sharma Traders','27AAAPL1234C1ZV','WHOLESALE','12 MG Road, Pune, MH','ACTIVE','2026-09-15','Key wholesale account, pays on 15-day credit.'),
 ('11111111-1111-4111-8111-111111111102','Meena Distributors','9845567788','orders@meenadist.com','Meena Distributors Pvt Ltd','29AABCU9603R1ZM','DISTRIBUTOR','Plot 45, Peenya, Bengaluru, KA','ACTIVE','2026-09-10','Monthly bulk orders of packaged goods.'),
 ('11111111-1111-4111-8111-111111111103','Anil Kirana Store','9701122334','anil.kirana@gmail.com','Anil Kirana Store',NULL,'RETAIL','Shop 3, Kukatpally, Hyderabad, TS','ACTIVE',NULL,'Small retailer, cash on delivery.'),
 ('11111111-1111-4111-8111-111111111104','Sunrise Supermart','9911223344','purchase@sunrisemart.in','Sunrise Supermart LLP','07AAGCS1234M1Z8','WHOLESALE','Sector 18, Noida, UP','LEAD','2026-09-05','Requested price list for staples.'),
 ('11111111-1111-4111-8111-111111111105','Godavari Agencies','9393939393','info@godavariagencies.com','Godavari Agencies',NULL,'DISTRIBUTOR','Beside Bus Stand, Rajahmundry, AP','INACTIVE',NULL,'Dormant since last season.');

INSERT INTO public.products (id, product_name, sku, category, unit_price, current_stock, minimum_stock_quantity, warehouse_location) VALUES
 ('22222222-2222-4222-8222-222222222201','Basmati Rice 25kg Bag','SKU-RICE-25','Staples',2150.00,120,25,'A-01'),
 ('22222222-2222-4222-8222-222222222202','Refined Sunflower Oil 15L Tin','SKU-OIL-15L','Edible Oil',1780.50,64,20,'A-04'),
 ('22222222-2222-4222-8222-222222222203','Toor Dal 30kg Sack','SKU-DAL-30','Pulses',3420.00,18,20,'B-02'),
 ('22222222-2222-4222-8222-222222222204','Detergent Powder 5kg','SKU-DET-5','Home Care',420.00,240,50,'C-03'),
 ('22222222-2222-4222-8222-222222222205','Packaged Drinking Water 1L x 12','SKU-WTR-12','Beverages',180.00,8,30,'C-07'),
 ('22222222-2222-4222-8222-222222222206','Wheat Flour 10kg','SKU-ATA-10','Staples',480.00,96,30,'A-02'),
 ('22222222-2222-4222-8222-222222222207','Tea Powder 1kg Pouch','SKU-TEA-1','Beverages',395.00,150,40,'D-01'),
 ('22222222-2222-4222-8222-222222222208','Toilet Soap 100g x 12','SKU-SOAP-12','Home Care',210.00,12,25,'C-05');

INSERT INTO public.stock_movements (product_id, quantity_changed, movement_type, reason, created_at) VALUES
 ('22222222-2222-4222-8222-222222222201',150,'IN','Opening stock', now() - interval '20 days'),
 ('22222222-2222-4222-8222-222222222201',30,'OUT','Damaged in transit', now() - interval '12 days'),
 ('22222222-2222-4222-8222-222222222202',80,'IN','Purchase order PO-1043', now() - interval '18 days'),
 ('22222222-2222-4222-8222-222222222202',16,'OUT','Sample distribution', now() - interval '9 days'),
 ('22222222-2222-4222-8222-222222222203',40,'IN','Opening stock', now() - interval '17 days'),
 ('22222222-2222-4222-8222-222222222203',22,'OUT','Warehouse transfer to Nagpur', now() - interval '6 days'),
 ('22222222-2222-4222-8222-222222222205',48,'IN','Purchase order PO-1051', now() - interval '15 days'),
 ('22222222-2222-4222-8222-222222222205',40,'OUT','Local retail dispatch', now() - interval '3 days'),
 ('22222222-2222-4222-8222-222222222208',60,'IN','Opening stock', now() - interval '14 days'),
 ('22222222-2222-4222-8222-222222222208',48,'OUT','Festival promo dispatch', now() - interval '2 days');

INSERT INTO public.challans (id, challan_number, customer_id, status, notes, confirmed_at, created_at) VALUES
 ('33333333-3333-4333-8333-333333333301', public.next_challan_number(), '11111111-1111-4111-8111-111111111101','CONFIRMED','Monthly staples order', now() - interval '5 days', now() - interval '5 days'),
 ('33333333-3333-4333-8333-333333333302', public.next_challan_number(), '11111111-1111-4111-8111-111111111102','CONFIRMED','Bulk beverages + home care', now() - interval '3 days', now() - interval '3 days'),
 ('33333333-3333-4333-8333-333333333303', public.next_challan_number(), '11111111-1111-4111-8111-111111111103','DRAFT','Awaiting customer confirmation', NULL, now() - interval '1 day'),
 ('33333333-3333-4333-8333-333333333304', public.next_challan_number(), '11111111-1111-4111-8111-111111111104','DRAFT','Trial order for new lead', NULL, now() - interval '4 hours');

INSERT INTO public.challan_items (challan_id, product_id, product_name_snapshot, sku_snapshot, unit_price_snapshot, quantity) VALUES
 ('33333333-3333-4333-8333-333333333301','22222222-2222-4222-8222-222222222201','Basmati Rice 25kg Bag','SKU-RICE-25',2150.00,20),
 ('33333333-3333-4333-8333-333333333301','22222222-2222-4222-8222-222222222206','Wheat Flour 10kg','SKU-ATA-10',480.00,24),
 ('33333333-3333-4333-8333-333333333302','22222222-2222-4222-8222-222222222207','Tea Powder 1kg Pouch','SKU-TEA-1',395.00,50),
 ('33333333-3333-4333-8333-333333333302','22222222-2222-4222-8222-222222222204','Detergent Powder 5kg','SKU-DET-5',420.00,60),
 ('33333333-3333-4333-8333-333333333303','22222222-2222-4222-8222-222222222202','Refined Sunflower Oil 15L Tin','SKU-OIL-15L',1780.50,6),
 ('33333333-3333-4333-8333-333333333303','22222222-2222-4222-8222-222222222208','Toilet Soap 100g x 12','SKU-SOAP-12',210.00,10),
 ('33333333-3333-4333-8333-333333333304','22222222-2222-4222-8222-222222222203','Toor Dal 30kg Sack','SKU-DAL-30',3420.00,40);

INSERT INTO public.stock_movements (product_id, quantity_changed, movement_type, reason, reference, created_at) VALUES
 ('22222222-2222-4222-8222-222222222201',20,'OUT','Challan CH-2026-000001 confirmed','CH-2026-000001', now() - interval '5 days'),
 ('22222222-2222-4222-8222-222222222206',24,'OUT','Challan CH-2026-000001 confirmed','CH-2026-000001', now() - interval '5 days'),
 ('22222222-2222-4222-8222-222222222207',50,'OUT','Challan CH-2026-000002 confirmed','CH-2026-000002', now() - interval '3 days'),
 ('22222222-2222-4222-8222-222222222204',60,'OUT','Challan CH-2026-000002 confirmed','CH-2026-000002', now() - interval '3 days');