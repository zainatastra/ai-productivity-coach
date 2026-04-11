"use client";

import { useState, useEffect } from "react";
import {
  getAuth,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { app } from "@/services/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import ConfirmModal from "@/components/ConfirmModal";

import PhoneInput from "@/components/PhoneInput";

import { createUserWithEmailAndPassword } from "firebase/auth";

import FloatingInput from "@/components/FloatingInput";

import { API_BASE_URL } from "@/services/api";

import { onAuthStateChanged } from "firebase/auth";

export default function AuthContent() {
  const auth = getAuth(app);
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialMode =
    searchParams.get("mode") === "signup" ? "signup" : "login";

  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [showPassword, setShowPassword] = useState(false);

  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [company, setCompany] = useState("");
  
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [newsletter, setNewsletter] = useState(false);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [fieldError, setFieldError] = useState("");
  const [topError, setTopError] = useState("");

  const [lang, setLang] = useState<"en" | "de">("en");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState("");

  const [phone, setPhone] = useState("");

  useEffect(() => {
    const urlMode =
      searchParams.get("mode") === "signup" ? "signup" : "login";
    setMode(urlMode);
  }, [searchParams]);

  const openModal = (message: string) => {
    setModalMessage(message);
    setModalOpen(true);
  };

useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (!user) return;

    // prevent redirect during verification flow
    if (typeof window !== "undefined") {
      const pendingVerification = sessionStorage.getItem("pendingVerification");

      if (!pendingVerification) {
        router.replace("/");
      }
    }
  });

  return () => unsubscribe();
}, [auth, router]);

  /* ================= LOGIN ================= */
const handleLogin = async () => {
  setFieldError("");
  setTopError("");

  if (!email || !password) {
    openModal("Please fill in both Email and Password.");
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
    "Content-Type": "application/json",  // ✅ added
  },
  body: JSON.stringify({
  name,
  surname,
  company,
  telephone: phone,
}),// ✅ added
});

    router.replace("/");
  } catch (error: any) {
    if (error.code === "auth/user-not-found") {
      setFieldError("No account found with this email. Please sign up.");
    } else {
      setTopError("Invalid Credential, Please try again");
    }
  } finally {
    setLoading(false);
  }
};

  /* ================= SIGNUP ================= */

const handleSignup = async () => {
  setFieldError("");
  setTopError("");

if (!name || !surname || !company || !phone || !email || !password) {
  openModal("Please fill in all required fields.");
  return;
}

if (!termsAccepted) {
  openModal("You must accept the Terms of Use and Privacy Policy.");
  return;
}

if (!phone || !phone.startsWith("+")) {
  openModal("Please enter a valid phone number.");
  return;
}

  try {
    setLoading(true);

    // ✅ STEP 1: Send OTP ONLY (NO Firebase yet)
    const res = await fetch(`${API_BASE_URL}/api/auth/send-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      throw new Error("Failed to send OTP");
    }

    // ✅ STEP 2: Store everything in session
    sessionStorage.setItem("verifyEmail", email);
    sessionStorage.setItem("verifyPassword", password);
    sessionStorage.setItem("verifyName", name);
    sessionStorage.setItem("verifySurname", surname);
    sessionStorage.setItem("verifyCompany", company);
    sessionStorage.setItem("verifyTelephone", phone);
    sessionStorage.setItem("verifyNewsletter", newsletter.toString());

    sessionStorage.setItem("pendingVerification", "true");

    // ✅ STEP 3: Go to verify page (NO FLASH NOW)
    router.push("/verify");

  } catch (error) {
    setTopError("Failed to send verification code. Please try again.");
  } finally {
    setLoading(false);
  }
};

// 🌍 TRANSLATIONS
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
    missing: "Missing Information",
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
    missing: "Fehlende Angaben",
  },
}[lang];

return (
  <>
    <div className="min-h-screen flex items-center justify-center bg-white px-4">

      <div className="w-full max-w-md border border-gray-300 rounded-2xl p-8 shadow-sm min-h-[640px]">

        <h1 className="text-xl font-semibold text-center mb-1">
          AI-Productivity Coach
        </h1>

        {/* 🌍 LANGUAGE SWITCHER */}
{/* 🌍 LANGUAGE SWITCHER */}
<div className="flex justify-center mt-4 mb-2">
  <div className="relative flex bg-gray-100 rounded-full p-1 border border-gray-200 w-[140px]">

    {/* 🔥 SLIDING BACKGROUND */}
    <motion.div
      initial={false}
      animate={{
        x: lang === "en" ? 0 : "100%"
      }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 30
      }}
      className="absolute top-1 left-1 w-1/2 h-[calc(100%-8px)] bg-white rounded-full shadow"
    />

    {/* EN */}
    <button
      onClick={() => setLang("en")}
      className={`relative z-10 flex items-center justify-center gap-2 flex-1 py-1.5 text-sm font-medium ${
        lang === "en" ? "text-black" : "text-gray-500"
      }`}
    >
      <img
        src="/us.png"
        alt="EN"
        className="w-4 h-4 rounded-sm object-cover"
      />
      EN
    </button>

    {/* DE */}
    <button
      onClick={() => setLang("de")}
      className={`relative z-10 flex items-center justify-center gap-2 flex-1 py-1.5 text-sm font-medium ${
        lang === "de" ? "text-black" : "text-gray-500"
      }`}
    >
      <img
        src="/de.png"
        alt="DE"
        className="w-4 h-4 rounded-sm object-cover"
      />
      DE
    </button>

  </div>
</div>

        <h2 className="text-2xl font-semibold text-center my-4">
          {t.welcome}
        </h2>

        {/* TOGGLE */}
        <div className="relative flex bg-gray-100 rounded-full p-1 mb-6 overflow-hidden">
          <motion.div
            initial={false}
            animate={{ x: mode === "login" ? "0%" : "100%" }}
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
            className="absolute top-0 left-0 w-1/2 h-full bg-white rounded-full shadow border border-gray-300"
          />

          <button
            onClick={() => {
              setMode("login");
              router.replace("/auth?mode=login");
            }}
            className="relative z-10 flex-1 py-2 text-sm font-medium"
          >
            {t.login}
          </button>

          <button
            onClick={() => {
              setMode("signup");
              router.replace("/auth?mode=signup");
            }}
            className="relative z-10 flex-1 py-2 text-sm font-medium"
          >
            {t.signup}
          </button>
        </div>

        {/* TOP ERROR */}
        {topError && (
          <div className="text-red-600 text-sm mb-3 text-center">
            {topError}
          </div>
        )}

        {/* FIELD ERROR */}
        {fieldError && (
          <div className="text-red-600 text-sm mb-2">
            {fieldError}
          </div>
        )}

        <AnimatePresence mode="wait">

          {/* ================= LOGIN ================= */}
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
                onClick={() => router.push("/forgot-password")}
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

          /* ================= SIGNUP ================= */
          <motion.div
            key="signup"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.35 }}
          >

            <FloatingInput label={t.name} value={name} onChange={setName} />
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

              <div className={`w-[18px] h-[18px] flex items-center justify-center rounded-md border ${
                termsAccepted ? "bg-black border-black" : "border-gray-300"
              }`}>
                {termsAccepted && (
                  <svg className="w-[10px] h-[10px] text-white" viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" fill="none"/>
                  </svg>
                )}
              </div>

              <span>
                {t.agree}{" "}
                <a href="/terms" className="underline">{t.terms}</a>{" "}
                and{" "}
                <a href="/privacy-policy" className="underline">{t.privacy}</a>
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

      </div>
    </div>

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