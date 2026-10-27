"use client";
import { useMemo } from "react";
import { SPECIES, ZONES } from "@/lib/data";
import { useApp } from "@/components/context";

export function useVisibleSightings() {
  const { role, data } = useApp();
  return useMemo(
    () =>
      data.sightings.filter(
        (s) => role === "admin" || s.zone === "GE-1" || s.zone === "GE-2",
      ),
    [role, data.sightings],
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
  return (
    <select
      aria-label="Filter by zone"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {all && (
        <option value="all">
          {role === "ranger" ? "GE-1, GE-2 (assigned)" : "All Zones"}
        </option>
      )}
      {Object.entries(ZONES)
        .filter(([z]) => role === "admin" || z === "GE-1" || z === "GE-2")
        .map(([z, name]) => (
          <option key={z} value={z}>
            {z} — {name}
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
