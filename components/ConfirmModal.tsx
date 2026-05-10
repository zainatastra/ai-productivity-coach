"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, LogOut, Trash2, RefreshCw } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmText: string;
  confirmDisabled?: boolean;
  confirmClassName?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/* Pick an icon based on keywords in the title */
function ModalIcon({ title }: { title: string }) {
  const lower = title.toLowerCase();
  const isLogout  = lower.includes("logout") || lower.includes("abmeld") || lower.includes("sign out");
  const isDelete  = lower.includes("delete") || lower.includes("lösch") || lower.includes("clear");
  const isReset   = lower.includes("reset") || lower.includes("clear");

  if (isLogout) return (
    <div style={{ width: 52, height: 52, borderRadius: 999, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", color: "#dc2626" }}>
      <LogOut size={22} />
    </div>
  );
  if (isDelete || isReset) return (
    <div style={{ width: 52, height: 52, borderRadius: 999, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", color: "#dc2626" }}>
      <Trash2 size={22} />
    </div>
  );
  return (
    <div style={{ width: 52, height: 52, borderRadius: 999, background: "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", color: "#f59e0b" }}>
      <AlertTriangle size={22} />
    </div>
  );
}

/* Is this a destructive confirm? */
function isDestructive(text: string) {
  const l = text.toLowerCase();
  return l.includes("delete") || l.includes("logout") || l.includes("clear") ||
         l.includes("lösch") || l.includes("abmeld") || l.includes("yes");
}

export default function ConfirmModal({
  open,
  title,
  description,
  confirmText,
  confirmDisabled = false,
  confirmClassName = "",
  onCancel,
  onConfirm,
}: Props) {
  const destructive = isDestructive(confirmText);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.38)",
            backdropFilter: "blur(4px)",
            padding: 24,
          }}
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            style={{
              background: "#fff",
              borderRadius: 24,
              width: "100%",
              maxWidth: 380,
              padding: "32px 28px 28px",
              textAlign: "center",
              boxShadow: "0 24px 64px rgba(0,0,0,0.16), 0 4px 16px rgba(0,0,0,0.08)",
              border: "1px solid rgba(0,0,0,0.06)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon */}
            <ModalIcon title={title} />

            {/* Title */}
            <h3 style={{
              fontSize: 17,
              fontWeight: 800,
              color: "#0d1117",
              marginBottom: 8,
              letterSpacing: "-0.02em",
              lineHeight: 1.3,
            }}>
              {title}
            </h3>

            {/* Description */}
            <p style={{
              fontSize: 13,
              color: "#6b7280",
              marginBottom: 26,
              lineHeight: 1.65,
            }}>
              {description}
            </p>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              {/* Cancel */}
              <button
                onClick={onCancel}
                style={{
                  flex: 1,
                  padding: "11px 20px",
                  borderRadius: 999,
                  border: "1.5px solid #e5e7eb",
                  background: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#374151",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f9f9f9")}
                onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
              >
                Cancel
              </button>

              {/* Confirm */}
              <button
                onClick={onConfirm}
                disabled={confirmDisabled}
                style={{
                  flex: 1,
                  padding: "11px 20px",
                  borderRadius: 999,
                  border: "none",
                  background: destructive ? "#dc2626" : "#0d1117",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#fff",
                  cursor: confirmDisabled ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  opacity: confirmDisabled ? 0.5 : 1,
                  transition: "opacity 0.15s, transform 0.12s",
                  boxShadow: destructive
                    ? "0 4px 14px rgba(220,38,38,0.30)"
                    : "0 4px 14px rgba(0,0,0,0.18)",
                }}
                onMouseEnter={e => { if (!confirmDisabled) (e.currentTarget as HTMLElement).style.opacity = "0.88"; }}
                onMouseLeave={e => { if (!confirmDisabled) (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
