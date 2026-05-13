## Read indexing issues for curemedkw.com from Google Search Console

You already have a Google Search Console connection (`waleed google search console`) in the workspace, but it isn't linked to this project yet. Once linked I can query the Search Console API directly via the connector gateway and report which URLs Google has trouble indexing.

### Steps

1. **Link the GSC connection to this project** via the connector picker (`standard_connectors--connect` with `connector_id: google_search_console`). No code is added — only the credentials become available to the agent.
2. **Confirm the property** by listing your verified sites and checking that `https://curemedkw.com/` (or `sc-domain:curemedkw.com`) is one of them. If only the lovable.app version is verified, we'll need to verify the new domain first.
3. **Pull indexing data** for `curemedkw.com`:
   - **Top non-indexed pages**: query the URL Inspection API (`/v1/urlInspection/index:inspect`) for each candidate URL to read `coverageState`, `indexingState`, `pageFetchState`, and `robotsTxtState`.
   - **Indexed-vs-discovered counts**: pull `searchanalytics/query` aggregated by page so we can see which routes have impressions and which don't.
   - **Sitemap status**: `GET /sitemaps/{siteUrl}/{feedpath}` to see what Google fetched from `/sitemap.xml`, error count, warnings.
4. **Summarise findings in chat** — a table per URL with the GSC reason (e.g. "Discovered – currently not indexed", "Crawled – currently not indexed", "Duplicate without user-selected canonical", "Blocked by robots.txt", "Soft 404") and a one-line fix suggestion for each.
5. **Optional follow-up** (only if you want it after we see the data): adjust `robots.txt`, canonical tags, sitemap entries, or page content to address the specific issues GSC reports.

### What I won't change in this plan
No source files are modified. The output is a chat report. Any code fixes happen in a separate follow-up once we know exactly which pages are flagged and why.

Approve and I'll link the connection and pull the report.