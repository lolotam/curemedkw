/** Read an SDK error response once; never trust an unbounded context.json(). */
export async function readBoundedHttpErrorJson(response: Response): Promise<unknown> {
  const maxBytes = 4096;
  const waitMs = 1000;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (response.ok || !response.body) return undefined;
    const length = response.headers.get("content-length");
    if (length !== null && Number(length) > maxBytes) {
      void response.body.cancel().catch(() => {});
      return undefined;
    }
    reader = response.body.getReader();
    const expiresAt = performance.now() + waitMs;
    let deadlineReached = false;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        deadlineReached = true;
        reject(new Error("HTTP error body deadline exceeded."));
        void reader?.cancel().catch(() => {});
      }, waitMs);
    });
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let text = "";
    for (;;) {
      if (performance.now() >= expiresAt) return undefined;
      const chunk = await Promise.race([reader.read(), expired]);
      if (deadlineReached || performance.now() >= expiresAt) return undefined;
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) return undefined;
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch {
    return undefined;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (reader) {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}
