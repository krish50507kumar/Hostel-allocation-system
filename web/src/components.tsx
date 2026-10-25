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