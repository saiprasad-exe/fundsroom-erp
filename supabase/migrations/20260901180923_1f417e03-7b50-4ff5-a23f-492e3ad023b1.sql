REVOKE EXECUTE ON FUNCTION public.setup_account(TEXT, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.adjust_stock(UUID, INTEGER, public.movement_type, TEXT) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_challan(UUID) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_challan(UUID) FROM anon, PUBLIC;

REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
REVOKE ALL ON FUNCTION public.has_any_role(UUID, public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_any_role(UUID, public.app_role[]) TO authenticated;

REVOKE ALL ON FUNCTION public.recalc_challan_totals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_challan_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_challan_number() TO authenticated;