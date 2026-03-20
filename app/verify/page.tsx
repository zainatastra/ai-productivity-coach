"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  getAuth,
} from "firebase/auth";

import { API_BASE_URL } from "@/services/api";

import { app } from "@/services/firebase";

export default function VerifyPage() {
  const router = useRouter();
  const auth = getAuth(app);

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const inputsRef = useRef<HTMLInputElement[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [timer, setTimer] = useState(30);
  const [showToast, setShowToast] = useState(false);
  const [shake, setShake] = useState(false);

  const email =
    typeof window !== "undefined"
      ? sessionStorage.getItem("verifyEmail")
      : "";

  // ================= AUTO FOCUS =================
  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  // ================= MASK EMAIL =================
  const maskEmail = (email: string | null) => {
    if (!email) return "";
    const [name, domain] = email.split("@");
    if (name.length <= 5) return email;
    return `${name.slice(0, 3)}${"*".repeat(
      name.length - 5
    )}${name.slice(-2)}@${domain}`;
  };

  // ================= TIMER =================
  useEffect(() => {
    if (timer === 0) return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  // ================= INPUT =================
  const handleChange = (value: string, index: number) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }

    // AUTO SUBMIT
    if (newOtp.join("").length === 6) {
      handleVerify(newOtp.join(""));
    }
  };

  const handleKeyDown = (e: any, index: number) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").trim();

    if (!/^\d{6}$/.test(pasted)) return;

    const newOtp = pasted.split("");
    setOtp(newOtp);
    inputsRef.current[5]?.focus();
  };

  // ================= VERIFY =================
  const handleVerify = async (codeParam?: string) => {
    const code = codeParam || otp.join("");
    if (code.length !== 6) return;

    try {
      setLoading(true);
      setError("");

      const res = await fetch(
        `${API_BASE_URL}/api/auth/verify-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code }),
        }
      );

      if (!res.ok) {
        const text = await res.text();

        if (text.includes("expired")) {
          throw new Error("OTP Expired");
        } else {
          throw new Error("Invalid OTP");
        }
      }

      const password = sessionStorage.getItem("verifyPassword");
      const name = sessionStorage.getItem("verifyName");
      const surname = sessionStorage.getItem("verifySurname");
      const company = sessionStorage.getItem("verifyCompany");
      const telephone = sessionStorage.getItem("verifyTelephone");
      const newsletter =
        sessionStorage.getItem("verifyNewsletter") === "true";

      const result = await createUserWithEmailAndPassword(
        auth,
        email!,
        password!
      );

      await updateProfile(result.user, {
        displayName: `${name} ${surname}`,
      });

      const token = await result.user.getIdToken(true);

      await fetch(
        `${API_BASE_URL}/api/User/sync`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            surname,
            company,
            telephone,
            newsletter,
          }),
        }
      );

      sessionStorage.clear();
      router.replace("/");
    } catch (err: any) {
      setError(err.message);

      // SHAKE ANIMATION
      setShake(true);
      setTimeout(() => setShake(false), 400);

      setOtp(["", "", "", "", "", ""]);
      inputsRef.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // ================= RESEND =================
  const resendCode = async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/auth/send-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      setTimer(30);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
    } catch (err: any) {
      setShowToast(true);
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">

      {showToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-black text-white px-4 py-2 rounded-lg text-sm shadow">
          OTP Resent Successfully
        </div>
      )}

      <div
        className={`w-full max-w-md border border-gray-200 rounded-2xl p-8 shadow-sm ${
          shake ? "animate-shake" : ""
        }`}
      >
        <h1 className="text-2xl font-semibold text-center mb-2">
          Verify Your Account
        </h1>

        <p className="text-sm text-gray-500 text-center mb-6">
          We’ve sent a code to{" "}
          <span className="font-medium">{maskEmail(email)}</span>
        </p>

        <div className="flex justify-between gap-2 mb-4">
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                if (el) inputsRef.current[index] = el;
              }}
              type="text"
              maxLength={1}
              value={digit}
              disabled={loading}
              onChange={(e) => handleChange(e.target.value, index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              onPaste={handlePaste}
              className="w-12 h-14 text-center text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
              placeholder={(index + 1).toString()}
            />
          ))}
        </div>

        {error && (
          <p className="text-red-500 text-sm text-center mb-2">
            {error}
          </p>
        )}

        <button
          onClick={() => handleVerify()}
          disabled={loading}
          className="w-full mt-2 py-3 bg-black text-white rounded-xl text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Verifying..." : "Continue"}
        </button>

        <div className="text-center mt-4 text-sm text-gray-600">
          {timer > 0 ? (
            <span>Resend code in {timer}s</span>
          ) : (
            <span
              onClick={resendCode}
              className="text-blue-600 cursor-pointer"
            >
              Resend Code
            </span>
          )}
        </div>
      </div>
    </div>
  );
}