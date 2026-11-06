/** A piece of message text: plain text or a clickable link. */
export type TextSegment = { kind: "text"; value: string } | { kind: "link"; value: string };

/**
 * Matches links inside plain text: anything starting with http(s):// or `www.`.
 *
 * The trailing class excludes only whitespace, quotes and angle brackets — a URL may legitimately
 * contain `#`, `?`, `=` and `%`.
 */
const URL_PATTERN = String.raw`(?:https?:\/\/|www\.)[^\s<>"'\`]+`;

/**
 * Punctuation that ends a sentence after a link and is not part of it.
 *
 * Includes the Arabic comma `،`, semicolon `؛`, question mark `؟` and full stop `۔`: most inbox
 * messages are Arabic, and `…/page،` is a different path that 404s.
 */
const TRAILING_PUNCTUATION = /[.,;:!?»”’\]،؛؟۔]+$/;

/**
 * Strips trailing punctuation from a matched link while keeping balanced parentheses.
 *
 * A loop rather than one regex because a closing paren is only junk when the URL has no matching
 * opener — `…/wiki/Kuwait_(city)` keeps its `)`, while `(see https://x.test/a)` does not.
 */
function trimTrailing(url: string): string {
  let value = url;
  for (;;) {
    const stripped = value.replace(TRAILING_PUNCTUATION, "");
    if (stripped !== value) {
      value = stripped;
      continue;
    }
    const unclosed = value.split(")").length > value.split("(").length;
    if (value.endsWith(")") && unclosed) {
      value = value.slice(0, -1);
      continue;
    }
    return value;
  }
}

/**
 * Splits message text into text and link segments; joining every segment's `value` reproduces the
 * input exactly, so linkifying never drops characters.
 */
export function splitTextLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  // A fresh regex per call: a shared /g regex carries `lastIndex` between calls.
  const pattern = new RegExp(URL_PATTERN, "gi");
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const url = trimTrailing(match[0]);
    if (!url) continue;
    if (match.index > cursor) segments.push({ kind: "text", value: text.slice(cursor, match.index) });
    segments.push({ kind: "link", value: url });
    cursor = match.index + url.length;
    pattern.lastIndex = cursor;
  }
  if (cursor < text.length) segments.push({ kind: "text", value: text.slice(cursor) });
  return segments;
}

/** Adds the protocol to `www.` links so the browser does not treat them as relative paths. */
export function toLinkHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
