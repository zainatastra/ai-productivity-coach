"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

interface Props {
  show: boolean;
  message: string;
}

export default function Toast({ show, message }: Props) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 24, opacity: 0, scale: 0.94 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 24, opacity: 0, scale: 0.94 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          style={{
            position: "fixed",
            bottom: 28,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "11px 20px",
            borderRadius: 999,
            background: "linear-gradient(135deg, #0d1117 0%, #1a1f2e 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.18)",
            backdropFilter: "blur(12px)",
            whiteSpace: "nowrap",
          }}
        >
          {/* green check icon */}
          <div style={{
            width: 22, height: 22, borderRadius: 999, flexShrink: 0,
            background: "rgba(16,185,129,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <CheckCircle2 size={13} color="#10b981" />
          </div>

          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#f8f8ff",
            letterSpacing: "0.01em",
          }}>
            {message}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
