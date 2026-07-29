"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, ShieldCheck, X } from "lucide-react";

import { app } from "@/services/firebase";
import { API_BASE_URL } from "@/services/api";
import { useLanguage } from "@/services/LanguageContext";
import ConfirmModal from "@/components/ConfirmModal";
import FloatingInput from "@/components/FloatingInput";

const PhoneInput = dynamic(() => import("@/components/PhoneInput"), {
  ssr: false,
});

type AuthMode = "login" | "signup";
type AuthStep = "auth" | "verify";

interface AuthModalProps {
  open: boolean;
  initialMode?: AuthMode;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function AuthModal({
  open,
  initialMode = "login",
  onClose,
  onSuccess,
}: AuthModalProps) {
  const auth = getAuth(app);
  const router = useRouter();
  const { language } = useLanguage();
  const lang = language === "de" ? "de" : "en";

  const [step, setStep] = useState<AuthStep>("auth");
  const [mode, setMode] = useState<AuthMode>(initialMode);

  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [company, setCompany] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [newsletter, setNewsletter] = useState(false);
  const [phone, setPhone] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [topError, setTopError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState("");

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [timer, setTimer] = useState(30);
  const [toastMsg, setToastMsg] = useState("");
  const [shake, setShake] = useState(false);
  const [closingSuccess, setClosingSuccess] = useState(false);

  const inputsRef = useRef<HTMLInputElement[]>([]);

  useEffect(() => {
    if (!open) return;
    setStep("auth");
    setMode(initialMode);
    setShowPassword(false);
    setFieldError("");
    setTopError("");
    setModalOpen(false);
    setOtp(["", "", "", "", "", ""]);
    setOtpError("");
    setTimer(30);
    setToastMsg("");
    setShake(false);
    setClosingSuccess(false);
  }, [open, initialMode]);

  useEffect(() => {
    if (!open || step !== "verify") return;
    const t = setTimeout(() => inputsRef.current[0]?.focus(), 120);
    return () => clearTimeout(t);
  }, [open, step]);

  useEffect(() => {
    if (!open || step !== "verify" || timer <= 0) return;
    const iv = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(iv);
  }, [open, step, timer]);

  const t = {
    en: {
      welcome: "Welcome",
      login: "Login",
      signup: "Sign Up",
      email: "Email",
      password: "Password",
      name: "Name *",
      surname: "Surname *",
      company: "Company *",
      forgot: "Forgot password?",
      create: "Create Account",
      loggingIn: "Logging in...",
      creating: "Creating...",
      agree: "I agree to the",
      terms: "T&Cs",
      privacy: "Privacy Policy",
      and: "and",
      missing: "Missing Information",
      fillLogin: "Please fill in both Email and Password.",
      fillAll: "Please fill in all required fields.",
      acceptTerms: "You must accept the Terms of Use and Privacy Policy.",
      validPhone: "Please enter a valid phone number.",
      noAccount: "No account found with this email. Please sign up.",
      invalid: "Invalid Credential, Please try again",
      otpFailed: "Failed to send verification code. Please try again.",
      verifyTitle: "Check your inbox",
      verifySub: "We sent a 6-digit code to",
      verifying: "Verifying…",
      continue: "Continue",
      resendIn: "Resend code in",
      resend: "Resend Code",
      sentAgain: "A new code has been sent to your email.",
      backSignup: "Back to sign up",
      expired: "Your code has expired. Please request a new one.",
      incorrect: "Incorrect code. Please try again.",
      tooMany: "Too many attempts. Please wait 60 minutes before requesting another code.",
    },
    de: {
      welcome: "Willkommen",
      login: "Anmelden",
      signup: "Registrieren",
      email: "E-Mail",
      password: "Passwort",
      name: "Vorname *",
      surname: "Nachname *",
      company: "Firma *",
      forgot: "Passwort vergessen?",
      create: "Konto erstellen",
      loggingIn: "Anmeldung läuft...",
      creating: "Wird erstellt...",
      agree: "Ich stimme den",
      terms: "AGB",
      privacy: "Datenschutzbestimmungen",
      and: "und",
      missing: "Fehlende Angaben",
      fillLogin: "Bitte geben Sie E-Mail und Passwort ein.",
      fillAll: "Bitte füllen Sie alle Pflichtfelder aus.",
      acceptTerms: "Sie müssen den Nutzungsbedingungen und der Datenschutzerklärung zustimmen.",
      validPhone: "Bitte geben Sie eine gültige Telefonnummer ein.",
      noAccount: "Für diese E-Mail wurde kein Konto gefunden. Bitte registrieren Sie sich.",
      invalid: "Ungültige Anmeldedaten. Bitte versuchen Sie es erneut.",
      otpFailed: "Der Bestätigungscode konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
      verifyTitle: "Prüfen Sie Ihr Postfach",
      verifySub: "Wir haben einen 6-stelligen Code gesendet an",
      verifying: "Wird geprüft…",
      continue: "Weiter",
      resendIn: "Code erneut senden in",
      resend: "Code erneut senden",
      sentAgain: "Ein neuer Code wurde an Ihre E-Mail gesendet.",
      backSignup: "Zurück zur Registrierung",
      expired: "Ihr Code ist abgelaufen. Bitte fordern Sie einen neuen an.",
      incorrect: "Falscher Code. Bitte versuchen Sie es erneut.",
      tooMany: "Zu viele Versuche. Bitte warten Sie 60 Minuten, bevor Sie einen neuen Code anfordern.",
    },
  }[lang];

  const openInfoModal = (message: string) => {
    setModalMessage(message);
    setModalOpen(true);
  };

  const closeWithSuccess = () => {
    setClosingSuccess(true);
    setTimeout(() => {
      onSuccess?.();
      onClose();
    }, 420);
  };

  const handleForgotPassword = () => {
    onClose();
    setTimeout(() => router.push("/forgot-password"), 120);
  };

  const handleLogin = async () => {
    setFieldError("");
    setTopError("");

    if (!email || !password) {
      openInfoModal(t.fillLogin);
      return;
    }

    try {
      setLoading(true);

      const result = await signInWithEmailAndPassword(auth, email, password);
      const token = await result.user.getIdToken(true);

      await fetch(`${API_BASE_URL}/api/User/sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          surname,
          company,
          telephone: phone,
        }),
      });

      closeWithSuccess();
    } catch (error: any) {
      if (error.code === "auth/user-not-found") {
        setFieldError(t.noAccount);
      } else {
        setTopError(t.invalid);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    setFieldError("");
    setTopError("");

    if (!name || !surname || !company || !phone || !email || !password) {
      openInfoModal(t.fillAll);
      return;
    }

    if (!termsAccepted) {
      openInfoModal(t.acceptTerms);
      return;
    }

    if (!phone || !phone.startsWith("+")) {
      openInfoModal(t.validPhone);
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${API_BASE_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) throw new Error("Failed to send OTP");

      sessionStorage.setItem("verifyEmail", email);
      sessionStorage.setItem("verifyPassword", password);
      sessionStorage.setItem("verifyName", name);
      sessionStorage.setItem("verifySurname", surname);
      sessionStorage.setItem("verifyCompany", company);
      sessionStorage.setItem("verifyTelephone", phone);
      sessionStorage.setItem("verifyNewsletter", newsletter.toString());
      sessionStorage.setItem("pendingVerification", "true");

      setOtp(["", "", "", "", "", ""]);
      setOtpError("");
      setTimer(30);
      setStep("verify");
    } catch {
      setTopError(t.otpFailed);
    } finally {
      setLoading(false);
    }
  };

  const maskEmail = (e: string) => {
    if (!e) return "";
    const [namePart, domain] = e.split("@");
    if (!domain || namePart.length <= 5) return e;
    return `${namePart.slice(0, 3)}${"*".repeat(namePart.length - 5)}${namePart.slice(-2)}@${domain}`;
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2800);
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
    setOtp(["", "", "", "", "", ""]);
    setTimeout(() => inputsRef.current[0]?.focus(), 50);
  };

  const handleOtpChange = (value: string, index: number) => {
    if (!/^\d*$/.test(value)) return;

    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);

    if (value && index < 5) inputsRef.current[index + 1]?.focus();
    if (next.join("").length === 6) handleVerify(next.join(""));
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();

    const pasted = e.clipboardData.getData("text").trim().replace(/\D/g, "");
    if (!pasted) return;

    const digits = pasted.slice(0, 6).split("");
    const next = ["", "", "", "", "", ""];
    digits.forEach((d, i) => {
      next[i] = d;
    });

    setOtp(next);
    inputsRef.current[Math.min(digits.length, 5)]?.focus();

    if (digits.length === 6) handleVerify(digits.join(""));
  };

  const handleVerify = async (codeParam?: string) => {
    const code = codeParam ?? otp.join("");
    if (code.length !== 6) return;

    try {
      setLoading(true);
      setOtpError("");

      const verifyEmail = sessionStorage.getItem("verifyEmail") ?? email;
      const res = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verifyEmail, code }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          text.toLowerCase().includes("expired") ? t.expired : t.incorrect
        );
      }

      const verifyPassword = sessionStorage.getItem("verifyPassword") ?? password;
      const verifyName = sessionStorage.getItem("verifyName") ?? name;
      const verifySurname = sessionStorage.getItem("verifySurname") ?? surname;
      const verifyCompany = sessionStorage.getItem("verifyCompany") ?? company;
      const verifyTelephone = sessionStorage.getItem("verifyTelephone") ?? phone;
      const verifyNewsletter = sessionStorage.getItem("verifyNewsletter") === "true";

      const result = await createUserWithEmailAndPassword(auth, verifyEmail, verifyPassword);
      await updateProfile(result.user, { displayName: `${verifyName} ${verifySurname}` });

      const token = await result.user.getIdToken(true);

      await fetch(`${API_BASE_URL}/api/User/sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: verifyName,
          surname: verifySurname,
          company: verifyCompany,
          telephone: verifyTelephone,
          newsletter: verifyNewsletter,
        }),
      });

      sessionStorage.removeItem("verifyEmail");
      sessionStorage.removeItem("verifyPassword");
      sessionStorage.removeItem("verifyName");
      sessionStorage.removeItem("verifySurname");
      sessionStorage.removeItem("verifyCompany");
      sessionStorage.removeItem("verifyTelephone");
      sessionStorage.removeItem("verifyNewsletter");
      sessionStorage.removeItem("pendingVerification");

      closeWithSuccess();
    } catch (err: any) {
      setOtpError(err.message ?? t.incorrect);
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    try {
      const verifyEmail = sessionStorage.getItem("verifyEmail") ?? email;

      const res = await fetch(`${API_BASE_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verifyEmail }),
      });

      if (!res.ok) {
        const text = await res.text();

        if (
          res.status === 429 ||
          text.toLowerCase().includes("limit") ||
          text.toLowerCase().includes("exhausted")
        ) {
          setOtpError(t.tooMany);
          return;
        }

        throw new Error(text || t.otpFailed);
      }

      setTimer(30);
      setOtpError("");
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => inputsRef.current[0]?.focus(), 50);
      showToast(t.sentAgain);
    } catch (err: any) {
      setOtpError(err.message ?? t.otpFailed);
    }
  };

  const filled = otp.filter(Boolean).length;

  if (!open) return null;

  return (
    <>
      <style>{`
        .auth-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 90;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.38);
          backdrop-filter: blur(6px);
          padding: 20px;
          box-sizing: border-box;
        }

        .auth-modal-card {
          position: relative;
          width: 100%;
          max-width: 448px;
          max-height: calc(100vh - 40px);
          overflow-y: auto;
          background: #fff;
          border: 1px solid #d1d5db;
          border-radius: 24px;
          padding: 32px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.18), 0 8px 24px rgba(0,0,0,0.08);
          box-sizing: border-box;
        }

