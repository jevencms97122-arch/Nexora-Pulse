import { animate } from "animejs";
import { useEffect, useId, useRef } from "react";

const PATH = "M196 536H372L448 336L576 716L652 536H828";

/** Nexora Pulse mark. With `animated`, anime.js draws the heartbeat line. */
export function Logo({ size = 32, animated = false }: { size?: number; animated?: boolean }) {
  const line = useRef<SVGPathElement>(null);
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    if (!animated || !line.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = animate(line.current, {
      strokeDashoffset: [1, 0],
      duration: 900,
      ease: "inOutQuart",
    });
    return () => void animation.revert();
  }, [animated]);

  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0.12" y1="0" x2="0.88" y2="1">
          <stop offset="0" stopColor="#3FA2FF" />
          <stop offset="0.55" stopColor="#2F6BFF" />
          <stop offset="1" stopColor="#6A4DFF" />
        </linearGradient>
      </defs>
      <rect x="32" y="32" width="960" height="960" rx="224" fill={`url(#${id})`} />
      <path
        ref={line}
        d={PATH}
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={0}
        fill="none"
        stroke="#fff"
        strokeWidth="72"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Small looping heartbeat used next to the "live" label. */
export function HeartbeatLine({ color, width = 44 }: { color: string; width?: number }) {
  const line = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!line.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = animate(line.current, {
      strokeDashoffset: [1, -1],
      duration: 2600,
      ease: "inOutSine",
      loop: true,
    });
    return () => void animation.revert();
  }, []);

  return (
    <svg width={width} height={width * 0.42} viewBox="150 280 720 480" aria-hidden="true">
      <path d={PATH} fill="none" stroke={color} strokeOpacity="0.2" strokeWidth="52" strokeLinecap="round" strokeLinejoin="round" />
      <path ref={line} d={PATH} pathLength={1} strokeDasharray={1} fill="none" stroke={color} strokeWidth="52" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
