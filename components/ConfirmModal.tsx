"use client";

import { motion, AnimatePresence } from "framer-motion";

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;   // ✅ ADD THIS
  confirmClassName?: string;   // ✅ ADD THIS
}

export default function ConfirmModal({
  open,
  title,
  description,
  confirmText = "Yes, Proceed",
  onCancel,
  onConfirm,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 backdrop-blur-md bg-black/30 flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-white p-8 rounded-2xl shadow-2xl w-[420px] text-center"
          >
            <h3 className="text-xl font-semibold mb-3">
              {title}
            </h3>

            <p className="text-gray-500 text-sm mb-6">
              {description}
            </p>

            <div className="flex justify-center gap-4">
              <button
                onClick={onCancel}
                className="px-5 py-2 border rounded-lg hover:bg-gray-100 transition"
              >
                Cancel
              </button>

              <button
                onClick={onConfirm}
                className="px-5 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition"
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