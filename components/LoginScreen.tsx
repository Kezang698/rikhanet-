"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, ChevronDown, Info } from "lucide-react";
import type { Role } from "@/lib/data";
import { Artwork } from "./ui";
import { Loading } from "./Loading";
import { useSession } from "./AppProvider";

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

export default function LoginScreen() {
  const { ready, role, login, replace } = useSession();
  useEffect(() => {
    if (ready && role) replace(`/${role}/overview`);
  }, [ready, role, replace]);
  const title = <title>Sign in | RiKhaNET</title>;
  if (!ready || role)
    return (
      <>
        {title}
        <Loading />
      </>
    );
  return (
    <>
      {title}
      <Login onLogin={login} />
    </>
  );
}
