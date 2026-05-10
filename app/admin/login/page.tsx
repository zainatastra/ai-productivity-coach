"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { adminApp } from "@/services/firebase";
import { Eye, EyeOff, ShieldAlert, Lock } from "lucide-react";
import { API_BASE_URL } from "@/services/api";
import { motion } from "framer-motion";

export default function AdminLoginPage() {
  const auth   = getAuth(adminApp);
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);

  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

  /* auto-focus email field */
  useEffect(() => {
    const t = setTimeout(() => emailRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  /* redirect if already logged in */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) router.replace("/admin");
    });
    return () => unsubscribe();
  }, [auth, router]);

  const handleLogin = async () => {
    setError("");
    if (!email || !password) { setError("Enter admin credentials."); return; }
    try {
      setLoading(true);
      const result = await signInWithEmailAndPassword(auth, email, password);
      const token  = await result.user.getIdToken();
      const res    = await fetch(`${API_BASE_URL}/api/test/admin-users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError("Unauthorized access."); return; }
      router.replace("/admin");
    } catch {
      setError("Invalid admin credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap');

        .al-root {
          font-family: 'Sora', sans-serif;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #060608;
          position: relative;
          overflow: hidden;
          padding: 24px;
        }

        /* background layers */
        .al-bg-grid {
          position: absolute; inset: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(220,38,38,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(220,38,38,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .al-bg-glow {
          position: absolute; pointer-events: none; border-radius: 50%;
          filter: blur(100px);
        }
        .al-glow-1 { width: 500px; height: 500px; top: -120px; left: -120px; background: rgba(220,38,38,0.07); }
        .al-glow-2 { width: 400px; height: 400px; bottom: -100px; right: -100px; background: rgba(220,38,38,0.05); }
        .al-glow-3 { width: 300px; height: 300px; top: 50%; left: 50%; transform: translate(-50%,-50%); background: rgba(220,38,38,0.04); }

        /* vignette */
        .al-vignette {
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%);
        }

        /* card */
        .al-card {
          position: relative; z-index: 1;
          width: 100%; max-width: 420px;
          background: rgba(10,10,12,0.85);
          border: 1px solid rgba(220,38,38,0.18);
          border-radius: 28px;
          padding: 40px 36px 36px;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.03),
            0 24px 60px rgba(0,0,0,0.6),
            0 0 80px rgba(220,38,38,0.06);
          backdrop-filter: blur(24px);
        }

        /* shield icon badge */
        .al-shield {
          width: 52px; height: 52px; border-radius: 999px;
          background: rgba(220,38,38,0.10);
          border: 1px solid rgba(220,38,38,0.22);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 20px;
          color: #ef4444;
          box-shadow: 0 0 20px rgba(220,38,38,0.15);
        }

        /* titles */
        .al-eyebrow {
          font-size: 10px; font-weight: 700; letter-spacing: 0.14em;
          text-transform: uppercase; color: #ef4444;
          text-align: center; margin-bottom: 6px;
        }
        .al-title {
          font-size: 20px; font-weight: 800; color: #f8f8ff;
          text-align: center; letter-spacing: -0.025em; margin-bottom: 6px;
        }
        .al-sub {
          font-size: 12px; color: rgba(255,255,255,0.28);
          text-align: center; margin-bottom: 28px;
          letter-spacing: 0.02em;
        }

        /* divider */
        .al-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(220,38,38,0.2), transparent);
          margin-bottom: 28px;
        }

        /* field */
        .al-field { margin-bottom: 14px; }
        .al-label {
          display: block; font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: rgba(255,255,255,0.3); margin-bottom: 7px;
        }
        .al-input {
          width: 100%; padding: 13px 18px;
          border-radius: 999px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: #f8f8ff; font-size: 13px; font-family: 'Sora', sans-serif;
          outline: none; box-sizing: border-box;
          transition: border-color 0.2s, box-shadow 0.2s;
          caret-color: #ef4444;
        }
        .al-input::placeholder { color: rgba(255,255,255,0.18); }
        .al-input:focus {
          border-color: rgba(220,38,38,0.5);
          box-shadow: 0 0 0 3px rgba(220,38,38,0.10);
          background: rgba(255,255,255,0.055);
        }

        /* password wrapper */
        .al-pw-wrap { position: relative; }
        .al-pw-wrap .al-input { padding-right: 46px; }
        .al-pw-eye {
          position: absolute; right: 16px; top: 50%; transform: translateY(-50%);
          background: none; border: none; color: rgba(255,255,255,0.25);
          cursor: pointer; padding: 0; transition: color 0.15s;
          display: flex; align-items: center;
        }
        .al-pw-eye:hover { color: rgba(255,255,255,0.6); }

        /* error */
        .al-error {
          background: rgba(220,38,38,0.08);
          border: 1px solid rgba(220,38,38,0.22);
          border-radius: 999px;
          padding: 9px 16px;
          font-size: 12px; color: #fca5a5;
          text-align: center; margin-bottom: 16px;
        }

        /* button */
        .al-btn {
          width: 100%; padding: 13px 20px;
          border-radius: 999px; border: none;
          background: linear-gradient(135deg, #dc2626, #b91c1c);
          color: #fff; font-size: 13px; font-weight: 700;
          font-family: 'Sora', sans-serif; cursor: pointer;
          letter-spacing: 0.02em;
          box-shadow: 0 4px 20px rgba(220,38,38,0.35), 0 0 0 1px rgba(255,255,255,0.04);
          transition: opacity 0.15s, transform 0.12s, box-shadow 0.15s;
          margin-top: 6px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .al-btn:hover:not(:disabled) {
          opacity: 0.92;
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(220,38,38,0.48), 0 0 0 1px rgba(255,255,255,0.04);
        }
        .al-btn:active:not(:disabled) { transform: scale(0.985); }
        .al-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        /* footer */
        .al-footer {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          margin-top: 22px;
        }
        .al-footer-line { flex: 1; height: 1px; background: rgba(255,255,255,0.05); }
        .al-footer-text {
          font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: rgba(255,255,255,0.14);
        }
      `}</style>

      <div className="al-root">
        <div className="al-bg-grid" />
        <div className="al-bg-glow al-glow-1" />
        <div className="al-bg-glow al-glow-2" />
        <div className="al-bg-glow al-glow-3" />
        <div className="al-vignette" />

        <motion.div
          className="al-card"
          initial={{ opacity: 0, y: 32, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Shield badge */}
          <div className="al-shield">
            <ShieldAlert size={22} />
          </div>

          <div className="al-eyebrow">Restricted Access</div>
          <div className="al-title">AI-Productivity Coach</div>
          <div className="al-sub">Admin Portal · Authorized Personnel Only</div>

          <div className="al-divider" />

          {/* Error */}
          {error && <div className="al-error">{error}</div>}

          {/* Email */}
          <div className="al-field">
            <label className="al-label">Admin Email</label>
            <input
              ref={emailRef}
              type="email"
              placeholder="admin@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="al-input"
            />
          </div>

          {/* Password */}
          <div className="al-field">
            <label className="al-label">Password</label>
            <div className="al-pw-wrap">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="al-input"
              />
              <button className="al-pw-eye" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Login button */}
          <button className="al-btn" onClick={handleLogin} disabled={loading}>
            <Lock size={14} />
            {loading ? "Verifying…" : "Secure Login"}
          </button>

          {/* Footer */}
          <div className="al-footer">
            <div className="al-footer-line" />
            <span className="al-footer-text">Confidential Access</span>
            <div className="al-footer-line" />
          </div>
        </motion.div>
      </div>
    </>
  );
}
