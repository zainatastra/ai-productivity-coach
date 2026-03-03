"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "@/services/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const languages = [
    { code: "en", label: "EN", full: "English", flag: "/us.png" },
    { code: "de", label: "DE", full: "Deutsch", flag: "/de.png" },
  ];

  const active = languages.find((l) => l.code === language);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* ACTIVE BUTTON */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="
          h-9 px-4 rounded-xl
          border border-gray-300
          bg-white text-gray-700 text-sm
          hover:bg-gray-100 transition
          flex items-center justify-center gap-2
        "
      >
        <img
          src={active?.flag}
          alt="flag"
          className="w-4 h-4 object-cover rounded-sm"
        />
        <span className="font-medium">{active?.label}</span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* BUTTER SMOOTH DROPDOWN */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
            className="absolute left-0 top-full mt-2 w-40 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-[999]"
          >
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  setLanguage(lang.code as "en" | "de");
                  setOpen(false);
                }}
                className="flex items-center gap-2 px-4 py-2 w-full hover:bg-gray-100 transition text-left text-sm"
              >
                <img
                  src={lang.flag}
                  alt={lang.full}
                  className="w-4 h-4 object-cover rounded-sm"
                />
                <span>{lang.full}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}