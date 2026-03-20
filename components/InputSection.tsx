"use client";

import { useState } from "react";
import { generateProductivity, compareIndustry } from "../services/api";
import { getAuth } from "firebase/auth";
import { app } from "@/services/firebase";
import { useAuth } from "@/services/AuthContext";
import { useLanguage } from "@/services/LanguageContext";
import { API_BASE_URL } from "@/services/api";

interface Props {
  setResponse: (value: any) => void;
  setLoading: (value: boolean) => void;
  setIndustryData: (value: string) => void;
  setDescriptionData: (value: string) => void;
  setMode: (value: "generate" | "compare") => void;
  industryData: string;
  descriptionData: string;
  language: "en" | "de";
  isLoggedIn: boolean;           // ✅ ADDED
  setShowAuthModal: (v: boolean) => void; // ✅ ADDED
}

export default function InputSection({
  setResponse,
  setLoading,
  setIndustryData,
  setDescriptionData,
  setMode,
  industryData,
  descriptionData,
  language,
  isLoggedIn,           // ✅ ADDED
  setShowAuthModal,     // ✅ ADDED
}: Props) {
  const { user } = useAuth();
  const auth = getAuth(app);
  const { t } = useLanguage();

  const [isSubmitting, setIsSubmitting] = useState(false);

  /* =========================================
     SAVE CONVERSATION
  ========================================= */
  const saveConversation = async (responseData: any) => {
    try {
      if (!user || user.isAnonymous) return;

      const token = await auth.currentUser?.getIdToken();

      await fetch(`${API_BASE_URL}/api/Conversation/save`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          industry: industryData,
          description: descriptionData,
          response: JSON.stringify(responseData),
          language: language,
        }),
      });

      console.log("Conversation saved.");
    } catch (err) {
      console.error("Failed to save conversation:", err);
    }
  };

  /* =========================================
     GENERATE
  ========================================= */
  const handleGenerate = async () => {
    if (!industryData || !descriptionData) {
      alert("Please fill in all fields.");
      return;
    }

    try {
      setIsSubmitting(true);
      setMode("generate");
      setLoading(true);
      setResponse(null);

      const result = await generateProductivity(
        industryData,
        descriptionData,
        language
      );

      setResponse(result);
      await saveConversation(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setIsSubmitting(false);
    }
  };

  /* =========================================
     COMPARE
  ========================================= */
  const handleCompare = async () => {
    // ✅ If not logged in, show auth modal instead
    if (!isLoggedIn) {
      setShowAuthModal(true);
      return;
    }

    if (!industryData || !descriptionData) {
      alert("Please fill in all fields.");
      return;
    }

    try {
      setIsSubmitting(true);
      setMode("compare");
      setLoading(true);
      setResponse(null);

      const result = await compareIndustry(
        industryData,
        descriptionData,
        language
      );

      setResponse(result);
      await saveConversation(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="order-2 lg:order-1 bg-white p-4 lg:p-8 rounded-2xl shadow-lg border border-gray-200 h-full flex flex-col justify-between overflow-hidden">
      <div className="flex flex-col gap-3">
        <input
          type="text"
          placeholder={t("industryPlaceholder")}
          className="w-full p-2 lg:p-3 border border-gray-300 rounded-lg h-10 lg:h-12 focus:outline-none focus:ring-2 focus:ring-[#78D1F5]"
          value={industryData}
          onChange={(e) => setIndustryData(e.target.value)}
        />

        <textarea
          placeholder={t("jobPlaceholder")}
          className="w-full p-2 lg:p-3 border border-gray-300 rounded-lg h-22 lg:flex-1 lg:min-h-[260px] resize-none focus:outline-none focus:ring-2 focus:ring-[#78D1F5]"
          value={descriptionData}
          onChange={(e) => setDescriptionData(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-3 mt-4">
        {/* GENERATE BUTTON — unchanged */}
        <button
          onClick={handleGenerate}
          disabled={isSubmitting}
          className={`w-full bg-[#78D1F5] text-white py-2 lg:py-3 rounded-lg font-semibold text-sm lg:text-base transition ${
            isSubmitting ? "opacity-50 cursor-not-allowed" : "hover:opacity-90"
          }`}
        >
          {isSubmitting ? "Loading..." : t("makeProductive")}
        </button>

        {/* ✅ COMPARE BUTTON — shows auth modal if not logged in */}
        <button
          onClick={handleCompare}
          disabled={isSubmitting}
          className={`w-full border border-[#78D1F5] text-[#78D1F5] py-2 lg:py-3 rounded-lg font-semibold text-sm lg:text-base transition ${
            isSubmitting ? "opacity-50 cursor-not-allowed" : "hover:bg-[#78D1F5]/10"
          }`}
        >
          {t("compare")}
        </button>
      </div>
    </div>
  );
}