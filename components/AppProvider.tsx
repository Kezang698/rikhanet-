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

interface Session {
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
  const [data, setData] = useState<DemoState>(seedState),
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
  useEffect(() => {
    try {
      const saved = localStorage.getItem("rikhanet-demo-v2");
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
    if (ready)
      try {
        localStorage.setItem("rikhanet-demo-v2", JSON.stringify(data));
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
    (r: Role) => {
      setRole(r);
      try {
        sessionStorage.setItem("rikhanet-role", r);
      } catch {}
      router.push(`/${r}/overview`);
    },
    [router],
  );
  const signOut = useCallback(() => {
    setRole(null);
    setSpec(null);
    try {
      sessionStorage.removeItem("rikhanet-role");
    } catch {}
    router.push("/login");
  }, [router]);
  return (
    <SessionContext.Provider
      value={{
        ready,
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
      }}
    >
      {children}
      {spec && <DialogForm spec={spec} close={close} />}{" "}
      {notice && <Toast message={notice} />}
    </SessionContext.Provider>
  );
}
