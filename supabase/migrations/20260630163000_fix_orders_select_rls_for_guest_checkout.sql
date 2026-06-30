-- Fix: allow guest checkout by letting the anon role read back recently-created
-- guest orders.  The order_items INSERT policy (migration 20260523142117) already
-- has a 10-minute window for guest orders, but the orders SELECT policy was never
-- updated to match.  This blocked INSERT … RETURNING in useCreateOrder() and the
-- EXISTS subquery in the order_items INSERT WITH CHECK for guest (user_id IS NULL)
-- orders, causing "new row violates row-level security policy for table 'orders'".

-- 1. orders SELECT: add 10-minute guest window so INSERT … RETURNING works
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;

CREATE POLICY "Users can view own or recent guest orders"
  ON public.orders FOR SELECT
  USING (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR (user_id IS NULL AND created_at > now() - interval '10 minutes')
  );

-- 2. order_items SELECT: same 10-minute guest window for consistency
DROP POLICY IF EXISTS "Users can view own order items" ON public.order_items;

CREATE POLICY "Users can view own or recent guest order items"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (
          (o.user_id IS NOT NULL AND o.user_id = auth.uid())
          OR public.has_role(auth.uid(), 'admin')
          OR (o.user_id IS NULL AND o.created_at > now() - interval '10 minutes')
        )
    )
  );
