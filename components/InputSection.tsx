"use client";

import { generateProductivity, compareIndustry } from "../services/api";

interface Props {
  setResponse: (value: any) => void;
  setLoading: (value: boolean) => void;
  setIndustryData: (value: string) => void;
  setDescriptionData: (value: string) => void;
  setMode: (value: "generate" | "compare") => void;

  industryData: string;
  descriptionData: string;
}

export default function InputSection({
  setResponse,
  setLoading,
  setIndustryData,
  setDescriptionData,
  setMode,
  industryData,
  descriptionData,
}: Props) {
  const handleGenerate = async () => {
    if (!industryData || !descriptionData) return;

    setMode("generate");
    setLoading(true);
    setResponse(null);

    const result = await generateProductivity(industryData, descriptionData);

    setResponse(result);
    setLoading(false);
  };

  const handleCompare = async () => {
    if (!industryData || !descriptionData) return;

    setMode("compare");
    setLoading(true);
    setResponse(null);

    const result = await compareIndustry(industryData, descriptionData);

    setResponse(result);
    setLoading(false);
  };

  return (
    <div className="order-2 lg:order-1 bg-white p-4 lg:p-8 rounded-2xl shadow-lg border border-gray-200 
                    h-full flex flex-col justify-between overflow-hidden">

      {/* Inputs */}
      <div className="flex flex-col gap-3">

        {/* Desktop polish only */}
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

      {/* Buttons */}
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