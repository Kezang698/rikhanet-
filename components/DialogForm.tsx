"use client";
import { useState, type FormEvent } from "react";
import { Modal } from "./ui";
import type { DialogSpec } from "./context";

export function DialogForm({ spec, close }: { spec: DialogSpec; close: () => void }) {
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const values = Object.fromEntries(form.entries()) as Record<string, string>;
    for (const f of spec.fields ?? [])
      if (f.type === "checkboxes") values[f.name] = form.getAll(f.name).join(",");
    setBusy(true);setError("");
    try { await spec.onSave?.(values); close(); }
    catch(cause){setError(cause instanceof Error?cause.message:"Could not save changes");}
    finally{setBusy(false);}
  }
  return (
    <Modal title={spec.title} onClose={close}>
      <form onSubmit={submit}>
        {spec.description && (
          <p className="dialog-description">{spec.description}</p>
        )}
        <div className="form-fields">
          {spec.fields?.map((f) => f.type === "checkboxes" ? (
            <fieldset key={f.name} className="form-checkboxes">
              <legend>{f.label}</legend>
              <div>
                {f.options?.map((o) => {
                  const { value, label } = typeof o === "string" ? { value: o, label: o } : o;
                  return (
                    <label key={value} className="check-option">
                      <input
                        type="checkbox"
                        name={f.name}
                        value={value}
                        defaultChecked={(f.value ?? "").split(",").includes(value)}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : (
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
                  {f.options?.map((o) => {
                    const { value, label } = typeof o === "string" ? { value: o, label: o } : o;
                    return <option key={value} value={value}>{label}</option>;
                  })}
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
          {error&&<p className="form-error" role="alert">{error}</p>}
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={busy}>
            {spec.submit ?? "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
