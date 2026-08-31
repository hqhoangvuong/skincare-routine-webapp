export type IconKey =
  | "balm"
  | "micellar"
  | "cleanser"
  | "toner"
  | "exfoliant"
  | "serum"
  | "cream"
  | "mask"
  | "sun"
  | "water"
  | "flower";

type IconFn = (size: number) => JSX.Element;

export const ICONS: Record<IconKey, IconFn> = {
  micellar: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="10" r="6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="15" cy="14" r="6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  cleanser: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3c2 3 5 6 5 10a5 5 0 0 1-10 0c0-4 3-7 5-10Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  ),
  toner: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="8" y="9" width="8" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 9V6a2 2 0 0 1 2-2 2 2 0 0 1 2 2v3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  exfoliant: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.6" strokeDasharray="1.5 3" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  ),
  serum: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M9 3h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M10 3v5l-4 8a3 3 0 0 0 3 4.5h6a3 3 0 0 0 3-4.5l-4-8V3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="16" r="1.4" fill="currentColor" />
    </svg>
  ),
  cream: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="9" width="14" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <rect x="7" y="5" width="10" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  mask: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 10c0-3 3-6 8-6s8 3 8 6c0 5-3 9-8 9s-8-4-8-9Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="9" cy="11" r="1" fill="currentColor" />
      <circle cx="15" cy="11" r="1" fill="currentColor" />
    </svg>
  ),
  sun: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.6" />
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M12 2v3" />
        <path d="M12 19v3" />
        <path d="M2 12h3" />
        <path d="M19 12h3" />
        <path d="M4.9 4.9l2.1 2.1" />
        <path d="M17 17l2.1 2.1" />
        <path d="M19.1 4.9L17 7" />
        <path d="M7 17l-2.1 2.1" />
      </g>
    </svg>
  ),
  water: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  ),
  flower: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <g fill="currentColor" opacity="0.85">
        <ellipse cx="12" cy="7" rx="3" ry="4" />
        <ellipse cx="17" cy="12" rx="4" ry="3" />
        <ellipse cx="12" cy="17" rx="3" ry="4" />
        <ellipse cx="7" cy="12" rx="4" ry="3" />
      </g>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    </svg>
  ),
  balm: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6l7-3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

export function Icon({ icon, size = 20 }: { icon: IconKey; size?: number }) {
  return ICONS[icon](size);
}
