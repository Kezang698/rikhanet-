"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound, usePathname } from "next/navigation";
import { Bell, Menu, X, LogOut } from "lucide-react";
import { profileInitials, type Role } from "@/lib/data";
import { Logo, NAV } from "./ui";
import { AppContext } from "./context";
import { Loading } from "./Loading";
import { useSession } from "./AppProvider";

/** Sidebar + topbar for every /admin/* and /ranger/* route. */
export default function Shell({
  role: routeRole,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const session = useSession();
  const pathname = usePathname();
  const [sidebar, setSidebar] = useState(false);
  const { ready, role, replace } = session;
  useEffect(() => {
    if (!ready) return;
    if (!role) replace("/login");
    else if (role !== routeRole) replace(`/${role}/overview`);
  }, [ready, role, routeRole, replace]);
  useEffect(() => {
    if (!sidebar) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebar(false);
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [sidebar]);
  const view = pathname.split("/")[2];
  const current = NAV.find((n) => n.view === view);
  const title = current ? <title>{`${current.label} | RiKhaNET`}</title> : null;
  if (!ready || role !== routeRole)
    return (
      <>
        {title}
        <Loading />
      </>
    );
  if (current?.admin && routeRole !== "admin") notFound();
  const { data, go, signOut } = session;
  const profile = data.profiles[routeRole];
  return (
    <AppContext.Provider
      value={{
        role: routeRole,
        data,
        setData: session.setData,
        go,
        notify: session.notify,
        dialog: session.dialog,
        signOut,
        selectedId: session.selectedId,
        setSelectedId: session.setSelectedId,
      }}
    >
      {title}
      <div className={`app-shell ${routeRole}`}>
        <aside className={`sidebar ${sidebar ? "open" : ""}`}>
          <Link
            href={`/${routeRole}/overview`}
            className="brand"
            onClick={() => setSidebar(false)}
            aria-label="RiKhaNET overview"
          >
            <Logo />
          </Link>
          <button
            aria-label="Close navigation"
            className="mobile-close icon-button"
            onClick={() => setSidebar(false)}
          >
            <X />
          </button>
          <nav id="main-navigation" aria-label="Main navigation">
            {NAV.filter((n) => routeRole === "admin" || !n.admin).map(
              ({ view: v, label, icon: Icon }) => {
                const href = `/${routeRole}/${v}`;
                const active = pathname === href;
                return (
                  <Link
                    key={v}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={active ? "active" : ""}
                    onClick={() => setSidebar(false)}
                  >
                    <Icon size={22} />
                    <span>{label}</span>
                  </Link>
                );
              },
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
            <b>{routeRole.toUpperCase()}</b>
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
                aria-label={
                  routeRole === "admin"
                    ? "Open admin profile"
                    : "Open ranger profile"
                }
                title={profile.name}
                onClick={() => go("account")}
              >
                <span className="avatar-small">
                  {profileInitials(profile.name)}
                </span>
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
          <main className="main-content" id="main-content">
            {children}
          </main>
        </div>
      </div>
    </AppContext.Provider>
  );
}
