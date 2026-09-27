import type { CampaignStatus } from "@/lib/types";

export const statusLabels: Record<CampaignStatus, string> = {
  active: "Ativa",
  learning: "Em análise",
  paused: "Pausada",
  ended: "Encerrada",
};

export default function StatusLed({ status, showLabel = true }: { status: CampaignStatus; showLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-ash-200" title={statusLabels[status]}>
      <span className={`led led-${status}`} />
      {showLabel && statusLabels[status]}
    </span>
  );
}
