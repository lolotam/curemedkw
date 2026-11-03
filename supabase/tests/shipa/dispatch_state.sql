-- Only synthetic trusted receipts/in-flight markers are seeded by the fixture
-- owner. These tests prove state/result RPCs, not the not-yet-written payment
-- receipt/enqueue/begin-submission owners or actual provider behavior.
BEGIN;
INSERT INTO auth.users(id,email) VALUES('30000000-0000-4000-8000-000000000100','state-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('30000000-0000-4000-8000-000000000100','admin');
DO $permissions$
DECLARE v_function text; v_role text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY['public.shipa_complete(uuid,uuid,jsonb)',
    'public.shipa_expire_leases(uuid)','public.shipa_read_shipment(uuid,uuid)'] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(v_role,v_function,'EXECUTE') THEN
        RAISE EXCEPTION 'Browser inherited dispatch mutation rights';
      END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role',v_function,'EXECUTE') THEN
      RAISE EXCEPTION 'Service dispatch wrapper unavailable';
    END IF;
  END LOOP;
END
$permissions$;
DO $seed$
DECLARE v_order uuid; v_ship uuid; v_attempt uuid; v_integration uuid;
BEGIN
  SELECT id INTO v_integration FROM public.integrations WHERE provider='shipa';
  FOR i IN 1..111 LOOP
    v_order:=('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    v_ship:=('60000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    v_attempt:=('70000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    INSERT INTO private.order_payment_verifications(order_id,outcome_id,provider,payment_attempt_id,
      invoice_id,payment_id,amount_millis,currency,source,dispatch_decision)
      VALUES(v_order,('40000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'myfatoorah',
        ('50000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'invoice-'||i,'payment-'||i,
        1000,'KWD','callback','manual_mode');
    INSERT INTO public.shipments(id,order_id,integration_id,environment,source,state,customer_ref,
      integration_revision,credential_fingerprint,payload,payload_hash,attempt_token,attempt_count,
      lease_expires_at,submitted_at)
      VALUES(v_ship,v_order,v_integration,'sandbox','manual','submitting','CM-fixture-'||i,
        0,repeat('a',64),'{}',repeat('b',64),v_attempt,1,
        CASE WHEN i=1 OR i>6 THEN now()-interval '1 minute' ELSE now()+interval '10 minutes' END,now());
  END LOOP;
  BEGIN
    INSERT INTO public.shipments(order_id,integration_id,environment,source,customer_ref)
      VALUES('30000000-0000-4000-8000-000000000001',v_integration,'sandbox','manual','another-ref');
    RAISE EXCEPTION 'Duplicate order/environment intent accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END
$seed$;

SET LOCAL ROLE anon;
DO $anon$
BEGIN
  BEGIN
    PERFORM public.shipa_expire_leases(NULL);
    RAISE EXCEPTION 'Anon swept private attempts';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$anon$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000101","role":"authenticated"}',true);
DO $customer$
BEGIN
  IF EXISTS(SELECT 1 FROM public.shipments) THEN RAISE EXCEPTION 'Customer read shipments'; END IF;
  BEGIN
    PERFORM public.shipa_complete('60000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001','{"outcome":"uncertain","code":"timeout"}');
    RAISE EXCEPTION 'Browser completed attempt';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$customer$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $states$
DECLARE v_result jsonb; v_replay jsonb;
  v_actor uuid:='30000000-0000-4000-8000-000000000100';
BEGIN
  BEGIN
    INSERT INTO private.order_payment_verifications DEFAULT VALUES;
    RAISE EXCEPTION 'Service inserted an unverified receipt directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.shipments SET state='queued' WHERE id='60000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Service bypassed a dispatch transition';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.shipa_read_shipment(NULL,v_actor);
    RAISE EXCEPTION 'Admin read ran an unscoped expiry sweep';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.shipa_read_shipment('60000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000101');
    RAISE EXCEPTION 'Unverified actor read shipment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  v_result:=public.shipa_read_shipment('60000000-0000-4000-8000-000000000001',v_actor);
  IF v_result->>'state'<>'unknown' OR v_result->>'retry_at' IS NOT NULL THEN
    RAISE EXCEPTION 'Expired attempt became retryable';
  END IF;
  v_result:=public.shipa_complete('60000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001','{"outcome":"accepted","shipaRef":"SB-fixture-1","orderStatus":"Created"}');
  IF v_result->>'state'<>'created' THEN RAISE EXCEPTION 'Late matching result was lost'; END IF;
  v_replay:=public.shipa_complete('60000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001','{"outcome":"accepted","shipaRef":"SB-fixture-1","orderStatus":"Created"}');
  IF v_replay->>'changed'<>'false' OR v_replay->>'updated_at' IS DISTINCT FROM v_result->>'updated_at' THEN
    RAISE EXCEPTION 'Accepted replay mutated known shipment';
  END IF;
  v_replay:=public.shipa_complete('60000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001','{"outcome":"uncertain","code":"timeout"}');
  IF v_replay->>'state'<>'created' OR v_replay->>'changed'<>'false' OR v_replay->>'conflict'<>'false' THEN
    RAISE EXCEPTION 'Ambiguous late result displaced proven acceptance';
  END IF;
  v_result:=public.shipa_complete('60000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001','{"outcome":"accepted","shipaRef":"SB-conflicting","orderStatus":"Created"}');
  IF v_result->>'conflict'<>'true' OR v_result->>'shipa_ref'<>'SB-fixture-1' THEN
    RAISE EXCEPTION 'Conflicting result replaced known reference';
  END IF;
  v_result:=public.shipa_complete('60000000-0000-4000-8000-000000000003',
    '70000000-0000-4000-8000-000000000003','{"outcome":"uncertain","code":"server_error"}');
  IF v_result->>'state'<>'unknown' OR v_result->>'retry_at' IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown result allowed a retry';
  END IF;
  v_replay:=public.shipa_complete('60000000-0000-4000-8000-000000000003',
    '70000000-0000-4000-8000-000000000003','{"outcome":"uncertain","code":"server_error"}');
  IF v_replay->>'changed'<>'false' THEN RAISE EXCEPTION 'Unknown replay appended a duplicate'; END IF;
  v_result:=public.shipa_complete('60000000-0000-4000-8000-000000000004',
    '70000000-0000-4000-8000-000000000004','{"outcome":"rejected_local","code":"invalid_city"}');
  IF v_result->>'state'<>'needs_review' OR v_result->>'retry_at' IS NOT NULL THEN
    RAISE EXCEPTION 'Local failure bypassed review';
  END IF;
  BEGIN
    PERFORM public.shipa_complete('60000000-0000-4000-8000-000000000005',
      '70000000-0000-4000-8000-000000000006','{"outcome":"accepted","shipaRef":"SB-stale","orderStatus":null}');
    RAISE EXCEPTION 'Stale attempt changed state';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.shipa_complete('60000000-0000-4000-8000-000000000005',
      '70000000-0000-4000-8000-000000000005','{"outcome":"uncertain","code":"private-body-marker"}');
    RAISE EXCEPTION 'Unbounded provider error persisted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  v_result:=public.shipa_complete('60000000-0000-4000-8000-000000000006',
    '70000000-0000-4000-8000-000000000006','{"outcome":"accepted","shipaRef":"SB-fixture-1","orderStatus":null}');
  IF v_result->>'state'<>'unknown' OR v_result->>'conflict'<>'true' OR v_result->>'shipa_ref' IS NOT NULL THEN
    RAISE EXCEPTION 'Remote reference collision overwrote or stranded a shipment';
  END IF;
  v_result:=public.shipa_expire_leases(NULL);
  IF v_result->>'expired'<>'100' OR v_result->>'more_due'<>'true' THEN RAISE EXCEPTION 'Expiry sweep was not bounded'; END IF;
  v_result:=public.shipa_expire_leases(NULL);
  IF v_result->>'expired'<>'5' OR v_result->>'more_due'<>'false' THEN RAISE EXCEPTION 'Bounded leftovers were lost'; END IF;
  v_result:=public.shipa_expire_leases(NULL);
  IF v_result->>'expired'<>'0' THEN RAISE EXCEPTION 'Repeated sweep changed settled attempts'; END IF;
END
$states$;
RESET ROLE;
DO $retained$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.shipments WHERE id='60000000-0000-4000-8000-000000000003'
    AND state='unknown' AND attempt_token IN ('70000000-0000-4000-8000-000000000003')
    AND payload_hash=repeat('b',64) AND retry_count=0 AND attempt_count=1) THEN
    RAISE EXCEPTION 'Unknown result lost immutable attempt context';
  END IF;
  IF (SELECT count(*) FROM public.shipment_events WHERE shipment_id='60000000-0000-4000-8000-000000000003')<>1 THEN
    RAISE EXCEPTION 'Replay duplicated shipment events';
  END IF;
  IF (SELECT count(*) FROM public.shipment_events WHERE event_type='lease_expired')<>106 THEN
    RAISE EXCEPTION 'Lease event accounting mismatch';
  END IF;
END
$retained$;
ROLLBACK;
\echo Shipa fenced result, replay, unknown outcome, remote-reference collision and bounded-expiry proofs passed
