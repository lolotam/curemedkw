import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLoaderBarSettings, LOADER_BAR_DEFAULTS, useLoaderVideoUrl, LOADER_VIDEO_DEFAULT } from "@/lib/db";

export default function Loading() {
  const navigate = useNavigate();
  const { data: settings } = useLoaderBarSettings();
  const { data: videoUrl } = useLoaderVideoUrl();
  const cfg = settings ?? LOADER_BAR_DEFAULTS;
  const { durationMs, positionX, positionY, widthPx } = cfg;
  const VIDEO_URL = (videoUrl && videoUrl.trim()) || LOADER_VIDEO_DEFAULT;

  useEffect(() => {
    const timer = setTimeout(
      () => navigate("/curemed", { replace: true }),
      Math.max(1200, durationMs + 300),
    );
    return () => clearTimeout(timer);
  }, [navigate, durationMs]);

  return (
    <div data-brand="curemed" className="fixed inset-0 overflow-hidden bg-black">
      <video
        src={VIDEO_URL}
        autoPlay
        muted
        playsInline
        loop
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {cfg.visible !== false && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none px-4 w-full max-w-[90vw]"
          style={{
            left: `${positionX}%`,
            top: `${positionY}%`,
            width: `min(${widthPx}px, 90vw)`,
          }}
        >
          <div className="h-2 sm:h-2.5 w-full rounded-full bg-white/15 backdrop-blur-sm overflow-hidden shadow-lg">
            <div
              key={`${durationMs}-${widthPx}`}
              className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--curemed-blue-soft))] via-[hsl(var(--curemed-blue))] to-[hsl(var(--curemed-teal))] shadow-[0_0_12px_hsl(var(--curemed-blue)/0.6)]"
              style={{ animation: `loader-progress ${durationMs}ms ease-out infinite` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}