import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";

// Auto-recover from stale lazy-chunk references after a redeploy.
// When the browser has a cached index.html pointing at chunk hashes that no
// longer exist on the server, dynamic import() throws "Importing a module
// script failed". Reload once (with a guard to avoid loops).
const RELOAD_KEY = "__chunk_reload_attempted__";
function isChunkLoadError(msg: string) {
  return (
    /Importing a module script failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /ChunkLoadError/i.test(msg)
  );
}
function maybeReload(msg: string) {
  if (!isChunkLoadError(msg)) return;
  if (sessionStorage.getItem(RELOAD_KEY)) return;
  sessionStorage.setItem(RELOAD_KEY, "1");
  window.location.reload();
}
window.addEventListener("error", (e) => maybeReload(e.message || ""));
window.addEventListener("unhandledrejection", (e) =>
  maybeReload(String((e.reason && (e.reason.message || e.reason)) || "")),
);
// Clear the guard on successful load so the next stale-chunk event can recover.
window.addEventListener("load", () => sessionStorage.removeItem(RELOAD_KEY));

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>,
);
