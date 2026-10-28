"use client";
import { useState } from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { shortDate, TODAY, ZONES } from "@/lib/data";
import { useApp } from "@/components/context";
import { formatCoordinates, locationLabel, sightingLocation } from "@/lib/maps";
import { bhutanDateParts } from "@/lib/api";
import {
  Animal,
  Badge,
  Card,
  Heading,
  MapPanel,
  WildlifeImage,
} from "@/components/ui";
import {
  SpeciesSelect,
  ZoneSelect,
  useVisibleSightings,
} from "@/components/filters";

export default function WildlifeMap() {
  const { role, data, backend, selectedId, setSelectedId, go } = useApp();
  const today = backend.mode === "api" ? bhutanDateParts(new Date().toISOString()).date : TODAY;
  const sightings = useVisibleSightings();
  const [species, setSpecies] = useState("all"),
    [zone, setZone] = useState("all"),
    [camera, setCamera] = useState("all"),
    [date, setDate] = useState(today),
    [riskOverlay, setRiskOverlay] = useState(backend.mode === "api"),
    [closed, setClosed] = useState(false);
  const filtered = sightings.filter(
    (s) =>
      (species === "all" || s.species === species) &&
      (zone === "all" || s.zone === zone) &&
      (camera === "all" || s.camera === camera) &&
      s.date === date,
  );
  const selected = filtered.find((s) => s.id === selectedId) ?? filtered[0];
  const selectedLocation = selected ? sightingLocation(selected, data.cameras) : null;
  return (
    <>
      <Heading
        title="Wildlife Map"
        description={
          role === "admin"
            ? "Explore sightings, camera locations and the 17 gewogs of the Gelephu Mindfulness City area"
            : "Explore sightings and camera locations in your assigned gewogs"
        }
      />
      <div className="filter-bar">
        <input
          aria-label="Map date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <SpeciesSelect value={species} onChange={setSpecies} />
        <ZoneSelect value={zone} onChange={setZone} />
        <select
          aria-label="Filter map by camera"
          value={camera}
          onChange={(e) => setCamera(e.target.value)}
        >
          <option value="all">All Cameras</option>
          {[...new Set(sightings.map((s) => s.camera))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button
          className="text-button"
          onClick={() => {
            setSpecies("all");
            setZone("all");
            setCamera("all");
            setDate(today);
            setClosed(false);
          }}
        >
          Clear filters
        </button>
        <label><input type="checkbox" checked={riskOverlay} onChange={event => setRiskOverlay(event.target.checked)} /> Prediction colours</label>
      </div>
      <div className="map-detail-grid">
        <MapPanel
          mode="wildlife"
          riskOverlay={riskOverlay}
          activeZone={zone}
          sightings={filtered}
          cameras={data.cameras.filter(c => (zone === "all" || c.zone === zone) && (camera === "all" || c.id === camera))}
          selectedSightingId={selected?.id}
          filterLabel={`${filtered.length} matching sightings`}
          onSightingSelect={(id) => {
            setSelectedId(id);
            setClosed(false);
          }}
          onSelect={(z) => {
            setZone(z);
            setSelectedId(
              sightings.find((s) => s.zone === z && s.date === date)?.id ?? "",
            );
            setClosed(false);
          }}
        />
        {!closed && selected ? (
          <Card
            title="Selected Sighting"
            action={
              <button
                className="icon-button"
                aria-label="Close selected sighting"
                onClick={() => setClosed(true)}
              >
                <X size={20} />
              </button>
            }
          >
            <WildlifeImage sighting={selected} />
            <h2 className="animal-title">
              <Animal />
              {selected.species}
            </h2>
            <p className="muted scientific">
              {selected.species === "Asian Elephant" ? "Elephas maximus" : ""}
            </p>
            <dl className="details">
              <dt>Date & Time</dt>
              <dd>
                {shortDate(selected.date)}, {selected.time}
              </dd>
              <dt>Location</dt>
              <dd>
                {selectedLocation && formatCoordinates(selectedLocation.coordinates)}
                <br />
                <small className="muted">{selectedLocation && locationLabel(selectedLocation.source)}</small>
              </dd>
              <dt>Gewog</dt>
              <dd>{ZONES[selected.zone]}</dd>
              <dt>Source</dt>
              <dd>{selected.camera}</dd>
              <dt>Confidence</dt>
              <dd>{selected.confidence.toFixed(2)} (model score)</dd>
              {role === "admin" && (
                <>
                  <dt>Review Status</dt>
                  <dd>
                    <Badge tone="yellow">{selected.review}</Badge>
                  </dd>
                </>
              )}
            </dl>
            {backend.mode === "api" && <Link className="prediction-link full-width" href={`/${role}/predictions?detection=${selected.id}`}>View this image’s prediction</Link>}
            <button
              className="full-width"
              onClick={() => {
                setSelectedId(selected.id);
                go("sightings");
              }}
            >
              View in Sightings <ExternalLink size={16} />
            </button>
          </Card>
        ) : (
          <Card title={closed ? "Explore the map" : "No matching sightings"}>
            <p className="muted">
              {closed
                ? "Select a gewog on the map to view its sightings."
                : "Change the species, date, zone or camera filters to see a matching record."}
            </p>
          </Card>
        )}
      </div>
      <p className="map-caption">
        Real OpenStreetMap geography around Gelephu. Sightings without GPS use
        sample or camera positions. Gewog boundaries are the supplied GMC data, simplified for display.
      </p>
    </>
  );
}
