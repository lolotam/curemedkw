"""Compare tracked baseline and first-pass metadata on a guarded disposable DB."""
import argparse
import hashlib
import json
from pathlib import Path
import fixture

SNAPSHOT = r"""
SELECT jsonb_build_object(
 'schemas', (SELECT jsonb_agg(jsonb_build_array(nspname,nspacl::text,pg_get_userbyid(nspowner)) ORDER BY nspname)
              FROM pg_namespace WHERE nspname IN ('public','auth','storage') OR (nspname='private' AND __PRIVATE_EXISTED__)),
 'defaults', (SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(defaclrole),n.nspname,defaclobjtype,defaclacl::text)
                 ORDER BY n.nspname,defaclobjtype,defaclrole)
               FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
              WHERE n.nspname IN ('public','auth','storage') OR (n.nspname='private' AND __PRIVATE_EXISTED__)),
 'tables', (SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,
                       pg_get_userbyid(c.relowner)) ORDER BY n.nspname,c.relname)
             FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE c.oid=ANY(ARRAY[__OIDS__]::oid[])),
 'constraints', (SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid))
                    ORDER BY conrelid::regclass::text,conname)
                  FROM pg_constraint WHERE conrelid=ANY(ARRAY[__OIDS__]::oid[])),
 'triggers', (SELECT jsonb_agg(jsonb_build_array(tgrelid::regclass::text,tgname,pg_get_triggerdef(oid),tgenabled)
                 ORDER BY tgrelid::regclass::text,tgname)
               FROM pg_trigger WHERE tgrelid=ANY(ARRAY[__OIDS__]::oid[])),
 'policies', (SELECT jsonb_agg(jsonb_build_array(polrelid::regclass::text,polname,polcmd,polroles::text,
                        pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid))
                  ORDER BY polrelid::regclass::text,polname)
                FROM pg_policy WHERE polrelid=ANY(ARRAY[__OIDS__]::oid[]))
)::text;
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--preexisting-private", action="store_true")
    parser.add_argument("--with-transactions", action="store_true")
    args = parser.parse_args()
    fixture.restore(args.state, args.baseline)
    state = json.loads(args.state.read_text(encoding="utf-8"))
    container = fixture.marker_guard(state)
    if args.preexisting_private:
        fixture.sql(container, "CREATE SCHEMA private AUTHORIZATION postgres; "
                    "CREATE TABLE private.unrelated_guard_sentinel(marker text); "
                    "INSERT INTO private.unrelated_guard_sentinel VALUES ('unrelated'); "
                    "GRANT USAGE ON SCHEMA private TO anon; "
                    "GRANT SELECT ON private.unrelated_guard_sentinel TO anon; "
                    "ALTER DEFAULT PRIVILEGES IN SCHEMA private GRANT ALL ON TABLES TO anon, authenticated;", "postgres")
    identities = fixture.sql(container, "SELECT string_agg(c.oid::text,',') FROM pg_class c "
                             "JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','S','v') "
                             "AND n.nspname IN ('public','auth','storage','private');")
    query = SNAPSHOT.replace("__OIDS__", identities).replace(
        "__PRIVATE_EXISTED__", "true" if args.preexisting_private else "false")
    before = fixture.sql(container, query)
    core = Path(__file__).resolve().parents[2] / "migrations/20261103000100_whatsapp_core.sql"
    first_pass_query = None
    first_pass_snapshot = None
    for pass_number in (1, 2):
        fixture.sql(container, core.read_text(encoding="utf-8"), "postgres")
        if args.with_transactions:
            transactions = core.with_name("20261103000200_whatsapp_transactions.sql")
            fixture.sql(container, transactions.read_text(encoding="utf-8"), "postgres")
        after = fixture.sql(container, query)
        if before != after:
            raise RuntimeError(f"Existing schema/ACL/default/trigger/policy drift on pass {pass_number}")
        fixture.sql(container, Path(__file__).with_name("privileges.sql").read_text(encoding="utf-8"), "postgres")
        if pass_number == 1:
            after_identities = fixture.sql(container, "SELECT string_agg(c.oid::text,',') FROM pg_class c "
                                          "JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','S','v') "
                                          "AND n.nspname IN ('public','auth','storage','private');")
            first_pass_query = SNAPSHOT.replace("__OIDS__", after_identities).replace("__PRIVATE_EXISTED__", "true")
            first_pass_snapshot = fixture.sql(container, first_pass_query)
        elif fixture.sql(container, first_pass_query) != first_pass_snapshot:
            raise RuntimeError("New integration metadata drift on pass 2")
    print(json.dumps({"passes": 2, "existing_objects_unchanged": True,
                      "new_integration_metadata_unchanged": True,
                      "first_pass_metadata_fingerprint": hashlib.sha256(first_pass_snapshot.encode()).hexdigest(),
                      "schema_acl_fingerprint": hashlib.sha256(before.encode()).hexdigest(),
                      "real_runner": "postgres NOSUPERUSER", "rows_copied": 0,
                      "preexisting_private": args.preexisting_private,
                      "transaction_foundation": args.with_transactions}))


if __name__ == "__main__":
    main()