        .auth-modal-card::-webkit-scrollbar { width: 0; }

        .auth-modal-close {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #9ca3af;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s, color 0.15s, transform 0.15s;
          z-index: 5;
        }

        .auth-modal-close:hover {
          background: #f9fafb;
          color: #111827;
          transform: rotate(90deg);
        }

        .auth-toggle {
          position: relative;
          display: flex;
          background: #f3f4f6;
          border-radius: 999px;
          padding: 4px;
          margin-bottom: 24px;
          overflow: hidden;
        }

        .auth-toggle-slider {
          position: absolute;
          top: 4px;
          left: 4px;
          width: calc(50% - 4px);
          height: calc(100% - 8px);
          background: #fff;
          border-radius: 999px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.08);
          border: 1px solid #d1d5db;
        }

        .auth-lang-wrap {
          display: flex;
          justify-content: center;
          margin: 16px 0 8px;
        }

        .auth-lang-inner {
          position: relative;
          display: flex;
          background: #f3f4f6;
          border-radius: 999px;
          padding: 4px;
          border: 1px solid #e5e7eb;
          width: 140px;
        }

        .auth-lang-slider {
          position: absolute;
          top: 4px;
          left: 4px;
          width: calc(50% - 4px);
          height: calc(100% - 8px);
          background: #fff;
          border-radius: 999px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.08);
        }

        .vp-card { width: 100%; max-width: 400px; margin: 0 auto; }
        .vp-logo { display: flex; justify-content: center; margin-bottom: 28px; }
        .vp-logo img { height: 56px; width: auto; object-fit: contain; }

        .vp-shield {
          width: 52px;
          height: 52px;
          border-radius: 999px;
          background: #f4f3ff;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          color: #7c3aed;
        }

        .vp-title {
          font-size: 22px;
          font-weight: 800;
          color: #0d0d0d;
          letter-spacing: -0.025em;
          text-align: center;
          margin-bottom: 6px;
        }

        .vp-sub {
          font-size: 13px;
          color: #9ca3af;
          text-align: center;
          line-height: 1.6;
          margin-bottom: 8px;
        }

        .vp-email { font-weight: 600; color: #374151; }

        .vp-divider {
          width: 32px;
          height: 2px;
          background: #f3f4f6;
          border-radius: 999px;
          margin: 16px auto 24px;
        }

        .vp-otp-row {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: center;
          margin-bottom: 8px;
        }

        .vp-box {
          width: 46px;
          height: 54px;
          border: 1.5px solid #e5e7eb;
          border-radius: 14px;
          background: #fff;
          text-align: center;
          font-size: 20px;
          font-weight: 700;
          color: #0d0d0d;
          font-family: inherit;
          outline: none;
          caret-color: #7c3aed;
          transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
        }

        .vp-box:focus {
          border-color: #7c3aed;
          box-shadow: 0 0 0 3px rgba(124,58,237,0.10);
          background: #faf9ff;
        }

        .vp-box.filled {
          border-color: #7c3aed;
          background: #faf9ff;
        }

        .vp-box:disabled {
          background: #f9fafb;
          opacity: 0.6;
          cursor: not-allowed;
        }

        .vp-error {
          font-size: 12px;
          color: #dc2626;
          text-align: center;
          margin: 6px 0 10px;
          line-height: 1.5;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 999px;
          padding: 7px 14px;
        }

        .vp-btn {
          width: 100%;
          padding: 13px;
          border-radius: 999px;
          border: none;
          background: #0d0d0d;
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          letter-spacing: 0.01em;
          transition: opacity 0.15s, transform 0.12s;
          box-shadow: 0 2px 10px rgba(0,0,0,0.15);
          margin-top: 4px;
        }

        .vp-btn:hover:not(:disabled) {
          opacity: 0.88;
          transform: translateY(-1px);
        }

        .vp-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .vp-resend {
          text-align: center;
          margin-top: 18px;
          font-size: 13px;
          color: #9ca3af;
        }

        .vp-resend-link {
          color: #7c3aed;
          font-weight: 600;
          cursor: pointer;
          background: none;
          border: none;
          font-family: inherit;
          font-size: 13px;
          padding: 0;
          transition: color 0.15s;
        }

        .vp-resend-link:hover { color: #5b21b6; }

        .vp-back {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          margin: 16px auto 0;
          font-size: 12px;
          color: #9ca3af;
          cursor: pointer;
          border: none;
          background: none;
          font-family: inherit;
          transition: color 0.15s;
          padding: 0;
        }

        .vp-back:hover { color: #374151; }

        .vp-dots {
          display: flex;
          gap: 5px;
          justify-content: center;
          margin-bottom: 20px;
        }

        .vp-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #e5e7eb;
          transition: background 0.2s, transform 0.2s;
        }

        .vp-dot.active {
          background: #7c3aed;
          transform: scale(1.2);
        }

        .vp-toast {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #0d0d0d;
          color: #fff;
          padding: 10px 20px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 500;
          font-family: inherit;
          box-shadow: 0 8px 24px rgba(0,0,0,0.18);
          white-space: nowrap;
          z-index: 120;
        }

        @keyframes vp-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }

        .vp-shake { animation: vp-shake 0.45s ease; }

        @media (max-width: 520px) {
          .auth-modal-overlay { padding: 12px; align-items: flex-start; overflow-y: auto; }
          .auth-modal-card {
            max-width: 100%;
            min-height: auto;
            margin-top: 18px;
            padding: 28px 18px 22px;
            border-radius: 22px;
          }
          .vp-box {
            width: 40px;
            height: 50px;
            border-radius: 12px;
            font-size: 18px;
          }
          .vp-otp-row { gap: 6px; }
        }
      `}</style>

      <motion.div
        className="auth-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: closingSuccess ? 0 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={() => !loading && onClose()}
      >
        <motion.div
          className="auth-modal-card"
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{
            opacity: closingSuccess ? 0 : 1,
            scale: closingSuccess ? 0.94 : 1,
            y: closingSuccess ? -10 : 0,
          }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="auth-modal-close"
            onClick={() => !loading && onClose()}
            aria-label="Close authentication modal"
          >
            <X size={16} />
          </button>

          <AnimatePresence mode="wait">
            {step === "auth" ? (
              <motion.div
                key="auth-step"
                initial={{ opacity: 0, x: mode === "login" ? -24 : 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.28 }}
              >
                <h1 className="text-xl font-semibold text-center mb-1">
                  AI-Productivity Coach
                </h1>

                <h2 className="text-2xl font-semibold text-center my-4">
                  {t.welcome}
                </h2>

                <div className="auth-toggle">
                  <motion.div
                    className="auth-toggle-slider"
                    initial={false}
                    animate={{ x: mode === "login" ? "0%" : "100%" }}
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />

                  <button
                    onClick={() => setMode("login")}
                    className="relative z-10 flex-1 py-2 text-sm font-medium"
                  >
                    {t.login}
                  </button>

                  <button
                    onClick={() => setMode("signup")}
                    className="relative z-10 flex-1 py-2 text-sm font-medium"
                  >
                    {t.signup}
                  </button>
                </div>

                {topError && (
                  <div className="text-red-600 text-sm mb-3 text-center">
                    {topError}
                  </div>
                )}

                {fieldError && (
                  <div className="text-red-600 text-sm mb-2">
                    {fieldError}
                  </div>
                )}

                <AnimatePresence mode="wait">
                  {mode === "login" ? (
                    <motion.div
                      key="login"
                      initial={{ opacity: 0, x: -40 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 40 }}
                      transition={{ duration: 0.35 }}
                    >
                      <FloatingInput
                        label={t.email}
                        value={email}
                        onChange={setEmail}
                        type="email"
                        error={!!fieldError}
                        autoFocus
                      />

                      <div className="relative mb-4">
                        <FloatingInput
                          label={t.password}
                          value={password}
                          onChange={setPassword}
                          type={showPassword ? "text" : "password"}
                        />

                        <div
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-5 top-1/2 -translate-y-1/2 cursor-pointer text-gray-600"
                        >
                          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </div>
                      </div>

                      <div
                        onClick={handleForgotPassword}
                        className="text-sm text-black mb-6 cursor-pointer"
                      >
                        {t.forgot}
                      </div>

                      <button
                        onClick={handleLogin}
                        disabled={loading}
                        className="w-full py-3 bg-black text-white rounded-full text-sm font-medium"
                      >
                        {loading ? t.loggingIn : t.login}
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="signup"
                      initial={{ opacity: 0, x: 40 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -40 }}
                      transition={{ duration: 0.35 }}
                    >
                      <FloatingInput label={t.name} value={name} onChange={setName} autoFocus />
                      <FloatingInput label={t.surname} value={surname} onChange={setSurname} />
                      <FloatingInput label={t.company} value={company} onChange={setCompany} />

                      <div className="mb-4">
                        <PhoneInput value={phone} onChange={setPhone} />
                      </div>

                      <FloatingInput
                        label={t.email}
                        value={email}
                        onChange={setEmail}
                        type="email"
                      />

                      <div className="relative mb-4">
                        <FloatingInput
                          label={t.password}
                          value={password}
                          onChange={setPassword}
                          type={showPassword ? "text" : "password"}
                        />

                        <div
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-5 top-1/2 -translate-y-1/2 cursor-pointer"
                        >
                          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </div>
                      </div>

                      <label className="flex items-center gap-3 text-sm text-gray-600 mb-4 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={termsAccepted}
                          onChange={(e) => setTermsAccepted(e.target.checked)}
                          className="hidden"
                        />

                        <div
                          className={`w-[18px] h-[18px] flex items-center justify-center rounded-md border ${
                            termsAccepted ? "bg-black border-black" : "border-gray-300"
                          }`}
                        >
                          {termsAccepted && (
                            <svg className="w-[10px] h-[10px] text-white" viewBox="0 0 24 24">
                              <path
                                d="M5 13l4 4L19 7"
                                stroke="currentColor"
                                strokeWidth="3"
                                fill="none"
                              />
                            </svg>
                          )}
                        </div>

                        <span>
                          {t.agree}{" "}
                          <a href="/terms" className="underline">
                            {t.terms}
                          </a>{" "}
                          {t.and}{" "}
                          <a href="/privacy-policy" className="underline">
                            {t.privacy}
                          </a>
                        </span>
                      </label>

                      <button
                        onClick={handleSignup}
                        disabled={loading}
                        className="w-full py-3 bg-black text-white rounded-full text-sm font-medium"
                      >
                        {loading ? t.creating : t.create}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div
                key="verify-step"
                initial={{ opacity: 0, x: 34 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.3 }}
                className="vp-card"
              >
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

                <div className="vp-logo">
                  <img src="/logo.png" alt="AI-Productivity Coach" />
                </div>

                <div className="vp-shield">
                  <ShieldCheck size={24} />
                </div>

                <div className="vp-title">{t.verifyTitle}</div>
                <p className="vp-sub">
                  {t.verifySub}
                  <br />
                  <span className="vp-email">{maskEmail(email)}</span>
                </p>

                <div className="vp-divider" />

                <div className="vp-dots">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className={`vp-dot ${i < filled ? "active" : ""}`} />
                  ))}
                </div>

                <div className={shake ? "vp-shake" : ""}>
                  <div className="vp-otp-row">
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => {
                          if (el) inputsRef.current[index] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        disabled={loading}
                        className={`vp-box ${digit ? "filled" : ""}`}
                        onChange={(e) => handleOtpChange(e.target.value, index)}
                        onKeyDown={(e) => handleOtpKeyDown(e, index)}
                        onPaste={handleOtpPaste}
                        autoComplete="one-time-code"
                      />
                    ))}
                  </div>

                  <AnimatePresence>
                    {otpError && (
                      <motion.div
                        className="vp-error"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                      >
                        {otpError}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    className="vp-btn"
                    onClick={() => handleVerify()}
                    disabled={loading || filled < 6}
                  >
                    {loading ? t.verifying : t.continue}
                  </button>
                </div>

                <div className="vp-resend">
                  {timer > 0 ? (
                    <span>
                      {t.resendIn}{" "}
                      <strong style={{ color: "#374151" }}>{timer}s</strong>
                    </span>
                  ) : (
                    <button className="vp-resend-link" onClick={resendCode}>
                      {t.resend}
                    </button>
                  )}
                </div>

                <button className="vp-back" onClick={() => setStep("auth")}>
                  <ArrowLeft size={13} />
                  {t.backSignup}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      <ConfirmModal
        open={modalOpen}
        title={t.missing}
        description={modalMessage}
        confirmText="OK"
        onCancel={() => setModalOpen(false)}
        onConfirm={() => setModalOpen(false)}
      />
    </>
  );
}
