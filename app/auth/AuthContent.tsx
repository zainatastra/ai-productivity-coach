"use client";

import { useState, useEffect } from "react";
import {
  getAuth,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { app } from "@/services/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import ConfirmModal from "@/components/ConfirmModal";

import PhoneInput from "@/components/PhoneInput";

import { createUserWithEmailAndPassword } from "firebase/auth";

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

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-white px-4">

        <div className="w-full max-w-md border border-gray-300 rounded-2xl p-8 shadow-sm min-h-[640px]">

          <h1 className="text-xl font-semibold text-center mb-1">
            AI-Productivity Coach
          </h1>

          <h2 className="text-2xl font-semibold text-center mt-6">
            Welcome
          </h2>

          <p className="text-sm text-gray-500 text-center mb-6">
            Please enter your details
          </p>

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
              Login
            </button>

            <button
              onClick={() => {
                setMode("signup");
                router.replace("/auth?mode=signup");
              }}
              className="relative z-10 flex-1 py-2 text-sm font-medium"
            >
              SignUp
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

          {/* ================= FULL FORM WITH BUTTER SMOOTH SWITCH ================= */}
<AnimatePresence mode="wait">

  {mode === "login" ? (
    <motion.div
      key="login"
      initial={{ opacity: 0, x: -40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.35, ease: "easeInOut" }}
    >

      <input
        type="email"
        placeholder="Email"
        className={`w-full mb-3 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black ${
          fieldError ? "border-red-500" : "border-gray-300"
        }`}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <div className="relative mb-1">
        <input
          type={showPassword ? "text" : "password"}
          placeholder="Password"
          className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black pr-12"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-600"
        >
          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
        </div>
      </div>

<div
  onClick={() => router.push("/forgot-password")}
  className="text-sm text-black mb-6 cursor-pointer"
>
  Forgot password?
</div>

      <button
        onClick={handleLogin}
        disabled={loading}
        className="w-full py-3 bg-black text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
      >
        {loading ? "Logging in..." : "Login"}
      </button>

    </motion.div>
  ) : (
    <motion.div
      key="signup"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35, ease: "easeInOut" }}
    >

      <input
        type="text"
        placeholder="Name *"
        className="w-full mb-3 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <input
        type="text"
        placeholder="Surname *"
        className="w-full mb-3 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
        value={surname}
        onChange={(e) => setSurname(e.target.value)}
      />

      <input
        type="text"
        placeholder="Company *"
        className="w-full mb-3 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
      />

<div className="mb-3">
  <label className="text-sm text-gray-600 mb-1 block">
    Phone number *
  </label>

<PhoneInput
  value={phone}
  onChange={(val) => {
    setPhone(val);
  }}
/>
</div>

      <input
        type="email"
        placeholder="Email *"
        className={`w-full mb-3 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black ${
          fieldError ? "border-red-500" : "border-gray-300"
        }`}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <div className="relative mb-3">
        <input
          type={showPassword ? "text" : "password"}
          placeholder="Password *"
          className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black pr-12"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-600"
        >
          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
        </div>
      </div>

      {/* TERMS */}
<label className="flex items-start gap-2 text-sm text-gray-600">
  <input
  type="checkbox"
  checked={termsAccepted}
  onChange={(e) => setTermsAccepted(e.target.checked)}
  className="mt-1"
/>

  <span>
    I agree to the{" "}
    <a
      href="/terms"
      target="_blank"
      className="underline hover:text-black"
    >
      T&Cs
    </a>{" "}
    and{" "}
    <a
      href="/privacy-policy"
      target="_blank"
      className="underline hover:text-black"
    >
      Privacy Policy
    </a>
  </span>
</label>

      <button
        onClick={handleSignup}
        disabled={loading}
        className="w-full py-3 bg-black text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create Account"}
      </button>

    </motion.div>
  )}

</AnimatePresence>

{/* ================= TERMS ================= */}
<div className="flex justify-center gap-4 text-sm text-gray-600 mt-6">
<a href="/terms" target="_blank" className="hover:underline">
  T&Cs
</a>

<span>|</span>

<a href="/privacy-policy" target="_blank" className="hover:underline">
  Privacy Policy
</a>
</div>

</div>
</div>

{/* ================= MODAL ================= */}
<ConfirmModal
  open={modalOpen}
  title="Missing Information"
  description={modalMessage}
  confirmText="OK"
  onCancel={() => setModalOpen(false)}
  onConfirm={() => setModalOpen(false)}
/>

</>
);
}