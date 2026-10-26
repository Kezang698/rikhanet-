"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Bell,
  Eye,
  EyeOff,
  Menu,
  X,
  ChevronDown,
  LogOut,
  Info,
} from "lucide-react";
import {
  defaultProfiles,
  profileInitials,
  seedState,
  type DemoState,
  type Role,
  type View,
} from "@/lib/data";
import { Artwork, Logo, NAV, Modal, Toast } from "./ui";
import { AppContext, type DialogSpec } from "./context";
import {
  Overview,
  Sightings,
  WildlifeMap,
  Predictions,
  Alerts,
  Cameras,
} from "./monitoring";
import {
  Reports,
  DataReview,
  Rangers,
  Rules,
  SettingsPage,
  Account,
} from "./management";

function DialogForm({ spec, close }: { spec: DialogSpec; close: () => void }) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(
      new FormData(e.currentTarget).entries(),
    ) as Record<string, string>;
    spec.onSave?.(values);
    close();
  }
  return (
    <Modal title={spec.title} onClose={close}>
      <form onSubmit={submit}>
        {spec.description && (
          <p className="dialog-description">{spec.description}</p>
        )}
        <div className="form-fields">
          {spec.fields?.map((f) => (
            <label key={f.name}>
              {f.label}
              {f.required !== false && <span className="required"> *</span>}
              {f.type === "textarea" ? (
                <textarea
                  name={f.name}
                  defaultValue={f.value}
                  required={f.required !== false}
                  rows={4}
                />
              ) : f.type === "select" ? (
                <select
                  name={f.name}
                  defaultValue={f.value}
                  required={f.required !== false}
                >
                  {f.options?.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              ) : (
                <input
                  name={f.name}
                  type={f.type ?? "text"}
                  defaultValue={f.value}
                  required={f.required !== false}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  autoComplete={f.type === "password" ? "new-password" : "off"}
                />
              )}
            </label>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" type="submit">
            {spec.submit ?? "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Login({ onLogin }: { onLogin: (role: Role) => void }) {
  const [visible, setVisible] = useState(false),
    [error, setError] = useState(""),
    [help, setHelp] = useState(false);
  function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    const email = String(values.get("email")).trim().toLowerCase(),
      password = String(values.get("password"));
    if (
      (email === "admin@rikhanet.bt" || email === "ranger@rikhanet.bt") &&
      password === "Demo@123"
    ) {
      onLogin(email.startsWith("admin") ? "admin" : "ranger");
    } else
      setError(
        "Use admin@rikhanet.bt or ranger@rikhanet.bt with password Demo@123.",
      );
  }
  return (
    <main className="login-page">
      <div className="login-shell">
        <div className="login-hero">
          <Artwork
            source={1}
            rect={[8, 8, 386, 458]}
            label="RiKhaNET Bhutan. Wildlife detection and prediction for people and nature. Monitor wildlife activity. Support proactive management. For authorized organization accounts only. Invitation-only access."
          />
        </div>
        <section className="login-form-side">
          <div className="language">
            English <ChevronDown size={13} />
          </div>
          <form className="login-form" onSubmit={login}>
            <h2>Welcome to</h2>
            <h1>RiKhaNET</h1>
            <p>Sign in to your organization account</p>
            <label>
              Email
              <input
                type="email"
                name="email"
                placeholder="name@organization.bt"
                required
                autoComplete="username"
              />
            </label>
            <label>
              Password
              <div className="password-input">
                <input
                  type={visible ? "text" : "password"}
                  name="password"
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  aria-label={visible ? "Hide password" : "Show password"}
                  onClick={() => setVisible((v) => !v)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="primary sign-in" type="submit">
              Sign in
            </button>
            <p className="login-note">
              This platform is for authorized government and partner
              organization accounts only.
            </p>
            <button
              type="button"
              className="text-button access-help"
              onClick={() => setHelp((v) => !v)}
            >
              Need access? Contact your organization administrator.
            </button>
            {help && (
              <div className="info-box">
                <Info size={18} />
                <div>
                  <b>Frontend demonstration</b>
                  <br />
                  Admin: admin@rikhanet.bt
                  <br />
                  Ranger: ranger@rikhanet.bt
                  <br />
                  Password: Demo@123
                  <br />
                  No organization account is created.
                </div>
              </div>
            )}
            <p className="prototype-note">
              Illustrative proposal data · Frontend demonstration
            </p>
          </form>
          <Artwork
            source={1}
            rect={[400, 381, 357, 85]}
            label="Mountain and forest illustration"
            className="login-mountains"
          />
        </section>
      </div>
    </main>
  );
}
export default function RiKhaNET() {
  const [data, setData] = useState<DemoState>(seedState),
    [ready, setReady] = useState(false),
    [role, setRole] = useState<Role | null>(null),
    [view, setView] = useState<View>("overview");
  const [notice, setNotice] = useState(""),
    [spec, setSpec] = useState<DialogSpec | null>(null),
    [sidebar, setSidebar] = useState(false),
    [selectedId, setSelectedId] = useState("S-001");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string) => {
    setNotice(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(""), 4500);
  }, []);
  const close = useCallback(() => setSpec(null), []);
  useEffect(() => {
    if (!sidebar) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebar(false);
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [sidebar]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("rikhanet-demo-v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.sightings && parsed.rules && parsed.config) {
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
        localStorage.setItem("rikhanet-demo-v1", JSON.stringify(data));
      } catch {
        notify(
          "Browser storage is unavailable. Changes will last until this page closes.",
        );
      }
  }, [data, ready, notify]);
  useEffect(() => {
    function sync() {
      const candidate = location.hash.split("/")[2] as View;
      const item = NAV.find((n) => n.view === candidate);
      setView(
        item && (!item.admin || role === "admin") ? candidate : "overview",
      );
    }
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [role]);
  useEffect(() => {
    document.title = `${role ? NAV.find((n) => n.view === view)?.label : "Sign in"} | RiKhaNET`;
  }, [role, view]);
  function go(v: View) {
    if (role === "ranger" && NAV.find((n) => n.view === v)?.admin) return;
    setView(v);
    setSidebar(false);
    location.hash = `/${role}/${v}`;
    window.scrollTo({ top: 0 });
  }
  function login(r: Role) {
    setRole(r);
    setView("overview");
    try {
      sessionStorage.setItem("rikhanet-role", r);
    } catch {}
    location.hash = `/${r}/overview`;
  }
  function signOut() {
    setRole(null);
    setSpec(null);
    try {
      sessionStorage.removeItem("rikhanet-role");
    } catch {}
    location.hash = "/login";
  }
  if (!ready)
    return (
      <div className="loading">
        <Logo />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!role) return <Login onLogin={login} />;
  const profile = data.profiles[role];
  const pages: Record<View, React.ReactNode> = {
    overview: <Overview />,
    sightings: <Sightings />,
    map: <WildlifeMap />,
    predictions: <Predictions />,
    alerts: <Alerts />,
    cameras: <Cameras />,
    reports: <Reports />,
    review: <DataReview />,
    rangers: <Rangers />,
    rules: <Rules />,
    settings: <SettingsPage />,
    account: <Account />,
  };
  return (
    <AppContext.Provider
      value={{
        role,
        data,
        setData,
        go,
        notify,
        dialog: setSpec,
        signOut,
        selectedId,
        setSelectedId,
      }}
    >
      <div className={`app-shell ${role}`}>
        <aside className={`sidebar ${sidebar ? "open" : ""}`}>
          <a
            href={`#/${role}/overview`}
            className="brand"
            onClick={() => go("overview")}
            aria-label="RiKhaNET overview"
          >
            <Logo />
          </a>
          <button
            aria-label="Close navigation"
            className="mobile-close icon-button"
            onClick={() => setSidebar(false)}
          >
            <X />
          </button>
          <nav id="main-navigation" aria-label="Main navigation">
            {NAV.filter((n) => role === "admin" || !n.admin).map(
              ({ view: v, label, icon: Icon }) => (
                <a
                  key={v}
                  href={`#/${role}/${v}`}
                  aria-current={view === v ? "page" : undefined}
                  className={view === v ? "active" : ""}
                  onClick={() => go(v)}
                >
                  <Icon size={22} />
                  <span>{label}</span>
                </a>
              ),
            )}
          </nav>
          <div className="sidebar-footer">
            Illustrative proposal data
            <br />
            <span>Local frontend demonstration</span>
          </div>
        </aside>
        {sidebar && (
          <button
            className="sidebar-scrim"
            aria-label="Close navigation"
            onClick={() => setSidebar(false)}
          />
        )}
        <div className="workspace">
          <header className="topbar">
            <button
              aria-label="Open navigation"
              aria-expanded={sidebar}
              aria-controls="main-navigation"
              className="mobile-menu icon-button"
              onClick={() => setSidebar(true)}
            >
              <Menu />
            </button>
            <b>{role.toUpperCase()}</b>
            <span className="top-divider" />
            <span className="proposal-label">Illustrative proposal data</span>
            <div className="topbar-right">
              <button
                className="icon-button notification-button"
                aria-label="View notifications"
                onClick={() => go("alerts")}
              >
                <Bell size={21} />
                <i />
              </button>
              <button
                className="account-menu"
                aria-label={role === "admin" ? "Open admin profile" : "Open ranger profile"}
                title={profile.name}
                onClick={() => go("account")}
              >
                <span className="avatar-small">{profileInitials(profile.name)}</span>
                <span>{profile.name}</span>
              </button>
              <button
                className="icon-button compact-signout"
                title="Sign out"
                aria-label="Sign out"
                onClick={signOut}
              >
                <LogOut size={18} />
              </button>
            </div>
          </header>
          <main
            className="main-content"
            id="main-content"
            key={`${role}-${view}`}
          >
            {pages[view]}
          </main>
        </div>
      </div>
      {spec && <DialogForm spec={spec} close={close} />}{" "}
      {notice && <Toast message={notice} />}
    </AppContext.Provider>
  );
}
