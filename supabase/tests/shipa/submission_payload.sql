-- Pure SQL mapping only; no payment, readiness or submission authority.
BEGIN;
DO $optional_instructions$
DECLARE ordered public.orders; config jsonb; delivery jsonb; draft jsonb; payload jsonb; instructions text;
BEGIN
  ordered.order_number:='SAMPLE';
  config:='{"serviceCode":"Next Day","autoConfirm":false,"origin":{"contactName":"Synthetic office","contactPhone":"+96550000002",
    "address":{"area":"Hawally","addressLine":"Synthetic office"}}}';
  delivery:='{"destination":{"contactName":"Synthetic buyer","contactPhone":"+96550000001","city":"Hawally","addressLine":"Synthetic buyer"},
    "parcel":{"weightKg":1,"dimensionsCm":{"lengthCm":10,"widthCm":8,"heightCm":6}}}';
  FOREACH instructions IN ARRAY ARRAY['',E' \t\n',chr(160)||chr(65279)||chr(8195),' Call first 09:00-16:00 '] LOOP
    config:=jsonb_set(config,'{pickupInstructions}',to_jsonb(instructions));
    draft:=private.shipa_submission_draft(ordered,config,delivery,'CM-SYNTHETIC');
    payload:=private.shipa_submission_payload(draft);
    IF private.wa_blank(instructions) THEN
      IF draft->'pickupInstructions' IS DISTINCT FROM 'null'::jsonb OR payload->'origin' ? 'options' THEN
        RAISE EXCEPTION 'Optional blank pickup instructions did not match adapter omission'; END IF;
    ELSIF draft->>'pickupInstructions' IS DISTINCT FROM instructions OR payload#>>'{origin,options,specialInstructions}' IS DISTINCT FROM instructions THEN
      RAISE EXCEPTION 'Meaningful pickup instructions changed';
    END IF;
    IF payload#>>'{destination,options,amountToCollect}'<>'0' OR payload->>'type'<>'Delivery' THEN
      RAISE EXCEPTION 'Optional instructions changed domestic prepaid payload'; END IF;
  END LOOP;
END
$optional_instructions$;
ROLLBACK;
