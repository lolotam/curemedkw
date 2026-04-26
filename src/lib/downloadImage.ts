import JSZip from "jszip";
import { toast } from "sonner";

function extFromUrl(url: string): string {
  try {
    const u = new URL(url, window.location.href);
    const m = u.pathname.match(/\.([a-z0-9]{3,4})$/i);
    if (m) return m[1].toLowerCase();
  } catch {
    // ignore
  }
  return "jpg";
}

function safeName(name: string): string {
  return (name || "image").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "image";
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.blob();
}

export async function downloadImage(url: string, filename?: string): Promise<void> {
  const name = safeName(filename || `image.${extFromUrl(url)}`);
  const finalName = /\.[a-z0-9]{3,4}$/i.test(name) ? name : `${name}.${extFromUrl(url)}`;

  // Handle data URLs directly
  if (url.startsWith("data:")) {
    const a = document.createElement("a");
    a.href = url;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  try {
    const blob = await fetchBlob(url);
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
  } catch {
    // Fallback: open in a new tab if CORS blocks
    window.open(url, "_blank", "noopener");
  }
}

export async function downloadImagesAsZip(
  urls: string[],
  zipName = "images.zip",
  baseName = "image",
): Promise<void> {
  if (!urls.length) return;
  const tId = toast.loading(`Preparing ${urls.length} image(s)…`);
  try {
    const zip = new JSZip();
    let ok = 0;
    await Promise.all(
      urls.map(async (url, i) => {
        try {
          const blob = url.startsWith("data:")
            ? await (await fetch(url)).blob()
            : await fetchBlob(url);
          const ext = extFromUrl(url);
          zip.file(`${safeName(baseName)}-${i + 1}.${ext}`, blob);
          ok++;
        } catch {
          // skip failed image
        }
      }),
    );
    if (!ok) throw new Error("Could not download any images");
    const blob = await zip.generateAsync({ type: "blob" });
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = safeName(zipName).endsWith(".zip") ? safeName(zipName) : `${safeName(zipName)}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    toast.success(`Downloaded ${ok} image(s)`, { id: tId });
  } catch (err: any) {
    toast.error(`Download failed: ${err.message || "unknown"}`, { id: tId });
  }
}