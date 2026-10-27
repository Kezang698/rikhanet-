"use client";
import type { FormEvent } from "react";
import { Modal } from "./ui";
import type { DialogSpec } from "./context";

export function DialogForm({ spec, close }: { spec: DialogSpec; close: () => void }) {
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
