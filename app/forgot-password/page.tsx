"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { app } from "@/services/firebase";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const auth   = getAuth(app);

  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Small delay ensures AnimatePresence has mounted the element
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async () => {
    if (!email || loading) return;
    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, email);
    } catch {
      // Firebase hides whether email exists for security
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap');

        .fp-root {
          font-family: 'Sora', sans-serif;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fff;
          padding: 24px;
        }

        .fp-card {
          width: 100%;
          max-width: 380px;
        }

        .fp-icon-wrap {
          width: 52px;
          height: 52px;
          border-radius: 999px;
          background: #f4f3ff;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 24px;
          color: #7c3aed;
        }

        .fp-title {
          font-size: 22px;
          font-weight: 800;
          color: #0d0d0d;
          letter-spacing: -0.025em;
          margin-bottom: 6px;
        }

        .fp-sub {
          font-size: 13px;
          color: #9ca3af;
          line-height: 1.6;
          margin-bottom: 28px;
        }

        .fp-field {
          position: relative;
          margin-bottom: 12px;
        }

        .fp-input {
          width: 100%;
          padding: 14px 20px;
          border: 1.5px solid #e5e7eb;
          border-radius: 999px;
          font-size: 14px;
          font-family: 'Sora', sans-serif;
          color: #0d0d0d;
          outline: none;
          background: #fff;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
        }
        .fp-input::placeholder { color: #c4c9d4; }
        .fp-input:focus {
          border-color: #7c3aed;
          box-shadow: 0 0 0 3px rgba(124,58,237,0.10);
        }

        .fp-btn {
          width: 100%;
          padding: 14px 20px;
          background: #0d0d0d;
          color: #fff;
          border: none;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 700;
          font-family: 'Sora', sans-serif;
          cursor: pointer;
          margin-top: 4px;
          transition: background 0.18s, transform 0.15s, opacity 0.18s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .fp-btn:hover:not(:disabled) {
          background: #1f1f1f;
          transform: translateY(-1px);
        }
        .fp-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .fp-back {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 20px;
          font-size: 13px;
          color: #9ca3af;
          cursor: pointer;
          border: none;
          background: none;
          font-family: 'Sora', sans-serif;
          transition: color 0.18s;
          padding: 0;
        }
        .fp-back:hover { color: #0d0d0d; }

        .fp-success-icon {
          width: 52px;
          height: 52px;
          border-radius: 999px;
          background: #f0fdf4;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 24px;
          color: #16a34a;
        }

        .fp-divider {
          width: 32px;
          height: 2px;
          background: #f3f4f6;
          border-radius: 999px;
          margin-bottom: 28px;
        }
      `}</style>

      <div className="fp-root">
        <div className="fp-card">

          <AnimatePresence mode="wait">

            {/* ── DEFAULT STATE ── */}
            {!sent ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="fp-icon-wrap">
                  <Mail size={22} />
                </div>

                <div className="fp-title">Forgot password?</div>
                <div className="fp-divider" />
                <p className="fp-sub">
                  Enter your email and we'll send you a link to reset your password.
                </p>

                <div className="fp-field">
                  <input
                    className="fp-input"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    ref={inputRef}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  />
                </div>

                <button
                  className="fp-btn"
                  onClick={handleSubmit}
                  disabled={loading || !email}
                >
                  {loading ? "Sending…" : "Send reset link"}
                </button>

                <button
                  className="fp-back"
                  onClick={() => router.push("/auth?mode=login")}
                >
                  <ArrowLeft size={14} />
                  Back to login
                </button>
              </motion.div>

            ) : (

              /* ── SUCCESS STATE ── */
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="fp-success-icon">
                  <CheckCircle size={22} />
                </div>

                <div className="fp-title">Check your inbox</div>
                <div className="fp-divider" />
                <p className="fp-sub">
                  If <strong style={{ color: "#0d0d0d", fontWeight: 600 }}>{email}</strong> is registered, a reset link is on its way. Check your spam folder too.
                </p>

                <button
                  className="fp-btn"
                  onClick={() => router.push("/auth?mode=login")}
                >
                  Back to login
                </button>

                <button
                  className="fp-back"
                  onClick={() => { setSent(false); setEmail(""); }}
                >
                  Try a different email
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
