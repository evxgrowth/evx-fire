"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import {
  Building2,
  Crown,
  Images,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Plug,
  Share2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import FlameLogo from "./FlameLogo";
import { LiveBadge, SyncButton } from "./ui";

type Item = { href: string; label: string; icon: LucideIcon };

const NAV: Record<"gestor" | "admin", { section: string; items: Item[] }[]> = {
  gestor: [
    {
      section: "Visão",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/campanhas", label: "Campanhas", icon: Megaphone },
        { href: "/criativos", label: "Criativos", icon: Images },
        { href: "/clientes", label: "Clientes", icon: Building2 },
      ],
    },
    {
      section: "Conexões",
      items: [
        { href: "/integracoes", label: "Integrações & API", icon: Plug },
        { href: "/compartilhar", label: "Links para clientes", icon: Share2 },
      ],
    },
  ],
  admin: [
    {
      section: "Super Admin",
      items: [
        { href: "/admin", label: "Visão geral", icon: Crown },
        { href: "/admin/gestores", label: "Gestores", icon: Users },
      ],
    },
  ],
};

export interface ShellUser {
  name: string;
  role: string;
  isSuperAdmin: boolean;
}

const initials = (n: string) =>
  n
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

function NavList({ mode, onNavigate }: { mode: "gestor" | "admin"; onNavigate?: () => void }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));
  return (
    <nav className="space-y-6">
      {NAV[mode].map((g) => (
        <div key={g.section}>
          <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-ash-500">{g.section}</div>
          <ul className="space-y-1">
            {g.items.map((it) => {
              const active = isActive(it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    className={clsx(
                      "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                      active ? "text-white" : "text-ash-300 hover:bg-white/[0.03] hover:text-white",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId={`nav-${mode}`}
                        className="absolute inset-0 rounded-xl border border-fire-500/30 bg-gradient-to-r from-fire-600/25 to-fire-500/5 shadow-[0_0_24px_-8px_rgba(255,92,0,.8)]"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      >
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-fire-400 shadow-[0_0_10px_#ff7a1a]" />
                      </motion.span>
                    )}
                    <it.icon size={18} className={clsx("relative z-10", active && "text-fire-400 drop-shadow-[0_0_6px_rgba(255,122,26,.9)]")} />
                    <span className="relative z-10">{it.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarContent({ mode, user: u, onNavigate }: { mode: "gestor" | "admin"; user: ShellUser; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-8 pt-2">
        <FlameLogo />
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavList mode={mode} onNavigate={onNavigate} />
      </div>
      <div className="mt-6 space-y-3">
        {u.isSuperAdmin && (
          <Link
            href={mode === "admin" ? "/dashboard" : "/admin"}
            className="block rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-center text-[11px] text-ash-400 transition-colors hover:border-fire-500/30 hover:text-fire-300"
          >
            {mode === "admin" ? "Ir para o meu painel de gestor" : "Ir para o Super Admin"}
          </Link>
        )}
        <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-fire-300 to-fire-600 text-xs font-bold text-coal-950">{initials(u.name)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{u.name}</div>
            <div className="truncate text-[11px] text-ash-400">{u.role}</div>
          </div>
          <form action="/api/logout" method="post">
            <button className="text-ash-400 hover:text-fire-300" aria-label="Sair" title="Sair">
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AppShell({
  mode,
  user,
  lastSync,
  children,
}: {
  mode: "gestor" | "admin";
  user: ShellUser;
  lastSync?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:pl-[264px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-fire-500/10 bg-coal-900/80 p-4 backdrop-blur-xl lg:block">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-fire-500/40 to-transparent" />
        <SidebarContent mode={mode} user={user} />
      </aside>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-fire-500/20 bg-coal-900 p-4 lg:hidden"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
            >
              <button className="absolute right-3 top-3 text-ash-400" onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X size={20} />
              </button>
              <SidebarContent mode={mode} user={user} onNavigate={() => setOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-20 border-b border-white/[0.04] bg-coal-950/70 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-3 md:px-8">
          <button className="text-ash-300 lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu size={22} />
          </button>
          <div className="lg:hidden">
            <FlameLogo compact />
          </div>
          <div className="ml-auto flex items-center gap-3">
            {mode === "gestor" && (
              <>
                <div className="hidden sm:block">
                  <LiveBadge lastSync={lastSync} />
                </div>
                <SyncButton />
              </>
            )}
          </div>
        </div>
        <div className="ember-line opacity-40" />
      </header>

      <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
