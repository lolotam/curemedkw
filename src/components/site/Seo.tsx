import { Helmet } from "react-helmet-async";

const SITE_URL = "https://curemedkw.lovable.app";

interface SeoProps {
  title: string;
  description: string;
  /** Path starting with `/`. Used for canonical and og:url. */
  path: string;
  /** Optional JSON-LD object(s) to append. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  /** Optional og:image override. */
  image?: string;
  ogType?: "website" | "article" | "product";
  /** When true, emit `<meta name="robots" content="noindex, follow">` and skip canonical/og:url. */
  noindex?: boolean;
}

/**
 * Per-route head: title, description, canonical, og:* and optional JSON-LD.
 * Note: <Helmet> mutates document.head client-side, so non-JS social
 * crawlers (Slack/LinkedIn/Facebook) still see the static index.html head.
 */
export function Seo({ title, description, path, jsonLd, image, ogType = "website", noindex = false }: SeoProps) {
  const url = `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const schemas = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {noindex ? (
        <meta name="robots" content="noindex, follow" />
      ) : (
        <link rel="canonical" href={url} />
      )}
      <meta property="og:type" content={ogType} />
      {!noindex && <meta property="og:url" content={url} />}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {image ? <meta property="og:image" content={image} /> : null}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {image ? <meta name="twitter:image" content={image} /> : null}
      {schemas.map((s, i) => (
        <script key={i} type="application/ld+json">{JSON.stringify(s)}</script>
      ))}
    </Helmet>
  );
}

