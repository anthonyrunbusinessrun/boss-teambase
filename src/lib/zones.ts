import { tzOffsetMinutes, zonedParts } from "./time";

export interface ZoneDef {
  id: string;
  city: string;
  country: string;
  /** IANA time zone. */
  tz: string;
  /** Standard-time UTC offset in minutes (used to detect daylight saving). */
  stdOffset: number;
  std: string;
  dst?: string;
  /** Shown in the World Clocks grid. */
  clock: boolean;
}

/**
 * Zones used by the header clocks, the welcome banner and the World Clocks screen.
 * Order matches the World Clocks design (Manila is the home base).
 */
export const ZONES: ZoneDef[] = [
  { id: "manila", city: "Manila", country: "Philippines", tz: "Asia/Manila", stdOffset: 480, std: "PHT", clock: true },
  { id: "houston", city: "Houston", country: "Texas, USA", tz: "America/Chicago", stdOffset: -360, std: "CST", dst: "CDT", clock: true },
  { id: "miami", city: "Miami", country: "Florida, USA", tz: "America/New_York", stdOffset: -300, std: "EST", dst: "EDT", clock: true },
  { id: "new-york", city: "New York", country: "New York, USA", tz: "America/New_York", stdOffset: -300, std: "EST", dst: "EDT", clock: true },
  { id: "london", city: "London", country: "United Kingdom", tz: "Europe/London", stdOffset: 0, std: "GMT", dst: "BST", clock: true },
  { id: "tokyo", city: "Tokyo", country: "Japan", tz: "Asia/Tokyo", stdOffset: 540, std: "JST", clock: true },
  { id: "sydney", city: "Sydney", country: "Australia", tz: "Australia/Sydney", stdOffset: 600, std: "AEST", dst: "AEDT", clock: true },
  { id: "dubai", city: "Dubai", country: "UAE", tz: "Asia/Dubai", stdOffset: 240, std: "GST", clock: true },
  // Header / welcome-banner reference zone (Central Time) — not a World Clocks card.
  { id: "chicago", city: "Chicago", country: "Illinois, USA", tz: "America/Chicago", stdOffset: -360, std: "CST", dst: "CDT", clock: false },
];

export const DEFAULT_PRIMARY_ZONE = "manila";
export const DEFAULT_SECONDARY_ZONE = "chicago";

export function getZone(id: string): ZoneDef {
  return ZONES.find((z) => z.id === id) ?? ZONES[0];
}

/** PHT / CST / CDT … — daylight-saving aware. */
export function zoneAbbr(zone: ZoneDef, date: Date): string {
  if (!zone.dst) return zone.std;
  return tzOffsetMinutes(date, zone.tz) > zone.stdOffset ? zone.dst : zone.std;
}

/** Header micro-label: "PH TIME", "CST TIME" … */
export function zoneHeaderLabel(zone: ZoneDef, date: Date): string {
  const short = zone.id === "manila" ? "PH" : zoneAbbr(zone, date);
  return `${short} TIME`;
}

/** Working hours (08:00–18:00 local) drive the amber "daylight" ring on World Clocks. */
export function isWorkingHours(date: Date, tz: string): boolean {
  const h = zonedParts(date, tz).hour;
  return h >= 8 && h < 18;
}
