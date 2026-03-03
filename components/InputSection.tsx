"use client";

import { generateProductivity, compareIndustry } from "../services/api";
import { getAuth } from "firebase/auth";
import { app } from "@/services/firebase";
import { useAuth } from "@/services/AuthContext";

interface Props {
  setResponse: (value: any) => void;
  setLoading: (value: boolean) => void;
  setIndustryData: (value: string) => void;
  setDescriptionData: (value: string) => void;
  setMode: (value: "generate" | "compare") => void;

  industryData: string;
  descriptionData: string;

  language: "en" | "de"; // 🔥 NEW
}

export default function InputSection({
  setResponse,
  setLoading,
  setIndustryData,
  setDescriptionData,
  setMode,
  industryData,
  descriptionData,
  language, // 🔥 NEW
}: Props) {
  const { user } = useAuth();
  const auth = getAuth(app);

  /* =========================================
     SAVE CONVERSATION
  ========================================= */
  const saveConversation = async (responseData: any) => {
    try {
      if (!user || user.isAnonymous) return;

      const token = await auth.currentUser?.getIdToken();

      await fetch("http://localhost:5048/api/conversation/save", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          industry: industryData,
          description: descriptionData,
          response: JSON.stringify(responseData),
          language: language, // 🔥 SAVE LANGUAGE
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
    if (!industryData || !descriptionData) return;

    try {
      setMode("generate");
      setLoading(true);
      setResponse(null);

      const result = await generateProductivity(
        industryData,
        descriptionData,
        language // 🔥 PASS LANGUAGE
      );

      setResponse(result);

      await saveConversation(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /* =========================================
     COMPARE
  ========================================= */
  const handleCompare = async () => {
    if (!industryData || !descriptionData) return;

    try {
      setMode("compare");
      setLoading(true);
      setResponse(null);

      const result = await compareIndustry(
        industryData,
        descriptionData,
        language // 🔥 PASS LANGUAGE
      );

      setResponse(result);

      await saveConversation(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="order-2 lg:order-1 bg-white p-4 lg:p-8 rounded-2xl shadow-lg border border-gray-200 
                 h-full flex flex-col justify-between overflow-hidden"
    >
      <div className="flex flex-col gap-3">
        <input
          type="text"
          placeholder="Write your industry..."
          className="w-full p-2 lg:p-3 border border-gray-300 rounded-lg 
                     h-10 lg:h-12 
                     focus:outline-none focus:ring-2 focus:ring-[#78D1F5]"
          value={industryData}
          onChange={(e) => setIndustryData(e.target.value)}
        />

        <textarea
          placeholder="Tell about your job in 3-5 sentences..."
          className="w-full p-2 lg:p-3 border border-gray-300 rounded-lg 
                     h-22 lg:flex-1 lg:min-h-[260px] 
                     resize-none 
                     focus:outline-none focus:ring-2 focus:ring-[#78D1F5]"
          value={descriptionData}
          onChange={(e) => setDescriptionData(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-3 mt-4">
        <button
          onClick={handleGenerate}
          className="w-full bg-[#78D1F5] text-white 
                     py-2 lg:py-3 
                     rounded-lg font-semibold 
                     text-sm lg:text-base transition"
        >
          Make Me Productive
        </button>

        <button
          onClick={handleCompare}
          className="w-full border border-[#78D1F5] text-[#78D1F5] 
                     py-2 lg:py-3 
                     rounded-lg font-semibold 
                     text-sm lg:text-base transition"
        >
          Compare
        </button>
      </div>
    </div>
  );
}