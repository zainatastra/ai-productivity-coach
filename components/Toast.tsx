"use client";

import { motion, AnimatePresence } from "framer-motion";

interface Props {
  show: boolean;
  message: string;
}

export default function Toast({ show, message }: Props) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 
                     bg-black text-white px-6 py-3 rounded-xl 
                     shadow-lg z-50 text-sm font-medium"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}