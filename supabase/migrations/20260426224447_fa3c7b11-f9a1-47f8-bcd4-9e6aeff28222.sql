CREATE OR REPLACE FUNCTION public.next_order_number()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE n bigint;
BEGIN
  n := nextval('public.order_number_seq');
  RETURN 'CM-' || lpad(n::text, 6, '0');
END;
$$;