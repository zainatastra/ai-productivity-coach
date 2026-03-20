"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { app } from "@/services/firebase";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const auth = getAuth(app);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (!email) return;

    try {
      setLoading(true);

      await sendPasswordResetEmail(auth, email);

      setMessage("Password reset email sent");

    } catch (err: any) {
      // 🔥 IMPORTANT: Firebase hides whether email exists (security)
      setMessage("If this email is registered, you will receive a reset link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">

      <div className="w-full max-w-md border border-gray-200 rounded-2xl p-8 shadow-sm">

        <h1 className="text-2xl font-semibold text-center mb-2">
          Forgot Password?
        </h1>

        <p className="text-sm text-gray-500 text-center mb-6">
          Enter your email and we’ll send you a reset link
        </p>

        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3 bg-black text-white rounded-xl text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send Reset Link"}
        </button>

        {message && (
          <p className="text-sm text-center text-gray-600 mt-4">
            {message}
          </p>
        )}

        <div
          onClick={() => router.push("/auth?mode=login")}
          className="text-sm text-gray-600 mt-4 cursor-pointer text-center"
        >
          ← Back to login
        </div>

      </div>
    </div>
  );
}