import type { ReactNode } from "react";
import { splitTextLinks, toLinkHref } from "@/lib/linkify";

/**
 * Renders message text with its links clickable, opening in a new tab.
 *
 * Stored WhatsApp bodies are plain text; WhatsApp's own clients linkify them at render time.
 * `rel="noreferrer"` keeps the opened page from reaching this one through `window.opener`.
 */
export function LinkifiedText({ text }: { text: string }): ReactNode {
  return splitTextLinks(text).map((segment, index) =>
    segment.kind === "link" ? (
      <a key={index} href={toLinkHref(segment.value)} target="_blank" rel="noreferrer" dir="ltr"
        className="underline underline-offset-2 hover:no-underline">{segment.value}</a>
    ) : (
      <span key={index}>{segment.value}</span>
    ),
  );
}
