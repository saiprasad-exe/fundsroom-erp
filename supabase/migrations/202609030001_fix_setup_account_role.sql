CREATE OR REPLACE FUNCTION public.setup_account(
  _name TEXT,
  _role public.app_role
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: no active session'
      USING ERRCODE = '28000';
  END IF;

  IF _name IS NULL OR length(btrim(_name)) < 2 THEN
    RAISE EXCEPTION 'VALIDATION: name must be at least 2 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT email
  INTO v_email
  FROM auth.users
  WHERE id = v_uid;

  INSERT INTO public.profiles (id, name, email)
  VALUES (v_uid, btrim(_name), coalesce(v_email, ''))
  ON CONFLICT (id)
  DO UPDATE SET name = EXCLUDED.name;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = v_uid
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'SALES');
  END IF;

  RETURN jsonb_build_object(
    'user_id', v_uid,
    'role',
    (
      SELECT role
      FROM public.user_roles
      WHERE user_id = v_uid
      LIMIT 1
    )
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.setup_account(TEXT, public.app_role)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.setup_account(TEXT, public.app_role)
TO authenticated;