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
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <style>{`
        /* matches .hdr-btn sizing exactly */
        .ls-btn {
          height: 30px;
          padding: 0 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #374151;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s, box-shadow 0.15s;
          font-family: inherit;
          box-sizing: border-box;
        }
        .ls-btn:hover {
          background: #f9f9f9;
          box-shadow: 0 2px 6px rgba(0,0,0,0.09);
        }
        @media (min-width: 768px) {
          .ls-btn {
            height: 36px;
            padding: 0 14px;
            font-size: 13px;
          }
        }

        .ls-dropdown {
          position: absolute;
          left: 0;
          top: calc(100% + 6px);
          width: 148px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.10);
          overflow: hidden;
          z-index: 999;
        }
        .ls-option {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 9px 14px;
          font-size: 13px;
          font-weight: 500;
          color: #374151;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
          font-family: inherit;
          transition: background 0.12s;
        }
        .ls-option:hover { background: #f5f5f5; }
      `}</style>

      <div ref={ref} style={{ position: "relative" }}>
        <button className="ls-btn" onClick={() => setOpen((prev) => !prev)}>
          <img
            src={active?.flag}
            alt="flag"
            style={{ width: 14, height: 14, objectFit: "cover", borderRadius: 3 }}
          />
          <span>{active?.label}</span>
          <ChevronDown
            size={12}
            style={{
              transition: "transform 0.2s",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              className="ls-dropdown"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
            >
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  className="ls-option"
                  onClick={() => { setLanguage(lang.code as "en" | "de"); setOpen(false); }}
                >
                  <img
                    src={lang.flag}
                    alt={lang.full}
                    style={{ width: 14, height: 14, objectFit: "cover", borderRadius: 3 }}
                  />
                  <span>{lang.full}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}