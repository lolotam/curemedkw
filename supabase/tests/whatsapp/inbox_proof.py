"""Apply and exercise inbox/activation changes only on a guarded disposable DB."""
import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import fixture

ROOT = Path(__file__).resolve().parents[3]


def concurrency_proof(container):
    message = json.dumps([{'remote_jid': '123456789099999@lid', 'provider_message_id': 'concurrent-proof',
                          'direction': 'inbound', 'message_type': 'text', 'body': 'Synthetic',
                          'sent_at': '2026-11-05T11:00:00Z', 'count_unread': True}])
    query = "SET ROLE service_role; SELECT public.wa_ingest_messages('" + message + "'::jsonb);"
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda _: fixture.sql(container, query, 'postgres'), range(8)))
    observed = fixture.sql(container, "SELECT count(*)::text || ':' || max(c.unread_count)::text "
                           "FROM public.whatsapp_messages m JOIN public.whatsapp_chats c ON c.id=m.chat_id "
                           "WHERE m.provider_message_id='concurrent-proof';", 'postgres')
    if observed != '1:1':
        raise RuntimeError('Concurrent duplicate ingestion changed unread count: ' + observed)
    print('Passed concurrent duplicate ingestion (8 writers)', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', type=Path, required=True)
    args = parser.parse_args()
    container = fixture.marker_guard(json.loads(args.state.read_text(encoding='utf-8')))
    inventory = json.loads((ROOT / 'docs/releases/curemed-schema-20261106.json').read_text(encoding='utf-8'))
    for migration in inventory['migrations']:
        fixture.sql(container, (ROOT / migration['path']).read_text(encoding='utf-8'), 'postgres')
        print('Applied', migration['filename'], flush=True)
    for migration in inventory['migrations'][-2:]:
        fixture.sql(container, (ROOT / migration['path']).read_text(encoding='utf-8'), 'postgres')
    for path in ['shipa/settings.sql', 'shipa/credential_readiness.sql', 'shipa/activation.sql', 'whatsapp/inbox.sql',
                 'whatsapp/inbox_features.sql']:
        fixture.sql(container, (ROOT / 'supabase/tests' / path).read_text(encoding='utf-8'), 'postgres')
        print('Passed', path, flush=True)
    concurrency_proof(container)


if __name__ == '__main__':
    main()
