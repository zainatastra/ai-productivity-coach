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

import { createUserWithEmailAndPassword } from "firebase/auth";

import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

import { onAuthStateChanged } from "firebase/auth";

export default function AuthContent() {
  const auth = getAuth(app);
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialMode =
    searchParams.get("mode") === "signup" ? "signup" : "login";

  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [showPassword, setShowPassword] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [fieldError, setFieldError] = useState("");
  const [topError, setTopError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState("");

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
    if (user) {
      router.replace("/");
    }
  });

  return () => unsubscribe();
}, [auth, router]);

const handleGoogleLogin = async () => {
  try {
    setLoading(true);
    setTopError("");

    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);

    const token = await result.user.getIdToken(true);

    const fullName =
      result.user.displayName ||
      result.user.email?.split("@")[0] ||
      "User";

// In handleSignup, replace the fetch call with this:
// In handleSignup, your fetch should look like this:
await fetch("https://ai-productivity-coach-mlnn.onrender.com/api/User/sync", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ fullName: fullName }), // ✅ use the form's fullName state variable
});

    router.replace("/");
  } catch {
    setTopError("Google authentication failed. Please try again.");
  } finally {
    setLoading(false);
  }
};

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

await fetch("https://ai-productivity-coach-mlnn.onrender.com/api/User/sync", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",  // ✅ added
  },
  body: JSON.stringify({ fullName }),     // ✅ added
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

  if (!fullName || !email || !password) {
    openModal("Please fill in Full Name, Email and Password to continue.");
    return;
  }

  try {
    setLoading(true);

    const result = await createUserWithEmailAndPassword(auth, email, password);

    await updateProfile(result.user, { displayName: fullName });

    await result.user.reload();

    const token = await result.user.getIdToken(true);

    await fetch("https://ai-productivity-coach-mlnn.onrender.com/api/User/sync", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",   // ✅ must be here
      },
      body: JSON.stringify({ fullName }),      // ✅ must be here
    });

    router.replace("/");
  } catch (error: any) {
    if (error.code === "auth/email-already-in-use") {
      setFieldError("This email is already registered. Please login.");
    } else {
      setTopError("Something went wrong. Please try again.");
    }
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
              className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-white border border-black"
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
              Sign Up
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

      <div className="text-sm text-black mb-6 cursor-pointer">
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
        placeholder="Full Name"
        className="w-full mb-3 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
      />

      <input
        type="email"
        placeholder="Email"
        className={`w-full mb-3 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black ${
          fieldError ? "border-red-500" : "border-gray-300"
        }`}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <div className="relative mb-4">
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

{/* ================= OR SECTION ================= */}
<div className="flex items-center my-6">
  <div className="flex-1 border-t border-gray-300"></div>
  <span className="px-3 text-sm text-gray-500">OR</span>
  <div className="flex-1 border-t border-gray-300"></div>
</div>

{/* ================= GOOGLE BUTTON ================= */}
<button
  onClick={handleGoogleLogin}
  disabled={loading}
  className="relative w-full py-3 border border-gray-300 rounded-xl text-sm font-medium flex items-center justify-center disabled:opacity-50"
>
  <div className="absolute left-4">
    <Image
      src="/google.png"
      alt="google"
      width={26}
      height={26}
    />
  </div>
  {loading ? "Processing..." : "Continue with Google"}
</button>

{/* ================= TERMS ================= */}
<div className="flex justify-center gap-4 text-sm text-gray-600 mt-6">
  <span>Terms of Use</span>
  <span>|</span>
  <span>Privacy Policy</span>
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