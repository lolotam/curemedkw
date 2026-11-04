/** Shared bounded I/O for the connection-only pairing endpoints. */
export class EvolutionBodyTooLargeError extends Error {
  constructor() {
    super("The body is larger than the allowed size.");
    this.name = "EvolutionBodyTooLargeError";
  }
}

/** Bound waiting without claiming that the underlying SDK operation stopped. */
export function withAbortSignal<T>(
  pending: PromiseLike<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return Promise.resolve(pending);
  return new Promise<T>((resolve, reject) => {
    const cancelled = () => {
      signal.removeEventListener("abort", cancelled);
      reject(new DOMException("The operation was cancelled.", "AbortError"));
    };
    if (signal.aborted) cancelled();
    else signal.addEventListener("abort", cancelled, { once: true });
    // Always observe late settlement, including an SDK rejection after abort.
    Promise.resolve(pending).then(
      (answer) => {
        signal.removeEventListener("abort", cancelled);
        if (signal.aborted) cancelled();
        else resolve(answer);
      },
      (failure: unknown) => {
        signal.removeEventListener("abort", cancelled);
        reject(failure);
      },
    );
  });
}

/** The stream, rather than Content-Length, enforces the byte cap. */
export async function readBoundedText(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  declaredLength: string | null,
  signal?: AbortSignal,
): Promise<string> {
  if (declaredLength !== null && Number(declaredLength) > limit) {
    void body?.cancel().catch(() => {});
    throw new EvolutionBodyTooLargeError();
  }
  if (body === null) return "";
  const reader = body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await withAbortSignal(reader.read(), signal);
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > limit) {
        cancel();
        throw new EvolutionBodyTooLargeError();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
