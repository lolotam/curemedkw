import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLoaderBarSettings, LOADER_BAR_DEFAULTS } from "@/lib/db";

const VIDEO_URL =
  "https://yjvqzvmyritxegugfhkt.supabase.co/storage/v1/object/public/hero-media//CureMed_logo_loading_animation_202604300936.mp4";

export default function Loading() {
  const navigate = useNavigate();
  const { data: settings } = useLoaderBarSettings();
  const cfg = settings ?? LOADER_BAR_DEFAULTS;
  const { durationMs } = cfg;

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
    </div>
  );
}