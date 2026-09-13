"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { motion, AnimatePresence } from "framer-motion";
import { Clock3, Eye, EyeOff, Lock, ShieldCheck, UserRound } from "lucide-react";
import { publisherApp } from "@/services/firebase";
import { API_BASE_URL } from "@/services/api";

const PUBLISHER_SESSION_SECONDS = 60 * 60;

export default function PublisherLoginPage() {
  const auth = getAuth(publisherApp);
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => emailRef.current?.focus(), 90);

    if (window.sessionStorage.getItem("publisherSessionExpired") === "1") {
      window.sessionStorage.removeItem("publisherSessionExpired");
      setSessionNotice("Your 60-minute publisher session expired. Please sign in again.");
    }

    return () => clearTimeout(timer);
  }, []);

  const verifyPublisherAccess = async (user: import("firebase/auth").User) => {
    const token = await user.getIdToken();
    const res = await fetch(`${API_BASE_URL}/api/auth/access`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      return {
        ok: false,
        reason: res.status === 401 ? "unauthorized" : "denied",
      };
    }

    const access = await res.json();

    const ok =
      access?.authenticated === true &&
      access?.role === "publisher" &&
      access?.status === "active";

    return {
      ok,
      reason: ok ? "ok" : access?.status || access?.role || "denied",
    };
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCheckingSession(false);
        return;
      }

      try {
        const tokenResult = await user.getIdTokenResult();
        const authTimeSeconds = Number(tokenResult.claims.auth_time || 0);
        const isExpired =
          !authTimeSeconds ||
          Date.now() >= (authTimeSeconds + PUBLISHER_SESSION_SECONDS) * 1000;

        if (isExpired) {
          await signOut(auth);
          setSessionNotice("Your 60-minute publisher session expired. Please sign in again.");
          return;
        }

        const access = await verifyPublisherAccess(user);

        if (access.ok) {
          router.replace("/publisher");
          return;
        }

        await signOut(auth);
      } catch {
        await signOut(auth);
      } finally {
        setCheckingSession(false);
      }
    });

    return () => unsubscribe();
  }, [auth, router]);

  const handleLogin = async () => {
    setError("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError("Enter your publisher email and password.");
      return;
    }

    try {
      setLoading(true);
      setSessionNotice("");
      window.sessionStorage.removeItem("publisherSessionExpired");

      const result = await signInWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );

      const access = await verifyPublisherAccess(result.user);

      if (!access.ok) {
        await signOut(auth);

        if (access.reason === "suspended") {
          setError("This publisher account is suspended.");
        } else if (access.reason === "disabled") {
          setError("Access Revoked. Please contact administrator");
        } else {
          setError("This account does not have publisher access.");
        }

        return;
      }

      router.replace("/publisher");
    } catch (error: unknown) {
      const firebaseCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error
          ? String((error as { code?: unknown }).code || "")
          : "";

      if (firebaseCode === "auth/user-disabled") {
        setError("Access Revoked. Please contact administrator");
      } else {
        setError("Invalid publisher credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f8fa",
          fontFamily: '"Plus Jakarta Sans", sans-serif',
        }}
      >
        <div className="pub-session-loader">
          <span />
          <span />
          <span />
        </div>

        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

          .pub-session-loader {
            display:flex;
            align-items:center;
            gap:7px;
          }

          .pub-session-loader span {
            width:7px;
            height:7px;
            border-radius:50%;
            background:#111827;
            animation: pubPulse 1s ease-in-out infinite;
          }

          .pub-session-loader span:nth-child(2){animation-delay:.14s}
          .pub-session-loader span:nth-child(3){animation-delay:.28s}

          @keyframes pubPulse {
            0%,100% { opacity:.2; transform:translateY(0) }
            50% { opacity:1; transform:translateY(-4px) }
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        *, *::before, *::after {
          box-sizing: border-box;
        }

        .pub-login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f6f7f9;
          font-family: "Plus Jakarta Sans", sans-serif;
          overflow: hidden;
        }

        .pub-form-side {
          width: 100%;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 42px;
          background: #fbfbfc;
        }

        .pub-card {
          width: min(430px, 100%);
          background: rgba(255,255,255,.96);
          border: 1px solid #e9ebef;
          border-radius: 28px;
          padding: 32px;
          box-shadow: 0 24px 70px rgba(15,23,42,.08);
        }

        .pub-card-icon {
          width: 44px;
          height: 44px;
          border-radius: 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f4f5f7;
          border: 1px solid #e8eaee;
          color: #111827;
          margin-bottom: 20px;
        }

        .pub-card-title {
          margin: 0 0 7px;
          font-size: 25px;
          font-weight: 800;
          letter-spacing: -.035em;
          color: #101318;
        }

        .pub-card-sub {
          margin: 0 0 26px;
          font-size: 12px;
          line-height: 1.7;
          font-weight: 400;
          color: #8b94a3;
        }

        .pub-field {
          margin-bottom: 15px;
        }

        .pub-label {
          display: block;
          margin: 0 0 7px 2px;
          color: #727b89;
          font-size: 10px;
          letter-spacing: .065em;
          text-transform: uppercase;
          font-weight: 700;
        }

        .pub-input-wrap {
          position: relative;
        }

        .pub-input {
          width: 100%;
          height: 47px;
          padding: 0 17px;
          border-radius: 999px;
          border: 1.5px solid #e4e7eb;
          background: #fafbfc;
          color: #111827;
          outline: none;
          font-family: inherit;
          font-size: 13px;
          font-weight: 400;
          transition:
            border-color .2s ease,
            box-shadow .2s ease,
            background .2s ease,
            transform .2s cubic-bezier(.22,1,.36,1);
        }

        .pub-input::placeholder {
          color: #b2b8c2;
        }

        .pub-input:focus {
          background: #fff;
          border-color: #111827;
          box-shadow: 0 0 0 4px rgba(17,24,39,.055);
          transform: translateY(-1px);
        }

        .pub-input.password {
          padding-right: 50px;
        }

        .pub-eye {
          position: absolute;
          right: 15px;
          top: 50%;
          transform: translateY(-50%);
          width: 28px;
          height: 28px;
          border: none;
          border-radius: 50%;
          background: transparent;
          color: #9aa1ad;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background .18s ease, color .18s ease;
        }

        .pub-eye:hover {
          background: #f1f3f5;
          color: #111827;
        }

        .pub-error {
          margin-bottom: 16px;
          padding: 10px 13px;
          border-radius: 14px;
          background: #fff5f5;
          border: 1px solid #fee2e2;
          color: #b91c1c;
          font-size: 11px;
          line-height: 1.55;
          font-weight: 500;
        }

        .pub-btn {
          width: 100%;
          height: 47px;
          margin-top: 5px;
          border: 1px solid #111827;
          border-radius: 999px;
          background: #111827;
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-family: inherit;
          font-size: 12px;
          font-weight: 700;
          box-shadow: 0 7px 20px rgba(17,24,39,.15);
          transition:
            transform .2s cubic-bezier(.22,1,.36,1),
            box-shadow .2s ease,
            background .2s ease,
            opacity .2s ease;
        }

        .pub-btn:hover:not(:disabled) {
          background: #000;
          transform: translateY(-1px);
          box-shadow: 0 11px 26px rgba(17,24,39,.19);
        }

        .pub-btn:active:not(:disabled) {
          transform: scale(.985);
        }

        .pub-btn:disabled {
          opacity: .5;
          cursor: not-allowed;
        }

        .pub-spinner {
          width: 13px;
          height: 13px;
          border-radius: 50%;
          border: 1.8px solid rgba(255,255,255,.35);
          border-top-color: #fff;
          animation: pubSpin .65s linear infinite;
        }

        @keyframes pubSpin {
          to { transform: rotate(360deg); }
        }

        .pub-session-toast {
          position:fixed;
          top:18px;
          left:50%;
          transform:translateX(-50%);
          z-index:100;
          display:flex;
          align-items:center;
          gap:9px;
          max-width:min(460px,calc(100vw - 28px));
          padding:11px 14px;
          border-radius:14px;
          border:1px solid #fed7aa;
          background:#fff7ed;
          color:#c2410c;
          box-shadow:0 14px 38px rgba(15,23,42,.12);
          font-size:11px;
          font-weight:700;
        }

        .pub-footnote {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin-top: 18px;
          padding: 11px 12px;
          border-radius: 14px;
          border: 1px solid #edf0f3;
          background: #f8fafc;
          color: #7a8492;
          font-size: 10.5px;
          line-height: 1.55;
          font-weight: 400;
        }

        @media (max-width: 960px) {
          .pub-form-side {
            padding: 24px;
          }
        }

        @media (max-width: 520px) {
          .pub-form-side {
            padding: 16px;
          }

          .pub-card {
            padding: 25px 20px 22px;
            border-radius: 23px;
          }

          .pub-card-title {
            font-size: 22px;
          }
        }
      `}</style>

      <AnimatePresence>
        {sessionNotice && (
          <motion.div
            className="pub-session-toast"
            initial={{ opacity: 0, y: -12, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -8, x: "-50%" }}
          >
            <Clock3 size={14} style={{ flexShrink: 0 }} />
            {sessionNotice}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="pub-login-root">
        <section className="pub-form-side">
          <motion.div
            className="pub-card"
            initial={{ opacity: 0, y: 24, scale: .985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: .42, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="pub-card-icon">
              <UserRound size={19} />
            </div>

            <h2 className="pub-card-title">Publisher Login</h2>
            <p className="pub-card-sub">
              Sign in with the account created for you by the administrator.
            </p>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  key={error}
                  className="pub-error"
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: .18 }}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="pub-field">
              <label className="pub-label">Email Address</label>
              <input
                ref={emailRef}
                className="pub-input"
                type="email"
                placeholder="publisher@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div className="pub-field">
              <label className="pub-label">Password</label>
              <div className="pub-input-wrap">
                <input
                  className="pub-input password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  autoComplete="current-password"
                  disabled={loading}
                />

                <button
                  type="button"
                  className="pub-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={loading}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button className="pub-btn" onClick={handleLogin} disabled={loading}>
              {loading ? (
                <>
                  <span className="pub-spinner" />
                  Verifying…
                </>
              ) : (
                <>
                  <Lock size={14} />
                  Sign in to Publisher Workspace
                </>
              )}
            </button>

            <div className="pub-footnote">
              <ShieldCheck size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              Publisher access is role-restricted. Standard user and administrator accounts cannot enter this workspace.
            </div>
          </motion.div>
        </section>
      </main>
    </>
  );
}
