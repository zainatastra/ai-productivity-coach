"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Loader2, X } from "lucide-react";
import { API_BASE_URL } from "@/services/api";

type Props = { slug: string; companyName: string; isGerman: boolean };

const TEXT = {
  button: { de: "Dieses Profil beanspruchen", en: "Claim this profile" },
  title: { de: "Profil beanspruchen", en: "Claim this profile" },
  intro: {
    de: "Gehören Sie zu {company}? Senden Sie uns Ihre Angaben. Wir prüfen die Anfrage, bevor irgendjemand Zugriff auf das Profil erhält.",
    en: "Do you work at {company}? Send us your details. We check every request before anyone gets access to the profile.",
  },
  name: { de: "Ihr Name", en: "Your name" },
  email: { de: "Geschäftliche E-Mail-Adresse", en: "Work email address" },
  position: { de: "Ihre Position im Unternehmen", en: "Your position at the company" },
  phone: { de: "Telefon (optional)", en: "Phone (optional)" },
  message: { de: "Nachricht (optional)", en: "Message (optional)" },
  send: { de: "Anfrage senden", en: "Send request" },
  close: { de: "Schließen", en: "Close" },
  done: {
    de: "Vielen Dank! Wir prüfen Ihre Anfrage und melden uns per E-Mail. Es wird kein Zugang automatisch vergeben.",
    en: "Thank you! We will check your request and get back to you by email. No access is granted automatically.",
  },
} as const;

const ERRORS: Record<string, { de: string; en: string }> = {
  claim_name_required: { de: "Bitte geben Sie Ihren Namen an.", en: "Please enter your name." },
  claim_name_too_long: { de: "Der Name ist zu lang.", en: "The name is too long." },
  claim_email_invalid: { de: "Bitte geben Sie eine gültige E-Mail-Adresse an.", en: "Please enter a valid email address." },
  claim_position_required: { de: "Bitte geben Sie Ihre Position an.", en: "Please enter your position." },
  claim_position_too_long: { de: "Die Position ist zu lang.", en: "The position is too long." },
  claim_phone_too_long: { de: "Die Telefonnummer ist zu lang.", en: "The phone number is too long." },
  claim_message_too_long: { de: "Die Nachricht ist zu lang (höchstens 1000 Zeichen).", en: "The message is too long (1000 characters at most)." },
  too_many_attempts: { de: "Zu viele Versuche. Bitte versuchen Sie es später erneut.", en: "Too many attempts. Please try again later." },
  not_claimable: { de: "Dieses Profil kann nicht beansprucht werden.", en: "This profile cannot be claimed." },
};

export default function ClaimProfile({ slug, companyName, isGerman }: Props) {
  const lang = isGerman ? "de" : "en";
  const t = (key: keyof typeof TEXT) => TEXT[key][lang];

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", position: "", phone: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/providers/${encodeURIComponent(slug)}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) { setDone(true); return; }

      const data = await res.json().catch(() => null);
      const known = data?.code ? ERRORS[data.code] : undefined;
      setError(known ? known[lang] : isGerman ? "Die Anfrage konnte nicht gesendet werden. Bitte später erneut versuchen." : "The request could not be sent. Please try again later.");
    } catch {
      setError(isGerman ? "Keine Verbindung. Bitte später erneut versuchen." : "No connection. Please try again later.");
    } finally {
      setBusy(false);
    }
  };

  const input = (key: keyof typeof form, label: keyof typeof TEXT, type = "text", max = 120, ref?: React.Ref<HTMLInputElement>) => (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 }}>{t(label)}</span>
      <input ref={ref} type={type} value={form[key]} maxLength={max} disabled={busy} required={key !== "phone"}
        onChange={(e) => set(key, e.target.value)}
        style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px", font: "inherit", fontSize: 14 }} />
    </label>
  );

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setDone(false); setError(""); }}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 999, border: "1px solid #111827", background: "#111827", color: "#fff", font: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        <BadgeCheck size={13} /> {t("button")}
      </button>

      {open && (
        <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(17,24,39,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div role="dialog" aria-modal="true" aria-label={t("title")}
            style={{ background: "#fff", borderRadius: 20, padding: 24, width: "min(480px,100%)", maxHeight: "92vh", overflowY: "auto", color: "#111827" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>{t("title")}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("close")}
                style={{ border: 0, background: "transparent", cursor: "pointer", padding: 4 }}><X size={18} /></button>
            </div>

            {done ? (
              <>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: "#166534", background: "#dcfce7", borderRadius: 12, padding: "12px 14px" }}>{t("done")}</p>
                <button type="button" onClick={() => setOpen(false)}
                  style={{ marginTop: 8, height: 38, padding: "0 16px", borderRadius: 999, border: "1px solid #d1d5db", background: "#fff", font: "inherit", fontWeight: 700, cursor: "pointer" }}>{t("close")}</button>
              </>
            ) : (
              <form onSubmit={submit} noValidate={false}>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#4b5563", margin: "0 0 16px" }}>{t("intro").replace("{company}", companyName)}</p>

                {input("name", "name", "text", 120, firstField)}
                {input("email", "email", "email", 160)}
                {input("position", "position", "text", 120)}
                {input("phone", "phone", "tel", 40)}

                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 }}>{t("message")}</span>
                  <textarea value={form.message} maxLength={1000} rows={3} disabled={busy} onChange={(e) => set("message", e.target.value)}
                    style={{ width: "100%", borderRadius: 10, border: "1px solid #d1d5db", padding: "10px 12px", font: "inherit", fontSize: 14, resize: "vertical" }} />
                </label>

                {/* A field no person sees or fills in: only a bot does, and its request is quietly dropped. */}
                <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
                  <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} />
                </div>

                {error && <div role="alert" style={{ color: "#991b1b", background: "#fee2e2", borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>{error}</div>}

                <button type="submit" disabled={busy}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 42, padding: "0 20px", borderRadius: 999, border: 0, background: "#111827", color: "#fff", font: "inherit", fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
                  {busy && <Loader2 size={14} className="animate-spin" />} {t("send")}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
