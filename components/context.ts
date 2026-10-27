import {
  createContext,
  useContext,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import { assignedZones, type DemoState, type Role, type View } from "@/lib/data";
export interface FormField {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "password"
    | "number"
    | "textarea"
    | "select"
    | "checkboxes"
    | "date";
  /** For "checkboxes", the selected option values joined by commas. */
  value?: string;
  options?: Array<string | { value: string; label: string }>;
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
}
export interface DialogSpec {
  title: string;
  description?: string;
  fields?: FormField[];
  submit?: string;
  onSave?: (values: Record<string, string>) => void;
}
export interface AppContextValue {
  role: Role;
  data: DemoState;
  setData: Dispatch<SetStateAction<DemoState>>;
  go: (view: View) => void;
  notify: (message: string) => void;
  dialog: (spec: DialogSpec) => void;
  signOut: () => void;
  selectedId: string;
  setSelectedId: (id: string) => void;
}
export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("RiKhaNET context is missing");
  return ctx;
}

/** Gewogs the signed-in user can see (all for admin, admin-assigned for a ranger). */
export function useAssignedZones() {
  const { role, data } = useApp();
  return useMemo(
    () => assignedZones(data, role),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, data.rangers, data.currentRangerId],
  );
}
