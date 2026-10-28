"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import {
  defaultProfiles,
  isZone,
  seedState,
  type DemoState,
  type Role,
  type View,
} from "@/lib/data";
import { NAV, Toast } from "./ui";
import type { DialogSpec } from "./context";
import { DialogForm } from "./DialogForm";
import { apiRequest, DATABASE_MODE, toSighting, utcOrderKey, bhutanDateParts, type BackendState, type BackendHealth,
  type StoredSighting, type PredictionGroup, type ObservationInput, type EnrichmentResult, type AuthUser } from "@/lib/api";

interface Session {
  notificationCount: number;
  user: AuthUser | null;
  refreshAccount: () => Promise<void>;
  ready: boolean;
  role: Role | null;
  data: DemoState;
  setData: Dispatch<SetStateAction<DemoState>>;
  go: (view: View) => void;
  push: (href: string) => void;
  replace: (href: string) => void;
  login: (role: Role) => void;
  signOut: () => void;
  notify: (message: string) => void;
  dialog: (spec: DialogSpec) => void;
  selectedId: string;
  setSelectedId: (id: string) => void;
  backend: BackendState;
  refreshBackend: () => Promise<void>;
  saveObservation: (input: ObservationInput) => Promise<StoredSighting>;
  enrichSighting: (id: string) => Promise<EnrichmentResult>;
  loadOlderSightings: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("RiKhaNET session is missing");
  return ctx;
}

