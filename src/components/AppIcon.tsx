import { useState } from "react";
import type { PulseApp } from "../lib/types";

export function AppIcon({ app, size = 44 }: { app?: PulseApp; size?: number }) {
  const [failed, setFailed] = useState(false);
  const radius = Math.round(size * 0.27);
  const short = (app?.name ?? "Nexora").replace(/^Nexora\s*/i, "") || "Nexora";

  if (app?.icon_url && !failed) {
    return (
      <img
        src={app.icon_url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className="squircle shrink-0 object-cover"
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  const accent = app?.accent || "#0a84ff";
  return (
    <span
      aria-hidden="true"
      className="squircle grid shrink-0 place-items-center font-semibold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: size * 0.44,
        background: `linear-gradient(145deg, color-mix(in srgb, ${accent} 78%, white), ${accent} 60%, color-mix(in srgb, ${accent} 82%, black))`,
      }}
    >
      {short.charAt(0).toUpperCase()}
    </span>
  );
}
