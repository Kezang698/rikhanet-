"use client";
import { useState, type FormEvent } from "react";
import { Bell, Edit, Info, KeyRound, LockKeyhole, LogOut } from "lucide-react";
import { profileInitials, type AccountProfile } from "@/lib/data";
import { useApp } from "@/components/context";
import { Badge, Card, Heading, Modal, Toggle } from "@/components/ui";

function ProfileEditor({
  profile,
  onClose,
  onSave,
}: {
  profile: AccountProfile;
  onClose: () => void;
  onSave: (details: Pick<AccountProfile, "name" | "email" | "phone">) => void;
}) {
  const [error, setError] = useState("");

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const name = String(values.get("name") ?? "").trim();
    const email = String(values.get("email") ?? "").trim();
    const phone = String(values.get("phone") ?? "").trim();
    if (!name || !email) {
      setError("Enter your full name and contact email.");
      return;
    }
    onSave({ name, email, phone });
  }

  return (
    <Modal title="Edit profile" onClose={onClose}>
      <form onSubmit={save} onInput={() => setError("")}>
        <p className="dialog-description">
          Update your name and work contact details. Demo sign-in details stay
          the same.
        </p>
        <div className="form-fields">
          <label>
            Full name <span className="required">*</span>
            <input
              name="name"
              defaultValue={profile.name}
              autoComplete="name"
              maxLength={80}
              required
            />
          </label>
          <label>
            Contact email <span className="required">*</span>
            <input
              name="email"
              type="email"
              defaultValue={profile.email}
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
          <label>
            Phone number (optional)
            <input
              name="phone"
              type="tel"
              defaultValue={profile.phone}
              autoComplete="tel"
              maxLength={40}
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">{error}</p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Save changes
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Account() {
  const { role, data, setData, dialog, notify, signOut } = useApp();
  const ranger = role === "ranger";
  const profile = data.profiles[role];
  const [editingProfile, setEditingProfile] = useState(false);
  const prefs = ranger
    ? [
        "Wildlife alerts (assigned zones)",
        "Daily activity summary",
        "System announcements",
        "Camera status alerts",
      ]
    : [
        "System alerts",
        "Wildlife alerts",
        "Daily summaries",
        "Product updates",
      ];
  const descriptions = ranger
    ? [
        "Elephant, leopard and other key species in your assigned zones",
        "Daily email summary of your field activity",
        "Important system notifications and announcements",
        "Camera connectivity and status in your assigned zones",
      ]
    : [
        "Important system notifications and errors",
        "High priority wildlife detection alerts",
        "Daily email summary of key events",
        "News about new features and improvements",
      ];
  function password() {
    dialog({
      title: "Change password — UI preview",
      description:
        "This is a form demonstration. The demo login password remains Demo@123; real password changes require the authentication backend.",
      fields: [
        { name: "current", label: "Current password", type: "password" },
        { name: "next", label: "New password", type: "password" },
        { name: "confirm", label: "Confirm new password", type: "password" },
      ],
      submit: "Preview change",
      onSave: (v) => {
        notify(
          v.next !== v.confirm
            ? "The new passwords do not match."
            : v.next.length < 8
              ? "Use at least 8 characters."
              : "Password form validated. No real account was changed.",
        );
      },
    });
  }
  return (
    <>
      <Heading
        title="My Account"
        description="Manage your account settings, security and notification preferences."
      />
      <div className="account-grid">
        <div className="stack">
          <Card
            title="Account Information"
            className="account-information"
            action={
              <button onClick={() => setEditingProfile(true)}>
                <Edit size={16} /> Edit Profile
              </button>
            }
          >
            <div className="profile">
              <span className="avatar-large">
                {profileInitials(profile.name)}
              </span>
              <div>
                <h2>{profile.name}</h2>
                <Badge tone="blue">{role.toUpperCase()}</Badge>
                <p>{profile.email}</p>
              </div>
            </div>
            <dl className="details roomy">
              <dt>Phone number</dt>
              <dd>{profile.phone || "Not provided"}</dd>
              {ranger && (
                <>
                  <dt>Assigned zones</dt>
                  <dd>GE-1 — Gelephu Core, GE-2 — East Corridor</dd>
                </>
              )}
              <dt>Account created</dt>
              <dd>01 Mar 2025</dd>
              <dt>Last login</dt>
              <dd>28 Sep 2026, 08:12</dd>
            </dl>
            {ranger && (
              <div className="info-box">
                <LockKeyhole size={18} />
                Assigned zones are read-only and managed by the system
                administrator.
              </div>
            )}
          </Card>
          <Card
            title={
              <>
                <LockKeyhole />
                Security Settings
              </>
            }
          >
            <div className="security-item">
              <b>Password</b>
              <p>
                Update your password regularly to keep your account secure.
              </p>
              <button onClick={password}>Change Password</button>
            </div>
            <div className="security-item">
              <b>Two-Factor Authentication</b>
              <p>Add an extra layer of security to your account.</p>
              <button
                onClick={() =>
                  dialog({
                    title: "Two-factor authentication",
                    description:
                      "The production account will support verification setup. This frontend cannot enable real two-factor authentication.",
                    submit: "Close",
                  })
                }
              >
                Enable 2FA
              </button>
            </div>
            {ranger && (
              <p className="meta">Last changed &nbsp; 12 Aug 2026, 14:32</p>
            )}
          </Card>
          <Card
            title={
              <>
                <KeyRound />
                Password Recovery
              </>
            }
          >
            <p>Set up recovery options to regain access to your account.</p>
            <div className="button-row wrap">
              <span className="small recovery-email">
                Recovery email &nbsp; {profile.recoveryEmail}
              </span>
              <button
                onClick={() =>
                  dialog({
                    title: "Update recovery email",
                    description:
                      "Save the recovery contact in this prototype. No email will be sent.",
                    fields: [
                      {
                        name: "email",
                        label: "Recovery email",
                        type: "email",
                        value: profile.recoveryEmail,
                      },
                    ],
                    submit: "Save changes",
                    onSave: (values) => {
                      setData((d) => ({
                        ...d,
                        profiles: {
                          ...d.profiles,
                          [role]: {
                            ...d.profiles[role],
                            recoveryEmail: values.email.trim(),
                          },
                        },
                      }));
                      notify("Recovery email updated in this browser.");
                    },
                  })
                }
              >
                Update Recovery Email
              </button>
            </div>
          </Card>
        </div>
        <div className="stack">
          <Card
            title={
              <>
                <Bell />
                Notification Preferences
              </>
            }
          >
            <p className="muted">
              Choose what notifications you want to receive.
            </p>
            <div className="preferences">
              {prefs.map((p, i) => (
                <label key={p}>
                  <span>
                    <b>{p}</b>
                    <small>{descriptions[i]}</small>
                  </span>
                  <Toggle
                    checked={data.preferences[`${role}-${p}`] ?? false}
                    onChange={(v) =>
                      setData((d) => ({
                        ...d,
                        preferences: {
                          ...d.preferences,
                          [`${role}-${p}`]: v,
                        },
                      }))
                    }
                    label={p}
                  />
                </label>
              ))}
            </div>
          </Card>
          <Card title="Recent Account Activity">
            <p className="muted">
              Illustrative login activity and account actions.
            </p>
            <table>
              <tbody>
                {[
                  "Logged in",
                  "Updated notification preferences",
                  "Changed password",
                  "Logged in",
                ].map((t, i) => (
                  <tr key={i}>
                    <td>{28 - i * 2} Sep 2026, 08:12</td>
                    <td>{t}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <button
              className="danger-outline full-width signout-button"
              onClick={signOut}
            >
              <LogOut size={21} />
              Sign out
            </button>
            {ranger && (
              <div className="info-box">
                <Info size={20} />
                Your account is for authorized use only. Activity may be
                monitored in accordance with RiKhaNET policies.
              </div>
            )}
          </Card>
        </div>
      </div>
      {editingProfile && (
        <ProfileEditor
          profile={profile}
          onClose={() => setEditingProfile(false)}
          onSave={(details) => {
            setData((d) => ({
              ...d,
              profiles: {
                ...d.profiles,
                [role]: { ...d.profiles[role], ...details },
              },
            }));
            setEditingProfile(false);
            notify("Profile updated in this browser.");
          }}
        />
      )}
    </>
  );
}
