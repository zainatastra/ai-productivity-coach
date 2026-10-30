"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { Check, Loader2 } from "lucide-react";
import { publisherApp } from "@/services/firebase";
import { API_BASE_URL } from "@/services/api";
import { CONTENT_ERRORS, Lang, tr } from "./aiPublishingText";
import { rt, type RKey } from "./reviewText";


type Preview = { valid: boolean; email?: string; providerName?: string; accountExists?: boolean };

function InviteContent() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const auth = getAuth(publisherApp);

  const [lang, setLang] = useState<Lang>("de");
  const t = (key: RKey) => rt(key, lang);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<null | "created" | "accepted">(null);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), [auth]);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/ai/invitations/preview?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({ valid: false }));
        if (!cancelled) setPreview(res.ok ? data : { valid: false });
      } catch {
        if (!cancelled) setPreview({ valid: false });
      }
    }, 0);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [token]);

  const errorText = useCallback((code?: string) => {
    if (code === "weak_password") return rt("i_err_weak", lang);
    if (code === "account_exists") return rt("i_err_exists", lang);
    if (code === "too_many_attempts") return rt("i_err_many", lang);
    if (code === "wrong_account") return rt("i_wrongAccount", lang);
    return tr(code ? CONTENT_ERRORS[code] : undefined, lang, rt("c_err_generic", lang));
  }, [lang]);

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setError("");
    if (password !== password2) { setError(t("i_pwMismatch")); return; }

    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/invitations/accept-new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, fullName: name }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) { setError(errorText(data?.code)); return; }
      setDone("created");
    } catch {
      setError(t("c_err_network"));
    } finally {
      setBusy(false);
    }
  };

  const acceptExisting = async () => {
    if (!user || busy) return;

    setBusy(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/ai/company/invitations/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) { setError(res.status === 401 || res.status === 403 ? t("c_err_session") : errorText(data?.code)); return; }
      setDone("accepted");
    } catch {
      setError(t("c_err_network"));
    } finally {
      setBusy(false);
    }
  };

  const loginHref = `/publisher/login?next=${encodeURIComponent(`/publisher/invite?token=${token}`)}`;

  return (
    <div className="iv-root">
      <style>{CSS}</style>
      <div className="iv-card">
        <div className="iv-top">
          <h1 className="iv-h1">{t("i_title")}</h1>
          <div className="iv-lang" role="group" aria-label="Language">
            <button className={lang === "de" ? "on" : ""} onClick={() => setLang("de")}>DE</button>
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
          </div>
        </div>

        {preview === null && <div className="iv-row"><Loader2 size={16} className="iv-spin" /> <span>{t("c_loading")}</span></div>}

        {preview && !preview.valid && <p className="iv-error">{t("i_invalid")}</p>}

        {preview?.valid && !done && (
          <>
            <p className="iv-lead">{t("i_for")} <strong>{preview.providerName}</strong>.</p>

            {!preview.accountExists ? (
              <form onSubmit={createAccount}>
                <label className="iv-label">{t("i_email")}</label>
                <input className="iv-input" value={preview.email} readOnly />

                <label className="iv-label">{t("i_name")}</label>
                <input className="iv-input" value={name} maxLength={100} autoComplete="name" onChange={(e) => setName(e.target.value)} />

                <label className="iv-label">{t("i_password")}</label>
                <input className="iv-input" type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
                <div className="iv-hint">{t("i_pwHint")}</div>

                <label className="iv-label">{t("i_password2")}</label>
                <input className="iv-input" type="password" value={password2} autoComplete="new-password" onChange={(e) => setPassword2(e.target.value)} />

                {error && <p className="iv-error">{error}</p>}

                <button className="iv-btn" type="submit" disabled={busy || password.length < 10 || !password2}>
                  {busy ? <Loader2 size={14} className="iv-spin" /> : null}
                  <span>{busy ? t("i_creating") : t("i_create")}</span>
                </button>
              </form>
            ) : (
              <>
                <p className="iv-hint" style={{ fontSize: 13.5 }}>{t("i_existing")}</p>
                {user ? (
                  <>
                    <p className="iv-hint">{t("i_signedAs")} <strong>{user.email}</strong></p>
                    {error && <p className="iv-error">{error}</p>}
                    <button className="iv-btn" disabled={busy} onClick={acceptExisting}>
                      {busy ? <Loader2 size={14} className="iv-spin" /> : null} <span>{t("i_acceptExisting")}</span>
                    </button>
                  </>
                ) : (
                  <a className="iv-btn" href={loginHref}><span>{t("i_goLogin")}</span></a>
                )}
              </>
            )}
          </>
        )}

        {done === "created" && (
          <>
            <p className="iv-ok"><Check size={16} /> <span>{t("i_done")}</span></p>
            <p className="iv-hint" style={{ fontSize: 13.5 }}>{t("i_doneHelp")}</p>
            <a className="iv-btn" href="/publisher/login?next=/publisher/ai-review"><span>{t("i_goLogin")}</span></a>
          </>
        )}

        {done === "accepted" && (
          <>
            <p className="iv-ok"><Check size={16} /> <span>{t("i_accepted")}</span></p>
            <a className="iv-btn" href="/publisher/ai-review"><span>{t("i_openReview")}</span></a>
          </>
        )}
      </div>
    </div>
  );
}

