## Update `SELF_HOSTED.md` only

Append a new section after section **C) Edge Function secrets** (or at the end, before "Hard rules" — see placement note below) titled:

### Self-hosted Edge Functions secrets in Dokploy Supabase stack

Content to add:

1. **Where to put the secrets**
   - File: `/etc/dokploy/compose/cloud-supabase-hns8fw/code/.env`
   - Required env names:
     - `OPENROUTER_API_KEY`
     - `FIRECRAWL_API_KEY`
     - `LOVABLE_API_KEY`

2. **Wiring them into the functions service**
   - The Supabase stack's `docker-compose.yml` must pass these into the `functions` service `environment:` block:
     ```yaml
     OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
     FIRECRAWL_API_KEY: ${FIRECRAWL_API_KEY}
     LOVABLE_API_KEY: ${LOVABLE_API_KEY}
     ```
   - Without this, the deployed edge functions (`extract-product`, `translate-product`, `scrape-product`, `openrouter-models`) cannot read the keys at runtime.

3. **Warning / recovery note**
   - Normal CureMed frontend auto-deploy does **not** touch the Supabase stack compose file.
   - However, recreating or updating the Supabase stack template in Dokploy **may overwrite** `docker-compose.yml`, dropping these env passthroughs.
   - Keep this section as recovery documentation: after any Supabase stack template update, re-verify the `.env` file and the `functions` service env block, then redeploy the stack.

4. **Security reminder**
   - These keys are server-side only. Never expose them in frontend code, `RUNTIME_*` vars, or `VITE_*` build args.

**Placement:** insert as new section **D)** between current C and current D (renumber subsequent sections D→E, E→F, F→G, G→H), OR append as a new section after G to avoid renumbering. Recommend appending after G to minimize churn.

**Scope:** documentation only — no frontend, edge function, or compose file changes.
