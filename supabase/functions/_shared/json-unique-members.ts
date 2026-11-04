// Curemed — duplicate member detection for a closed JSON request body.
//
// JSON.parse keeps the last of two equal member names, so
// {"action":"status","action":"connect"} reads as one "connect" action and
// the caller never sees the first value. A closed request contract has to
// refuse that body instead. Names are compared after JSON unescaping, so
// "action" and "action" are the same member.

/**
 * True when the top-level object of an already parsed JSON text repeats a
 * member name. The text must be valid JSON whose top-level value is an
 * object; callers run JSON.parse first.
 */
export function hasDuplicateTopLevelMember(text: string): boolean {
  const names = new Set<string>();
  let depth = 0;
  let expectName = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '"') {
      const start = i;
      i++;
      while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
      if (depth === 1 && expectName) {
        const name = JSON.parse(text.slice(start, i + 1)) as string;
        if (names.has(name)) return true;
        names.add(name);
        expectName = false;
      }
    } else if (char === "{" || char === "[") {
      depth++;
      expectName = depth === 1 && char === "{";
    } else if (char === "}" || char === "]") {
      depth--;
    } else if (char === "," && depth === 1) {
      expectName = true;
    }
    i++;
  }
  return false;
}
