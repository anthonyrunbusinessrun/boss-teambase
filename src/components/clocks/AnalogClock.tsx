import { zonedParts } from "@/lib/time";

interface AnalogClockProps {
  now: Date;
  tz: string;
  /** home = blue ring · day = amber ring (working hours) · night = dim ring */
  state: "home" | "day" | "night";
  size?: number;
}

const RING = { home: "#3d7fcc", day: "#dd871e", night: "#1f4a8c" } as const;

/** 64px analog clock: ring, four ticks, white hour hand, blue minute hand, amber second hand. */
export function AnalogClock({ now, tz, state, size = 64 }: AnalogClockProps) {
  const p = zonedParts(now, tz);
  const sec = p.second * 6;
  const min = (p.minute + p.second / 60) * 6;
  const hour = ((p.hour % 12) + p.minute / 60) * 30;
  const hand = (deg: number, len: number, width: number, color: string) => (
    <line x1="32" y1="32" x2="32" y2={32 - len} stroke={color} strokeWidth={width} strokeLinecap="round" transform={`rotate(${deg} 32 32)`} />
  );
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`Analog clock showing ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`}>
      <circle cx="32" cy="32" r="30" fill="none" stroke={RING[state]} strokeWidth="1.5" />
      {[0, 90, 180, 270].map((deg) => (
        <line key={deg} x1="32" y1="4.5" x2="32" y2="8.5" stroke="#4d5a71" strokeWidth="1.2" strokeLinecap="round" transform={`rotate(${deg} 32 32)`} />
      ))}
      {hand(hour, 15, 2.4, "#ffffff")}
      {hand(min, 22, 1.8, "#2f78d6")}
      {hand(sec, 24, 1.2, "#f5b731")}
      <circle cx="32" cy="32" r="2.2" fill="#ffffff" />
    </svg>
  );
}
