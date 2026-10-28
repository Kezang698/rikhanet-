"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  Home,
  Search,
  Map,
  TrendingUp,
  Bell,
  Camera,
  Video,
  FileText,
  ImageUp,
  Users,
  Shield,
  Settings,
  User,
  X,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  PawPrint,
  Check,
  AlertTriangle,
} from "lucide-react";
import {
  DATE_LABEL,
  type AlertRecord,
  type Sighting,
  type View,
  type Zone,
  ZONES,
} from "@/lib/data";
import { useApp } from "./context";
import { formatCoordinates, locationLabel, sightingLocation } from "@/lib/maps";

export const NAV: {
  view: View;
  label: string;
  icon: typeof Home;
  admin?: boolean;
}[] = [
  { view: "overview", label: "Overview", icon: Home },
  { view: "sightings", label: "Sightings", icon: Search },
  { view: "map", label: "Wildlife Map", icon: Map },
  { view: "predictions", label: "Predictions", icon: TrendingUp },
  { view: "alerts", label: "Alerts", icon: Bell },
  { view: "cameras", label: "Cameras", icon: Camera },
  { view: "webcam", label: "Webcam", icon: Video, admin: true },
  { view: "reports", label: "Reports", icon: FileText },
  { view: "review", label: "Data Review", icon: ImageUp, admin: true },
  { view: "rangers", label: "Rangers", icon: Users, admin: true },
  { view: "rules", label: "Zones & Rules", icon: Shield, admin: true },
  { view: "settings", label: "Settings", icon: Settings, admin: true },
  { view: "account", label: "My Account", icon: User },
];
export function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 60 42" aria-hidden="true">
        <path
          d="M4 30 17 12 22 20 33 2 48 22 51 17 59 31 37 25 32 13 26 27 17 23Z"
          fill="currentColor"
        />
        <path
          d="M2 33Q30 49 58 33M7 36Q30 24 54 35"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      <span>RiKhaNET</span>
    </span>
  );
}
export function Animal({
  species = "Asian Elephant",
  size = 26,
}: {
  species?: string;
  size?: number;
}) {
  return species.includes("Elephant") ? (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 48"
      aria-hidden="true"
      className="animal"
    >
      <path
        fill="currentColor"
        d="M8 35C4 23 5 11 17 8c8-4 19-3 29 1l5-3 5 3 2 9 1 7 5 8-3 6-5-3-3-13-3 2-2 16h-6l-1-13-12 1-2 13h-6l-3-14-5 14H7l1-12-3-5-2 8H1l1-13 5-6Z"
      />
      <circle cx="52" cy="15" r="1" fill="white" />
    </svg>
  ) : (
    <PawPrint size={size} fill="currentColor" strokeWidth={1.3} />
  );
}
export function Badge({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Status({ status }: { status: string }) {
  return (
    <span
      className={`status ${/offline|suspended/i.test(status) ? "red" : /processing|preview/i.test(status) ? "blue" : "green"}`}
    >
      <i />
      {status}
    </span>
  );
}
export function Card({
  children,
  title,
  action,
  className = "",
}: {
  children: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="card-heading">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const { role } = useApp();
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">
        {role === "ranger" ? (
          <>
            {children}
            <DateButton />
          </>
        ) : children ?? <DateButton />}
      </div>
    </div>
  );
}
export function DateButton() {
  return (
    <span className="date-label">
      <CalendarDays size={17} />
      {DATE_LABEL}
    </span>
  );
}
export function Empty({
  text = "No records match these filters.",
}: {
  text?: string;
}) {
  return (
    <div className="empty">
      <Search size={30} />
      <p>{text}</p>
    </div>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`toggle ${checked ? "on" : ""}`}
    >
      <span />
    </button>
  );
}
export function Pagination({
  page,
  total,
  size = 10,
  onPage,
}: {
  page: number;
  total: number;
  size?: number;
  onPage: (p: number) => void;
}) {
  const count = Math.max(1, Math.ceil(total / size));
  return (
    <div className="pagination">
      <span>
        Showing {total ? (page - 1) * size + 1 : 0}–
        {Math.min(page * size, total)} of {total} records
      </span>
      <div>
        <button
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        {Array.from(
          { length: Math.min(count, 5) },
          (_, i) => Math.min(Math.max(1, page - 2), Math.max(1, count - 4)) + i,
        ).map((p) => (
          <button
            key={p}
            className={page === p ? "selected" : ""}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ))}
        <button
          aria-label="Next page"
          disabled={page >= count}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// The original artwork stays intact. These CSS viewports reuse only the photo/map regions.
export function Artwork({
  source = 2,
  rect,
  label,
  className = "",
  style = {},
}: {
  source?: number;
  rect: [number, number, number, number];
  label: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [x, y, w, h] = rect;
  const sw = source === 5 ? 1113 : 1536,
    sh = source === 5 ? 696 : 1024;
  return (
    <div
      role="img"
      aria-label={label}
      className={`artwork ${className}`}
      style={{ aspectRatio: `${w}/${h}`, ...style }}
    >
      <img
        src={`/artwork/prototype-${source}.png`}
        alt=""
        draggable={false}
        style={{
          width: `${(sw / w) * 100}%`,
          height: `${(sh / h) * 100}%`,
          left: `${(-x / w) * 100}%`,
          top: `${(-y / h) * 100}%`,
        }}
      />
    </div>
  );
}
export function WildlifeImage({
  sighting,
  box = false,
  label = false,
}: {
  sighting?: Sighting;
  box?: boolean;
  label?: boolean;
}) {
  const species = sighting?.species ?? "Asian Elephant";
  let source = 8,
    rect: [number, number, number, number] = [1290, 159, 222, 133];
  if (!species.includes("Elephant")) {
    source = 5;
    rect = species.includes("Leopard")
      ? [393, 421, 137, 64]
      : species.includes("Deer")
        ? [541, 543, 139, 60]
        : species === "Gaur"
          ? [392, 542, 136, 62]
          : [238, 540, 136, 63];
  }
  return (
    <div className="wildlife-image">
      <Artwork
        source={source}
        rect={rect}
        label={`${species} — illustrative camera image from the prototype`}
      />
      {box && species.includes("Elephant") && (
        <div className={`detection-box ${label ? "yellow" : ""}`}>
          {label && (
            <span>
              {species} ({sighting?.confidence ?? 0.92})
            </span>
          )}
        </div>
      )}
      <div className="image-stamp">
        RiKhaNET&nbsp; {sighting?.camera ?? "CAM-012"}
        <span>
          {sighting?.date ?? "2026-09-28"}&nbsp; {sighting?.time ?? "06:24"}
          &nbsp; 18°C ☾
        </span>
      </div>
    </div>
  );
}
export { MapPanel } from "./GelephuMap";

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const node = ref.current;
    node?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const all = node?.querySelectorAll<HTMLElement>(
          "button,input,select,textarea,a[href]",
        );
        if (!all?.length) return;
        const first = all[0],
          last = all[all.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === node)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Details({
  sighting,
  children,
}: {
  sighting: Sighting;
  children?: ReactNode;
}) {
  const { data } = useApp();
  const location = sightingLocation(sighting, data.cameras);
  return (
    <Card
      className="detail-card"
      title={sighting.species}
      action={
        <Badge
          tone={
            sighting.review === "Needs review"
              ? "yellow"
              : sighting.review === "Rejected"
                ? "red"
                : "green"
          }
        >
          {sighting.review}
        </Badge>
      }
    >
      <p className="meta">
        {sighting.date} {sighting.time} &nbsp; {sighting.camera} &nbsp;{" "}
        {ZONES[sighting.zone]}
      </p>
      <WildlifeImage sighting={sighting} box />
      <dl className="details">
        <dt>Species</dt>
        <dd>
          {sighting.species}
          {sighting.species === "Asian Elephant" && <em> (Elephas maximus)</em>}
        </dd>
        <dt>Date & Time</dt>
        <dd>
          {sighting.date}, {sighting.time}
        </dd>
        <dt>Location</dt>
        <dd>
          {formatCoordinates(location.coordinates)}
          <br />
          <small className="muted">{locationLabel(location.source)}</small>
        </dd>
        <dt>Gewog</dt>
        <dd>
          {ZONES[sighting.zone]}
        </dd>
        <dt>Source</dt>
        <dd>
          {sighting.source} {sighting.camera}
        </dd>
        <dt>Confidence</dt>
        <dd>
          {sighting.confidence.toFixed(2)} (
          {sighting.confidence >= 0.8 ? "High" : "Review suggested"})
        </dd>
        <dt>Bounding Box</dt>
        <dd>
          x: 428, y: 112, w: 356, h: 298
          <br />
          <span className="muted">(illustrative image coordinates)</span>
        </dd>
      </dl>
      {children}
    </Card>
  );
}
export function Toast({ message }: { message: string }) {
  return (
    <div role="status" className="toast">
      <Check size={18} />
      {message}
    </div>
  );
}
export function Severity({ value }: { value: AlertRecord["severity"] }) {
  return (
    <span className="severity" data-severity={value}>
      <AlertTriangle size={14} aria-hidden="true" />
      {value}
    </span>
  );
}
