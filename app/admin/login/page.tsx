"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { adminApp } from "@/services/firebase";
import { Eye, EyeOff } from "lucide-react";
import { API_BASE_URL } from "@/services/api";
import { motion } from "framer-motion";

export default function AdminLoginPage() {
  const auth = getAuth(adminApp);
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ✅ Prevent logged-in admin from accessing login page
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/admin");
      }
    });

    return () => unsubscribe();
  }, [auth, router]);

  const handleLogin = async () => {
    setError("");

    if (!email || !password) {
      setError("Enter admin credentials.");
      return;
    }

    try {
      setLoading(true);

      const result = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      const token = await result.user.getIdToken();

      const res = await fetch(
        `${API_BASE_URL}/api/test/admin-users`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        setError("Unauthorized access.");
        return;
      }

      // ✅ IMPORTANT: Use replace instead of push
      router.replace("/admin");

    } catch {
      setError("Invalid admin credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 bg-black overflow-hidden">

      {/* Background subtle gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-[#0a0a0a] to-black opacity-95" />

      {/* Center Card Animation */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-md backdrop-blur-md bg-white/5 border border-gray-800 rounded-3xl shadow-2xl p-10"
      >
        {/* Titles */}
        <h1 className="text-xl font-semibold !text-white text-center mb-2 tracking-wide">
          Admin
        </h1>

        <h2 className="text-2xl font-semibold !text-white text-center mb-8">
          AI-Productivity Coach
        </h2>

        {/* ERROR */}
        {error && (
          <div className="text-red-500 text-sm mb-4 text-center">
            {error}
          </div>
        )}

        {/* EMAIL */}
        <div className="mb-5">
          <label className="text-sm text-gray-400 mb-1 block">
            Admin Email
          </label>
          <input
            type="email"
            placeholder="Enter admin email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-[#111] border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition"
          />
        </div>

        {/* PASSWORD */}
        <div className="mb-8">
          <label className="text-sm text-gray-400 mb-1 block">
            Password
          </label>

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 pr-12 rounded-xl bg-[#111] border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition"
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-4 flex items-center text-gray-400 hover:text-white"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* LOGIN BUTTON */}
        <button
          onClick={handleLogin}
          disabled={loading}
          className="
            w-full py-3 rounded-xl text-white font-medium tracking-wide
            bg-red-600 hover:bg-red-700 transition
            shadow-[0_0_20px_rgba(239,68,68,0.4)]
            hover:shadow-[0_0_30px_rgba(239,68,68,0.6)]
            disabled:opacity-50
          "
        >
          {loading ? "Verifying..." : "Secure Login"}
        </button>

        {/* Confidential Hint */}
        <p className="text-center text-xs text-gray-500 mt-6">
          CONFIDENTIAL ACCESS
        </p>
      </motion.div>
    </div>
  );
}