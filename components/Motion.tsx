"use client";

import { motion } from "framer-motion";

/** Pequeno atalho para animar a entrada de blocos em páginas do servidor. */
export function FadeIn({ children, delay = 0, scale = false, className }: { children: React.ReactNode; delay?: number; scale?: boolean; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: scale ? 0 : 20, scale: scale ? 0.6 : 1 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: scale ? 0.9 : 0.6, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
