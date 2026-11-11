import type { ReactNode } from "react";

// Small shared UI pieces: facility chips, bed-availability meter, skeleton loaders.
const label = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// Clean SVG icons for common facilities (no emojis)
function FacilityIcon({ name }: { name: string }) {
  switch (name) {
    case "wifi":
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      );
    case "attached_bathroom":
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M10 2v4" /><path d="M14 2v4" />
        </svg>
      );
    case "study_desk":
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="12" rx="2" /><line x1="2" y1="20" x2="22" y2="20" /><line x1="7" y1="16" x2="7" y2="20" /><line x1="17" y1="16" x2="17" y2="20" />
        </svg>
      );
    case "air_conditioning":
    case "ac":
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="6" width="20" height="10" rx="2" /><line x1="6" y1="18" x2="6" y2="20" /><line x1="18" y1="18" x2="18" y2="20" />
        </svg>
      );
    default:
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
  }
}

// Clean badge chips with crisp SVG icons
export function Facilities({ items }: { items: string[] }) {
  if (!items.length) return <p className="state">No listed facilities</p>;
  return (
    <ul className="chips">
      {items.map((k) => (
        <li key={k} className="chip">
          <FacilityIcon name={k} />
          <span>{label(k)}</span>
        </li>
      ))}
    </ul>
  );
}

// Filled dots = taken beds, free dots = available beds.
export function BedMeter({ available, total }: { available: number; total?: number }) {
  const a = Number(available);
  if (!total) return <p className="beds">{a} bed{a === 1 ? "" : "s"} free</p>;
  const t = Number(total);
  return (
    <div className="beds">
      <span className="dots" aria-hidden="true">
        {Array.from({ length: t }, (_, i) => (
          <i key={i} className={i < t - a ? "taken" : "free"} />
        ))}
      </span>
      <span>
        {a} of {t} bed{t === 1 ? "" : "s"} free{a === 1 && t > 1 ? " · last one" : ""}
      </span>
    </div>
  );
}

export function SkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <ul className="grid" role="status" aria-label="Loading">
      <li className="sr-only">Loading…</li>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="card skeleton" aria-hidden="true">
          <span className="sk w60" />
          <span className="sk w90" />
          <span className="sk w40" />
        </li>
      ))}
    </ul>
  );
}

// -------------------------------------------------------------
// Markdown formatter for AI chat messages & assistant responses
// Safely parses bold (**bold**), italic (*italic*), code (`code`),
// bullet/ordered lists, headings and paragraphs into React elements.
// -------------------------------------------------------------

function normalizeChatText(raw: string): string {
  if (!raw) return "";
  let s = raw.replace(/\r\n/g, "\n");
  // Normalize bullet points that were placed inline after a colon, e.g. "Available rooms: - Room 101 - Room 102"
  s = s.replace(/:\s+-\s+/g, ":\n- ");
  // Break inline bullets e.g. "beds) - **Building" or ". - **Building"
  s = s.replace(/([).0-9a-zA-Z])\s+-\s+(\*|\w)/g, "$1\n- $2");
  return s;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // Matches: `code`, [label](url), **bold**, __bold__, *italic*
  const regex = /(`[^`\n]+`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*[^*]+?\*\*|__[^_]+?__|(?<!\w)\*[^*\n]+?\*(?!\w))/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={key} className="chat-msg__code">{token.slice(1, -1)}</code>);
    } else if (token.startsWith("[") && match[2] && match[3]) {
      nodes.push(
        <a key={key} href={match[3]} target="_blank" rel="noopener noreferrer" className="chat-msg__link">
          {match[2]}
        </a>
      );
    } else if (
      (token.startsWith("**") && token.endsWith("**")) ||
      (token.startsWith("__") && token.endsWith("__"))
    ) {
      nodes.push(<strong key={key} className="chat-msg__strong">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={key} className="chat-msg__em">{token.slice(1, -1)}</em>);
    } else {
      nodes.push(token);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "p"; text: string };

function parseBlocks(raw: string): Block[] {
  const normalized = normalizeChatText(raw);
  const lines = normalized.split("\n");
  const blocks: Block[] = [];
  let currentList: { type: "ul" | "ol"; items: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentList) {
        blocks.push(currentList);
        currentList = null;
      }
      continue;
    }

    // Bullet list item (- item, * item, + item)
    const bulletMatch = line.match(/^(\s*)([-*+])\s+(.*)/);
    if (bulletMatch) {
      if (!currentList || currentList.type !== "ul") {
        if (currentList) blocks.push(currentList);
        currentList = { type: "ul", items: [] };
      }
      currentList.items.push(bulletMatch[3]);
      continue;
    }

    // Numbered list item (1. item, 2. item)
    const numMatch = line.match(/^(\s*)(\d+)\.\s+(.*)/);
    if (numMatch) {
      if (!currentList || currentList.type !== "ol") {
        if (currentList) blocks.push(currentList);
        currentList = { type: "ol", items: [] };
      }
      currentList.items.push(numMatch[3]);
      continue;
    }

    if (currentList) {
      blocks.push(currentList);
      currentList = null;
    }

    // Headings (# Heading, ## Heading)
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2] });
      continue;
    }

    blocks.push({ type: "p", text: trimmed });
  }

  if (currentList) {
    blocks.push(currentList);
  }

  return blocks;
}

export function FormattedMessage({ text }: { text: string }) {
  if (!text) return null;
  const blocks = parseBlocks(text);

  return (
    <div className="chat-msg__formatted">
      {blocks.map((b, idx) => {
        if (b.type === "heading") {
          return (
            <h4 key={idx} className="chat-msg__heading">
              {renderInline(b.text, `h-${idx}`)}
            </h4>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={idx} className="chat-msg__list">
              {b.items.map((item, liIdx) => (
                <li key={liIdx}>{renderInline(item, `ul-${idx}-${liIdx}`)}</li>
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={idx} className="chat-msg__list chat-msg__list--ol">
              {b.items.map((item, liIdx) => (
                <li key={liIdx}>{renderInline(item, `ol-${idx}-${liIdx}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={idx} className="chat-msg__p">
            {renderInline(b.text, `p-${idx}`)}
          </p>
        );
      })}
    </div>
  );
}
