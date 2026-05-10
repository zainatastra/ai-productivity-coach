"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  getAuth,
} from "firebase/auth";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE_URL } from "@/services/api";
import { app } from "@/services/firebase";

export default function VerifyPage() {
  const router = useRouter();
  const auth   = getAuth(app);

  const [otp,       setOtp]       = useState(["", "", "", "", "", ""]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [timer,     setTimer]     = useState(30);
  const [toastMsg,  setToastMsg]  = useState("");
  const [shake,     setShake]     = useState(false);

  const inputsRef = useRef<HTMLInputElement[]>([]);

  const email =
    typeof window !== "undefined"
      ? sessionStorage.getItem("verifyEmail") ?? ""
      : "";

  /* ── auto-focus first box ── */
  useEffect(() => {
    const t = setTimeout(() => inputsRef.current[0]?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  /* ── countdown timer ── */
  useEffect(() => {
    if (timer <= 0) return;
    const iv = setInterval(() => setTimer(t => t - 1), 1000);
    return () => clearInterval(iv);
  }, [timer]);

  /* ── mask email ── */
  const maskEmail = (e: string) => {
    if (!e) return "";
    const [name, domain] = e.split("@");
    if (name.length <= 5) return e;
    return `${name.slice(0, 3)}${"*".repeat(name.length - 5)}${name.slice(-2)}@${domain}`;
  };

  /* ── show toast ── */
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2800);
  };

  /* ── trigger shake + reset ── */
  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
    setOtp(["", "", "", "", "", ""]);
    setTimeout(() => inputsRef.current[0]?.focus(), 50);
  };

  /* ── handle digit input ── */
  const handleChange = (value: string, index: number) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) inputsRef.current[index + 1]?.focus();
    if (next.join("").length === 6) handleVerify(next.join(""));
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Backspace" && !otp[index] && index > 0)
      inputsRef.current[index - 1]?.focus();
  };

  /* ── paste: distribute digits across boxes ── */
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").trim().replace(/\D/g, "");
    if (!pasted) return;
    const digits = pasted.slice(0, 6).split("");
    const next   = ["", "", "", "", "", ""];
    digits.forEach((d, i) => { next[i] = d; });
    setOtp(next);
    const focusIdx = Math.min(digits.length, 5);
    inputsRef.current[focusIdx]?.focus();
    if (digits.length === 6) handleVerify(digits.join(""));
  };


  /* ── verify OTP ── */
  const handleVerify = async (codeParam?: string) => {
    const code = codeParam ?? otp.join("");
    if (code.length !== 6) return;

    try {
      setLoading(true);
      setError("");

      const res = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, code }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          text.toLowerCase().includes("expired")
            ? "Your code has expired. Please request a new one."
            : "Incorrect code. Please try again."
        );
      }

      const password   = sessionStorage.getItem("verifyPassword")   ?? "";
      const name       = sessionStorage.getItem("verifyName")       ?? "";
      const surname    = sessionStorage.getItem("verifySurname")    ?? "";
      const company    = sessionStorage.getItem("verifyCompany")    ?? "";
      const telephone  = sessionStorage.getItem("verifyTelephone")  ?? "";
      const newsletter = sessionStorage.getItem("verifyNewsletter") === "true";

      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName: `${name} ${surname}` });
      const token = await result.user.getIdToken(true);

      await fetch(`${API_BASE_URL}/api/User/sync`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ name, surname, company, telephone, newsletter }),
      });

      sessionStorage.clear();
      router.replace("/");
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  /* ── resend OTP ── */
  const resendCode = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/send-otp`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      });

      if (!res.ok) {
        const text = await res.text();

        // 429 — rate limit
        if (res.status === 429 || text.toLowerCase().includes("limit") || text.toLowerCase().includes("exhausted")) {
          setError("Too many attempts. Please wait 60 minutes before requesting another code.");
          return;
        }

        throw new Error(text || "Failed to resend code.");
      }

      setTimer(30);
      setError("");
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => inputsRef.current[0]?.focus(), 50);
      showToast("A new code has been sent to your email.");
    } catch (err: any) {
      setError(err.message ?? "Failed to resend. Please try again.");
    }
  };

  const filled = otp.filter(Boolean).length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap');

        .vp-root {
          font-family: 'Sora', sans-serif;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fff;
          padding: 24px;
        }

        .vp-card {
          width: 100%;
          max-width: 400px;
        }

        /* logo */
        .vp-logo { display: flex; justify-content: center; margin-bottom: 28px; }
        .vp-logo img { height: 56px; width: auto; object-fit: contain; }

        /* shield badge */
        .vp-shield {
          width: 52px; height: 52px; border-radius: 999px;
          background: #f4f3ff;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 20px; color: #7c3aed;
        }

        .vp-title {
          font-size: 22px; font-weight: 800; color: #0d0d0d;
          letter-spacing: -0.025em; text-align: center; margin-bottom: 6px;
        }
        .vp-sub {
          font-size: 13px; color: #9ca3af; text-align: center; line-height: 1.6; margin-bottom: 8px;
        }
        .vp-email { font-weight: 600; color: #374151; }

        .vp-divider { width: 32px; height: 2px; background: #f3f4f6; border-radius: 999px; margin: 16px auto 24px; }

        /* OTP row */
        .vp-otp-row {
          display: flex; align-items: center; gap: 8px;
          justify-content: center; margin-bottom: 8px;
        }

        .vp-box {
          width: 46px; height: 54px;
          border: 1.5px solid #e5e7eb; border-radius: 14px;
          background: #fff; text-align: center;
          font-size: 20px; font-weight: 700; color: #0d0d0d;
          font-family: 'Sora', sans-serif;
          outline: none; caret-color: #7c3aed;
          transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
        }
        .vp-box:focus {
          border-color: #7c3aed;
          box-shadow: 0 0 0 3px rgba(124,58,237,0.10);
          background: #faf9ff;
        }
        .vp-box.filled { border-color: #7c3aed; background: #faf9ff; }
        .vp-box:disabled { background: #f9fafb; opacity: 0.6; cursor: not-allowed; }


        /* error */
        .vp-error {
          font-size: 12px; color: #dc2626; text-align: center;
          margin: 6px 0 10px; line-height: 1.5;
          background: #fef2f2; border: 1px solid #fecaca;
          border-radius: 999px; padding: 7px 14px;
        }

        /* CTA button */
        .vp-btn {
          width: 100%; padding: 13px;
          border-radius: 999px; border: none;
          background: #0d0d0d; color: #fff;
          font-size: 14px; font-weight: 700; font-family: 'Sora', sans-serif;
          cursor: pointer; letter-spacing: 0.01em;
          transition: opacity 0.15s, transform 0.12s;
          box-shadow: 0 2px 10px rgba(0,0,0,0.15);
          margin-top: 4px;
        }
        .vp-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
        .vp-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        /* resend row */
        .vp-resend {
          text-align: center; margin-top: 18px;
          font-size: 13px; color: #9ca3af;
        }
        .vp-resend-link {
          color: #7c3aed; font-weight: 600; cursor: pointer;
          background: none; border: none; font-family: 'Sora', sans-serif;
          font-size: 13px; padding: 0; transition: color 0.15s;
        }
        .vp-resend-link:hover { color: #5b21b6; }

        /* back link */
        .vp-back {
          display: flex; align-items: center; justify-content: center; gap: 5px;
          margin-top: 16px; font-size: 12px; color: #9ca3af;
          cursor: pointer; border: none; background: none;
          font-family: 'Sora', sans-serif; transition: color 0.15s; padding: 0;
        }
        .vp-back:hover { color: #374151; }

        /* progress dots */
        .vp-dots { display: flex; gap: 5px; justify-content: center; margin-bottom: 20px; }
        .vp-dot {
          width: 7px; height: 7px; border-radius: 999px;
          background: #e5e7eb; transition: background 0.2s, transform 0.2s;
        }
        .vp-dot.active { background: #7c3aed; transform: scale(1.2); }

        /* toast */
        .vp-toast {
          position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
          background: #0d0d0d; color: #fff;
          padding: 10px 20px; border-radius: 999px;
          font-size: 13px; font-weight: 500; font-family: 'Sora', sans-serif;
          box-shadow: 0 8px 24px rgba(0,0,0,0.18); white-space: nowrap; z-index: 100;
        }

        /* shake */
        @keyframes vp-shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-6px); }
          40%       { transform: translateX(6px); }
          60%       { transform: translateX(-4px); }
          80%       { transform: translateX(4px); }
        }
        .vp-shake { animation: vp-shake 0.45s ease; }
      `}</style>

      {/* Toast */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            className="vp-toast"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
          >
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="vp-root">
        <div className="vp-card">

          {/* Logo */}
          <div className="vp-logo">
            <img src="/logo.png" alt="AI-Productivity Coach" />
          </div>

          {/* Shield icon */}
          <div className="vp-shield">
            <ShieldCheck size={24} />
          </div>

          <div className="vp-title">Check your inbox</div>
          <p className="vp-sub">
            We sent a 6-digit code to<br />
            <span className="vp-email">{maskEmail(email)}</span>
          </p>

          <div className="vp-divider" />

          {/* Progress dots */}
          <div className="vp-dots">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className={`vp-dot ${i < filled ? "active" : ""}`} />
            ))}
          </div>

          {/* OTP boxes */}
          <div className={shake ? "vp-shake" : ""}>
            <div className="vp-otp-row">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={el => { if (el) inputsRef.current[index] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  disabled={loading}
                  className={`vp-box ${digit ? "filled" : ""}`}
                  onChange={e => handleChange(e.target.value, index)}
                  onKeyDown={e => handleKeyDown(e, index)}
                  onPaste={handlePaste}
                  autoComplete="one-time-code"
                />
              ))}

            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  className="vp-error"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Continue button */}
            <button
              className="vp-btn"
              onClick={() => handleVerify()}
              disabled={loading || filled < 6}
            >
              {loading ? "Verifying…" : "Continue"}
            </button>
          </div>

          {/* Resend */}
          <div className="vp-resend">
            {timer > 0 ? (
              <span>Resend code in <strong style={{ color: "#374151" }}>{timer}s</strong></span>
            ) : (
              <button className="vp-resend-link" onClick={resendCode}>
                Resend Code
              </button>
            )}
          </div>

          {/* Back */}
          <button className="vp-back" onClick={() => router.push("/auth?mode=signup")}>
            <ArrowLeft size={13} />
            Back to sign up
          </button>

        </div>
      </div>
    </>
  );
}
