"use client";

import { useAuth } from "@/services/AuthContext";
import { useRouter } from "next/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Menu } from "lucide-react";
import { useLanguage } from "@/services/LanguageContext"; // ✅ ADD THIS

interface HeaderProps {
  setShowClearModal?: (value: boolean) => void;
  setMobileSidebarOpen?: (value: boolean) => void;
}

export default function Header({
  setShowClearModal,
  setMobileSidebarOpen,
}: HeaderProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { t } = useLanguage(); // ✅ ADD THIS

  return (
    <div className="relative w-full flex items-center justify-between px-4 md:px-8 py-1 md:py-1.3 bg-[#f9f9f9] border-b border-gray-200">

      {/* LEFT SECTION */}
      <div className="flex items-center gap-3">

        {/* HAMBURGER */}
        {!loading && user && (
          <button
            onClick={() => setMobileSidebarOpen?.(true)}
            className="md:hidden"
          >
            <Menu size={20} />
          </button>
        )}

        {/* TITLE */}
        <h1
          onClick={() => router.push("/")}
          className="
            !text-[13px] sm:!text-sm md:!text-lg
            font-semibold
            text-gray-900
            cursor-pointer
            tracking-tight
            whitespace-nowrap
            md:absolute md:left-1/2 md:-translate-x-1/2
          "
        >
          {t("Ey Eric! Make me Productive!")} {/* ✅ UPDATED */}
        </h1>
      </div>

      {/* RIGHT SECTION */}
      <div className="flex items-center gap-2">

        <LanguageSwitcher />

        {!loading && !user && (
          <>
            <button
              onClick={() => router.push("/auth?mode=login")}
              className="h-9 px-5 rounded-full border border-gray-300 text-sm font-medium bg-white text-gray-800 hover:bg-gray-100 hover:shadow-sm transition"
            >
              Login
            </button>

            <button
              onClick={() => router.push("/auth?mode=signup")}
              className="h-9 px-5 rounded-full bg-black text-white text-sm font-medium hover:bg-gray-900 transition shadow-sm"
            >
              SignUp
            </button>
          </>
        )}

        {!loading && user && (
          <button
            onClick={() => setShowClearModal?.(true)}
            className="h-9 px-5 rounded-full border border-gray-300 text-sm font-medium bg-white text-red-600 hover:bg-red-50 hover:shadow-sm transition"
          >
            {t("clear")} {/* ✅ UPDATED */}
          </button>
        )}
      </div>
    </div>
  );
}