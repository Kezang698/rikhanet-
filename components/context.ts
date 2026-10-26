import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { DemoState, Role, View } from "@/lib/data";
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
    | "date";
  value?: string;
  options?: string[];
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
