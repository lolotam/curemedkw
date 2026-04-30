import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const VIDEO_URL =
  "https://yjvqzvmyritxegugfhkt.supabase.co/storage/v1/object/public/hero-media//CureMed_logo_loading_animation_202604300936.mp4";

export default function Loading() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => navigate("/curemed", { replace: true }), 3500);
    return () => clearTimeout(timer);
  }, [navigate]);

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
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="h-1.5 w-64 md:w-80 rounded-full bg-white/15 backdrop-blur-sm overflow-hidden shadow-lg">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--curemed-blue-soft))] via-[hsl(var(--curemed-blue))] to-[hsl(var(--curemed-teal))] animate-loader-progress shadow-[0_0_12px_hsl(var(--curemed-blue)/0.6)]"
          />
        </div>
      </div>
    </div>
  );
}