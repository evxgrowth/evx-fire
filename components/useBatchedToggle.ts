"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Liga/desliga "otimista": a tela muda na hora do clique, os cliques entram numa fila
 * e, quando o usuário para de clicar, a fila inteira vai para o servidor numa única chamada.
 * Nenhum clique se perde, mesmo clicando em vários itens seguidos.
 */
export function useBatchedToggle(save: (changes: [string, boolean][]) => Promise<unknown>, delay = 700) {
  const router = useRouter();
  const [overlay, setOverlay] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const queue = useRef(new Map<string, boolean>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<unknown>>(Promise.resolve());

  const flush = useCallback(() => {
    const changes = [...queue.current];
    queue.current.clear();
    if (!changes.length) return;
    setSaving(true);
    // Encadeia as gravações: a próxima só começa quando a anterior termina, e nenhuma é descartada
    running.current = running.current
      .then(() => save(changes))
      .catch(() => {
        // Falhou: desfaz a mudança visual desses itens
        setOverlay((o) => {
          const next = { ...o };
          for (const [id] of changes) delete next[id];
          return next;
        });
      })
      .finally(() => {
        if (!queue.current.size) {
          setSaving(false);
          router.refresh();
        }
      });
  }, [save, router]);

  const toggle = useCallback(
    (id: string, value: boolean) => {
      setOverlay((o) => ({ ...o, [id]: value }));
      queue.current.set(id, value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush, delay],
  );

  /** Valor atual considerando os cliques ainda não gravados. */
  const valueOf = useCallback((id: string, server: boolean) => (id in overlay ? overlay[id] : server), [overlay]);

  return { toggle, valueOf, saving };
}
