"use client";

import { useAuth } from "@/services/AuthContext";
import { useRouter } from "next/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Menu } from "lucide-react";
import { useLanguage } from "@/services/LanguageContext";

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
  const { language } = useLanguage();

  return (
    <>
      <style>{`
        .hdr-root {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          height: 52px;
          background: #fafafa;
          border-bottom: 1px solid #ebebeb;
          box-shadow: 0 1px 8px rgba(0, 0, 0, 0.04);
          position: relative;
          flex-shrink: 0;
          gap: 8px;
          box-sizing: border-box;
        }

        /* LEFT */
        .hdr-left {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 0;
          overflow: hidden;
        }

        .hdr-hamburger {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background: #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
          cursor: pointer;
          color: #374151;
          flex-shrink: 0;
          transition: background 0.15s;
        }
        .hdr-hamburger:hover { background: #f3f4f6; }

        /* CENTER TITLE */
        .hdr-title {
          font-size: 11px;
          font-weight: 600;
          color: #111;
          cursor: pointer;
          white-space: nowrap;
          letter-spacing: -0.01em;
          transition: color 0.15s;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
          flex-shrink: 1;
        }
        .hdr-title:hover { color: #374151; }

        @media (min-width: 768px) {
          .hdr-title {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            font-size: 15px;
            flex-shrink: 0;
          }
        }

        /* RIGHT */
        .hdr-right {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-shrink: 0;
        }

        /* SHARED BUTTON BASE — identical dimensions for all buttons */
        .hdr-btn {
          height: 30px;
          min-width: 62px;
          padding: 0 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s, box-shadow 0.15s;
          line-height: 1;
          font-family: inherit;
          box-sizing: border-box;
        }

        @media (min-width: 768px) {
          .hdr-btn {
            height: 36px;
            min-width: 76px;
            padding: 0 18px;
            font-size: 13px;
          }
        }

        /* LOGIN */
        .hdr-btn-outline {
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #374151;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        .hdr-btn-outline:hover {
          background: #f9f9f9;
          box-shadow: 0 2px 6px rgba(0,0,0,0.09);
        }

        /* SIGN UP */
        .hdr-btn-solid {
          border: none;
          background: #111;
          color: #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.18);
        }
        .hdr-btn-solid:hover {
          background: #222;
          box-shadow: 0 3px 10px rgba(0,0,0,0.22);
        }

        /* CLEAR */
        .hdr-btn-clear {
          border: 1px solid #fecaca;
          background: #fff;
          color: #dc2626;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .hdr-btn-clear:hover {
          background: #fef2f2;
          box-shadow: 0 2px 6px rgba(220,38,38,0.10);
        }
      `}</style>

      <header className="hdr-root">

        {/* LEFT — hamburger + title */}
        <div className="hdr-left">
          {!loading && user && (
            <button
              className="hdr-hamburger md:hidden"
              onClick={() => setMobileSidebarOpen?.(true)}
              aria-label="Open menu"
            >
              <Menu size={16} />
            </button>
          )}

          <span
            className="hdr-title"
            onClick={() => router.push("/")}
          >
            {language === "de"
              ? "Hey Eric! Mach mich produktiv!"
              : "Ey Eric! Make me Productive!"}
          </span>
        </div>

        {/* RIGHT — language + auth buttons */}
        <div className="hdr-right">
          <LanguageSwitcher />

          {!loading && !user && (
            <>
              <button
                className="hdr-btn hdr-btn-outline"
                onClick={() => router.push("/auth?mode=login")}
              >
                {language === "de" ? "Anmelden" : "Login"}
              </button>

              <button
                className="hdr-btn hdr-btn-solid"
                onClick={() => router.push("/auth?mode=signup")}
              >
                {language === "de" ? "Registrieren" : "Sign Up"}
              </button>
            </>
          )}

          {!loading && user && (
            <button
              className="hdr-btn hdr-btn-clear"
              onClick={() => setShowClearModal?.(true)}
            >
              {language === "de" ? "Löschen" : "Clear"}
            </button>
          )}
        </div>

      </header>
    </>
  );
}