/**
 * Holds the demo data, the signed-in role and the toast/dialog state.
 * It lives in the root layout, so it survives navigation between routes.
 */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const authEpoch=useRef(0);
  const [notificationCount,setNotificationCount] = useState(0);
  const [data, setData] = useState<DemoState>(() => {
    const initial = seedState();
    return DATABASE_MODE ? { ...initial, sightings: [], alerts: [], batches: [], rangers: [], preferences: {} } : initial;
  }),
    [ready, setReady] = useState(false),
    [role, setRole] = useState<Role | null>(null);
  const [notice, setNotice] = useState(""),
    [spec, setSpec] = useState<DialogSpec | null>(null),
    [selectedId, setSelectedId] = useState("S-001");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string) => {
    setNotice(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(""), 4500);
  }, []);
  const close = useCallback(() => setSpec(null), []);
  const [backend, setBackend] = useState<BackendState>({ mode: DATABASE_MODE ? "api" : "demo",
    status: DATABASE_MODE ? "loading" : "connected", error: "", health: null,
    predictions: [], totalSightings: 0, lastSynced: null });
  const refreshing = useRef<Promise<void> | null>(null);
  const storedSightings = useRef<StoredSighting[]>([]);
  const loadingOlder = useRef(false);
  const refreshAccount = useCallback(async () => {
    if (!DATABASE_MODE) return;
    const epoch=authEpoch.current;
    const result = await apiRequest<{user: AuthUser}>("auth/me");
    const current = result.user;
    const staff = await apiRequest<AuthUser[]>("rangers");
    const settings = await apiRequest<{config: DemoState["config"]}>("config");
    if(epoch!==authEpoch.current)return;
    setUser(current); setRole(current.role);
    setData(previous => ({...previous, currentRangerId: current.id,
      rangers: staff.map(person => ({id: person.id, name: person.name, email: person.email, phone: person.phone, notes: person.notes,
        role: "Ranger", status: person.active ? "Active" : "Suspended", zones: person.zones})),
      preferences: current.preferences, ...(settings ? {config: settings.config} : {}),
      profiles: {...previous.profiles, [current.role]: {name: current.name, email: current.email, phone: current.phone, recoveryEmail: current.email}}}));
  }, []);
  const refreshBackend = useCallback(() => {
    if (!DATABASE_MODE) return Promise.resolve();
    if (refreshing.current) return refreshing.current;
    const refresh = async () => {
      const epoch=authEpoch.current;
      try {
        const [health, sightings, predictions, alerts, notifications] = await Promise.all([
          apiRequest<BackendHealth>("health"),
          apiRequest<{ items: StoredSighting[]; total: number }>("sightings?limit=1000"),
          apiRequest<PredictionGroup[]>("predictions?limit=1000"),
          apiRequest<Array<{id:string;title:string;gewog_code:number;affected_codes:number[];status:"New"|"Acknowledged"|"Resolved";response:string;assigned_name:string|null;created_at:string}>>("alerts"),
          apiRequest<Array<{read_at:string|null}>>("notifications"),
        ]);
        if(epoch!==authEpoch.current)return;
        const currentIds = new Set(sightings.items.map((row) => row.detection_id));
        setNotificationCount(notifications.filter(row=>!row.read_at).length);
        const oldest = sightings.items.at(-1);
        const older = oldest ? storedSightings.current.filter((row) => !currentIds.has(row.detection_id) &&
          utcOrderKey(row) < utcOrderKey(oldest)) : [];
        storedSightings.current = [...sightings.items, ...older];
        setData((current) => {
          const zones=current.rangers.find(person=>person.id===current.currentRangerId)?.zones;
          return { ...current, sightings: storedSightings.current.map(toSighting), alerts: alerts.map(row=>({id:row.id,species:"Asian Elephant",zone:String(zones&&!zones.includes(String(row.gewog_code))?row.affected_codes.find(code=>zones.includes(String(code)))??row.gewog_code:row.gewog_code),severity:"High",...bhutanDateParts(row.created_at),trigger:row.title,status:row.status,ranger:row.assigned_name??"Unassigned",response:row.response,timeline:[]})), batches: [] };
        });
        setBackend({ mode: "api", status: "connected", error: "", health, predictions,
          totalSightings: sightings.total, lastSynced: new Date().toISOString() });
      } catch (error) {
        if(epoch!==authEpoch.current)return;
        setBackend((current) => ({ ...current, status: "error",
          error: error instanceof Error ? error.message : "Backend unavailable" }));
      }
    };
    refreshing.current = refresh().finally(() => { refreshing.current = null; });
    return refreshing.current;
  }, []);
  const loadOlderSightings = useCallback(async () => {
    if (!DATABASE_MODE || loadingOlder.current) return;
    loadingOlder.current = true;
    try {
      await refreshing.current;
      const oldest = storedSightings.current.at(-1);
      if (!oldest) return;
      const params = new URLSearchParams({ limit: "1000", before: oldest.timestamp, before_id: oldest.detection_id });
      const page = await apiRequest<{ items: StoredSighting[] }>(`sightings?${params}`);
      const existing = new Set(storedSightings.current.map((row) => row.detection_id));
      storedSightings.current = [...storedSightings.current, ...page.items.filter((row) => !existing.has(row.detection_id))];
      setData((current) => ({ ...current, sightings: storedSightings.current.map(toSighting) }));
    } finally { loadingOlder.current = false; }
  }, []);
  const saveObservation = useCallback(async (input: ObservationInput) => {
    const row = await apiRequest<StoredSighting>("observations", { method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(input) });
    await refreshing.current;
    await refreshBackend();
    return row;
  }, [refreshBackend]);
  const enrichSighting = useCallback(async (id: string) => {
    const result = await apiRequest<EnrichmentResult>(`enrich/${id}`, { method: "POST" });
    await refreshing.current;
    await refreshBackend();
    return result;
  }, [refreshBackend]);
  useEffect(() => {
    if (!ready || !role || !DATABASE_MODE) return;
    void refreshBackend();
    const poll = setInterval(() => { if (!document.hidden) void refreshBackend(); }, 15_000);
    return () => clearInterval(poll);
  }, [ready, role, refreshBackend]);
  useEffect(() => {
    if (DATABASE_MODE) {
      try {
        const saved=localStorage.getItem("rikhanet-camera-config-v1");
        const legacy=localStorage.getItem("rikhanet-api-preferences-v1");
        const cameras=saved?JSON.parse(saved):legacy?JSON.parse(legacy).cameras:null;
        if(Array.isArray(cameras)&&cameras.every(camera=>isZone(camera.zone)))setData(previous=>({...previous,cameras}));
      }catch{}
      void refreshAccount().catch(() => { setRole(null); setUser(null); }).finally(() => setReady(true));
      const expired = () => { authEpoch.current++;setRole(null); setUser(null);setNotificationCount(0); storedSightings.current = []; setData(previous => ({...previous,sightings:[],alerts:[],rangers:[]})); router.replace("/login"); };
      window.addEventListener("rikhanet-session-expired", expired);
      return () => window.removeEventListener("rikhanet-session-expired", expired);
    }
    try {
      const saved = DATABASE_MODE
        ? localStorage.getItem("rikhanet-api-preferences-v1") ?? localStorage.getItem("rikhanet-demo-v2")
        : localStorage.getItem("rikhanet-demo-v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Data saved before gewogs became zones (GE-1…GE-4) is ignored.
        const current =
          Array.isArray(parsed.sightings) &&
          parsed.sightings.every((s: { zone: string }) => isZone(s.zone)) &&
          Array.isArray(parsed.rangers) &&
          typeof parsed.currentRangerId === "string";
        if (current && parsed.rules && parsed.config) {
          const defaults = defaultProfiles();
          setData({
            ...parsed,
            ...(DATABASE_MODE ? { sightings: [], alerts: [], batches: [] } : {}),
            profiles: {
              admin: { ...defaults.admin, ...parsed.profiles?.admin },
              ranger: { ...defaults.ranger, ...parsed.profiles?.ranger },
            },
          });
        }
      }
      const session = sessionStorage.getItem("rikhanet-role");
      if (session === "admin" || session === "ranger") setRole(session);
    } catch {
      /* A fresh demo still works when storage is unavailable. */
    }
    setReady(true);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if(ready&&DATABASE_MODE){try{localStorage.setItem("rikhanet-camera-config-v1",JSON.stringify(data.cameras));}catch{}return;}
    if (ready && !DATABASE_MODE)
      try {
        const saved = DATABASE_MODE ? { ...data, sightings: [], alerts: [], batches: [] } : data;
        localStorage.setItem(DATABASE_MODE ? "rikhanet-api-preferences-v1" : "rikhanet-demo-v2", JSON.stringify(saved));
      } catch {
        notify(
          "Browser storage is unavailable. Changes will last until this page closes.",
        );
      }
  }, [data, ready, notify]);
  const push = useCallback((href: string) => router.push(href), [router]);
  const replace = useCallback((href: string) => router.replace(href), [router]);
  const go = useCallback(
    (v: View) => {
      if (!role) return;
      if (role === "ranger" && NAV.find((n) => n.view === v)?.admin) return;
      router.push(`/${role}/${v}`);
    },
    [role, router],
  );
  const login = useCallback(
    async (r: Role) => {
      if (DATABASE_MODE) {
        authEpoch.current++;
        storedSightings.current = [];
        await refreshAccount();
        router.push(`/${r}/overview`);
        return;
      }
      setRole(r);
      try {
        sessionStorage.setItem("rikhanet-role", r);
      } catch {}
      router.push(`/${r}/overview`);
    },
    [router, refreshAccount],
  );
  const signOut = useCallback(async () => {
    if (DATABASE_MODE) {
      try { await apiRequest("auth/logout", {method:"POST"}); }
      catch (error) { notify(error instanceof Error ? error.message : "Sign out failed"); return; }
      setUser(null); storedSightings.current = [];
      authEpoch.current++;setNotificationCount(0);
      setData(previous => ({...previous,sightings:[],alerts:[],rangers:[]}));
    }
    setRole(null);
    setSpec(null);
    try {
      sessionStorage.removeItem("rikhanet-role");
    } catch {}
    router.push("/login");
  }, [router, notify]);
  return (
    <SessionContext.Provider
      value={{
        ready,
        notificationCount,
        user,
        refreshAccount,
        role,
        data,
        setData,
        go,
        push,
        replace,
        login,
        signOut,
        notify,
        dialog: setSpec,
        selectedId,
        setSelectedId,
        backend,
        refreshBackend,
        saveObservation,
        enrichSighting,
        loadOlderSightings,
      }}
    >
      {children}
      {spec && <DialogForm spec={spec} close={close} />}{" "}
      {notice && <Toast message={notice} />}
    </SessionContext.Provider>
  );
}
