import CheckItem from "./CheckItem";

// Leitor de Markdown simples para os documentos internos (docs/*.md) mostrados no Super Admin.
// Suporta: títulos, parágrafos, listas (com subitens), itens de checklist "- [ ]", tabelas,
// blocos de código, citações, linha horizontal, **negrito**, *itálico* e `código`.

function inline(text: string, key = 0): React.ReactNode {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<b key={`${key}-${i++}`} className="font-semibold text-white">{inline(t.slice(2, -2), i)}</b>);
    else if (t.startsWith("`")) out.push(<code key={`${key}-${i++}`} className="rounded bg-white/[0.06] px-1 py-px font-mono text-[0.85em] text-fire-200">{t.slice(1, -1)}</code>);
    else out.push(<i key={`${key}-${i++}`}>{inline(t.slice(1, -1), i)}</i>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "hr" }
  | { t: "code"; text: string }
  | { t: "quote"; text: string }
  | { t: "table"; rows: string[][] }
  | { t: "list"; ordered: boolean; items: { text: string; depth: number; check: boolean }[] };

function parse(src: string): Block[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++;
      blocks.push({ t: "code", text: body.join("\n") });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ t: "h", level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) body.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push({ t: "quote", text: body.join(" ") });
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      blocks.push({ t: "table", rows });
      continue;
    }
    const li = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const items: { text: string; depth: number; check: boolean }[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (m) {
          const check = /^\[[ xX]\]\s+/.test(m[3]);
          items.push({ text: m[3].replace(/^\[[ xX]\]\s+/, ""), depth: Math.floor(m[1].length / 2), check });
          i++;
        } else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
          items[items.length - 1].text += " " + lines[i].trim();
          i++;
        } else break;
      }
      blocks.push({ t: "list", ordered, items });
      continue;
    }
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\||\s*([-*]|\d+\.)\s|---+\s*$)/.test(lines[i])) body.push(lines[i++]);
    blocks.push({ t: "p", text: body.join(" ") });
  }
  return blocks;
}

/** Mostra um documento Markdown. `checklistKey` liga a marcação dos itens "- [ ]" (salva no navegador). */
export default function Markdown({ source, checklistKey }: { source: string; checklistKey?: string }) {
  const blocks = parse(source);
  return (
    <div className="space-y-4 text-sm leading-relaxed text-ash-200">
      {blocks.map((b, k) => {
        if (b.t === "h") {
          const cls = ["", "font-display text-2xl font-bold text-white", "mt-8 border-b border-white/10 pb-2 font-display text-lg font-semibold text-white", "mt-6 font-display text-base font-semibold text-fire-200", "mt-4 font-semibold text-white"][b.level];
          const Tag = (["h1", "h1", "h2", "h3", "h4"] as const)[b.level];
          return (
            <Tag key={k} className={cls}>
              {inline(b.text)}
            </Tag>
          );
        }
        if (b.t === "hr") return <hr key={k} className="border-white/10" />;
        if (b.t === "code")
          return (
            <pre key={k} className="overflow-x-auto rounded-xl border border-white/5 bg-black/40 p-4 font-mono text-xs text-ash-200">
              {b.text}
            </pre>
          );
        if (b.t === "quote")
          return (
            <blockquote key={k} className="rounded-r-xl border-l-2 border-fire-500/60 bg-fire-500/[0.06] px-4 py-3 text-ash-100">
              {inline(b.text)}
            </blockquote>
          );
        if (b.t === "table")
          return (
            <div key={k} className="overflow-x-auto rounded-xl border border-white/5">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-white/[0.04] text-ash-300">
                    {b.rows[0].map((c, j) => (
                      <th key={j} className="px-3 py-2 font-semibold">
                        {inline(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.slice(1).map((r, ri) => (
                    <tr key={ri} className="border-t border-white/5 align-top">
                      {r.map((c, j) => (
                        <td key={j} className="px-3 py-2">
                          {inline(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        if (b.t === "list") {
          const Tag = b.ordered ? "ol" : "ul";
          return (
            <Tag key={k} className={b.ordered ? "list-decimal space-y-1.5 pl-5" : "space-y-1.5"}>
              {b.items.map((it, j) =>
                it.check && checklistKey ? (
                  <CheckItem key={j} storageKey={`${checklistKey}:${it.text}`}>
                    {inline(it.text)}
                  </CheckItem>
                ) : (
                  <li key={j} className={b.ordered ? "" : "flex gap-2"} style={{ marginLeft: it.depth * 18 }}>
                    {!b.ordered && <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-fire-400" />}
                    <span>{inline(it.text)}</span>
                  </li>
                ),
              )}
            </Tag>
          );
        }
        return <p key={k}>{inline(b.text)}</p>;
      })}
    </div>
  );
}

