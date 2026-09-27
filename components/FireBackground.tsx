"use client";

import { useEffect, useRef } from "react";

/** Brasas subindo pelo fundo da tela. */
export default function FireBackground({ density = 55 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = canvas.width = window.innerWidth * dpr;
      h = canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    type P = { x: number; y: number; r: number; vy: number; vx: number; life: number; max: number; hue: number };
    const spawn = (initial = false): P => ({
      x: Math.random() * w,
      y: initial ? Math.random() * h : h + 10,
      r: (Math.random() * 1.8 + 0.6) * dpr,
      vy: -(Math.random() * 0.6 + 0.25) * dpr,
      vx: (Math.random() - 0.5) * 0.3 * dpr,
      life: 0,
      max: 400 + Math.random() * 500,
      hue: 18 + Math.random() * 22,
    });
    const ps: P[] = Array.from({ length: density }, () => spawn(true));

    let raf = 0;
    let t = 0;
    const tick = () => {
      t += 0.01;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.life++;
        p.y += p.vy;
        p.x += p.vx + Math.sin(t * 2 + i) * 0.25 * dpr;
        const k = 1 - p.life / p.max;
        if (k <= 0 || p.y < -10) {
          ps[i] = spawn();
          continue;
        }
        const flicker = 0.6 + Math.sin(t * 8 + i * 3) * 0.4;
        const a = Math.min(1, k * 1.2) * flicker * 0.8;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
        g.addColorStop(0, `hsla(${p.hue + 20}, 100%, 75%, ${a})`);
        g.addColorStop(0.3, `hsla(${p.hue}, 100%, 55%, ${a * 0.6})`);
        g.addColorStop(1, `hsla(${p.hue}, 100%, 50%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [density]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-70" />;
}
