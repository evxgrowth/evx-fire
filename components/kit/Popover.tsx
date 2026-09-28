"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Caixa flutuante presa a um botão (listas suspensas, calendário).
 * Fica "por cima" da página, então não é cortada por painéis ou modais,
 * e abre para cima quando não há espaço embaixo.
 */
export default function Popover({
  anchor,
  open,
  onClose,
  children,
  minWidth,
  matchWidth = true,
  maxHeight = 320,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  minWidth?: number;
  matchWidth?: boolean;
  maxHeight?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean; max: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.max(matchWidth ? r.width : 0, minWidth ?? 0);
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const up = below < Math.min(maxHeight, 220) && above > below;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      setPos({ top: up ? r.top - 6 : r.bottom + 6, left, width, up, max: Math.min(maxHeight, up ? above : below) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor, minWidth, matchWidth, maxHeight]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, onClose, anchor]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && pos && (
        <motion.div
          ref={box}
          initial={{ opacity: 0, y: pos.up ? 6 : -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: pos.up ? 6 : -6, scale: 0.98 }}
          transition={{ duration: 0.13 }}
          style={{
            position: "fixed",
            left: pos.left,
            width: pos.width || undefined,
            maxHeight: pos.max,
            ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
          }}
          className="z-[100] flex flex-col overflow-hidden rounded-xl border border-fire-500/25 bg-coal-900/98 shadow-[0_24px_60px_-18px_rgba(0,0,0,.95),0_0_36px_-18px_rgba(255,92,0,.6)] backdrop-blur-xl"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