export default function InviteAccept() {
  return (
    <Suspense fallback={null}>
      <InviteContent />
    </Suspense>
  );
}

const CSS = `
.iv-root { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#f7f8fa; padding:24px 16px; font-family:"Plus Jakarta Sans",system-ui,sans-serif; }
.iv-card { width:100%; max-width:440px; background:#fff; border:1px solid #e5e7eb; border-radius:20px; padding:30px; box-shadow:0 10px 40px rgba(15,23,42,.08); }
.iv-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
.iv-h1 { font-size:22px; font-weight:800; letter-spacing:-.02em; margin:0; color:#111827; }
.iv-lang { display:inline-flex; background:#f3f4f6; border-radius:999px; padding:3px; }
.iv-lang button { border:0; background:transparent; padding:5px 11px; border-radius:999px; font-size:12px; font-weight:800; color:#6b7280; cursor:pointer; font-family:inherit; }
.iv-lang button.on { background:#fff; color:#111827; box-shadow:0 1px 3px rgba(0,0,0,.12); }
.iv-lead { font-size:14.5px; color:#374151; line-height:1.55; margin:0 0 16px; }
.iv-label { display:block; font-size:11px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:#6b7280; margin:14px 0 6px; }
.iv-input { width:100%; box-sizing:border-box; height:44px; padding:0 14px; border:1.5px solid #e5e7eb; border-radius:12px; font-family:inherit; font-size:14px; background:#fff; color:#111827; }
.iv-input[readonly] { background:#f9fafb; color:#6b7280; }
.iv-input:focus { outline:none; border-color:#78d2f5; box-shadow:0 0 0 3px rgba(120,210,245,.22); }
.iv-hint { font-size:12px; color:#9ca3af; margin-top:5px; }
.iv-error { color:#dc2626; font-size:13px; font-weight:700; margin:14px 0 0; }
.iv-ok { display:flex; align-items:center; gap:8px; color:#059669; font-weight:800; font-size:15px; margin:6px 0; }
.iv-btn { margin-top:18px; width:100%; height:46px; display:inline-flex; align-items:center; justify-content:center; gap:8px; border-radius:999px; border:0; background:#111; color:#fff; font-family:inherit; font-size:14px; font-weight:800; cursor:pointer; text-decoration:none; }
.iv-btn:disabled { opacity:.45; cursor:not-allowed; }
.iv-row { display:flex; align-items:center; gap:8px; color:#6b7280; font-size:14px; }
.iv-spin { animation:ivspin 1s linear infinite; } @keyframes ivspin { to { transform:rotate(360deg); } }
`;
