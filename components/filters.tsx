"use client";
import { useMemo } from "react";
import { SPECIES, ZONES } from "@/lib/data";
import { useApp, useAssignedZones } from "@/components/context";

export function useVisibleSightings() {
  const { data } = useApp();
  const zones = useAssignedZones();
  return useMemo(
    () => data.sightings.filter((s) => zones.includes(s.zone)),
    [zones, data.sightings],
  );
}
export function ZoneSelect({
  value,
  onChange,
  all = true,
}: {
  value: string;
  onChange: (s: string) => void;
  all?: boolean;
}) {
  const { role } = useApp();
  const zones = useAssignedZones();
  return (
    <select
      aria-label="Filter by gewog"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {all && (
        <option value="all">
          {role === "ranger" ? "All my gewogs" : "All Gewogs"}
        </option>
      )}
      {zones.map((z) => (
        <option key={z} value={z}>
          {ZONES[z]}
        </option>
      ))}
    </select>
  );
}
export function SpeciesSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <select
      aria-label="Filter by species"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="all">All Species</option>
      {SPECIES.map((s) => (
        <option key={s}>{s}</option>
      ))}
    </select>
  );
}
