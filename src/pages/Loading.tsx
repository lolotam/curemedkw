import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLoaderBarSettings, LOADER_BAR_DEFAULTS } from "@/lib/db";

const VIDEO_URL =
  "https://yjvqzvmyritxegugfhkt.supabase.co/storage/v1/object/public/hero-media//CureMed_logo_loading_animation_202604300936.mp4";

export default function Loading() {
  const navigate = useNavigate();
  const { data: settings } = useLoaderBarSettings();
  const cfg = settings ?? LOADER_BAR_DEFAULTS;
  const { durationMs, positionX, positionY, widthPx } = cfg;

  useEffect(() => {
    const timer = setTimeout(
      () => navigate("/curemed", { replace: true }),
      Math.max(1200, durationMs + 300),
    );
    return () => clearTimeout(timer);
  }, [navigate, durationMs]);

  return (
    <div data-brand="curemed" className="fixed inset-0 overflow-hidden bg-black">
      {/* Scale the video up and shift it so the built-in progress bar at the
          bottom of the source MP4 is pushed off-screen. Only our custom
          React-rendered gradient bar remains visible. */}
      <video
        src={VIDEO_URL}
        autoPlay
        muted
        playsInline
        loop
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover origin-center"
        style={{ transform: "scale(1.18) translateY(-6%)" }}
      />
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ left: `${positionX}%`, top: `${positionY}%`, width: widthPx }}
      >
        <div className="h-2.5 w-full rounded-full bg-white/15 backdrop-blur-sm overflow-hidden shadow-lg">
          <div
            key={`${durationMs}-${widthPx}`}
            className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--curemed-blue-soft))] via-[hsl(var(--curemed-blue))] to-[hsl(var(--curemed-teal))] shadow-[0_0_12px_hsl(var(--curemed-blue)/0.6)]"
            style={{ animation: `loader-progress ${durationMs}ms ease-out infinite` }}
          />
        </div>
      </div>
    </div>
  );
}