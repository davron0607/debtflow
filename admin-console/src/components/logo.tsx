// Логотип DebtFlow: тёмно-синяя «D» с барами роста и зелёной стрелкой.
// SVG-версия фирменного знака — масштабируется от фавикона до шапки логина.

const NAVY = "#1B3A5C";
const GREEN_DARK = "#3E8E41";
const GREEN_LIGHT = "#8CC63F";

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-label="DebtFlow">
      <defs>
        <linearGradient id="df-green" x1="10" y1="56" x2="52" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={GREEN_LIGHT} />
          <stop offset="1" stopColor={GREEN_DARK} />
        </linearGradient>
      </defs>
      {/* Дуга «D» */}
      <path
        d="M20 6 H30 C48 6 58 16 58 30 C58 42 50 50 38 52 L36 44 C45 42 50 37 50 30 C50 21 43 14 30 14 H20 Z"
        fill={NAVY}
      />
      {/* Бары роста */}
      <rect x="8" y="38" width="7" height="14" rx="1.5" fill={NAVY} />
      <rect x="18" y="31" width="7" height="21" rx="1.5" fill={NAVY} />
      <rect x="28" y="24" width="7" height="28" rx="1.5" fill={NAVY} />
      {/* Зелёная стрелка вверх-вправо */}
      <path
        d="M4 58 C14 60 30 60 42 50 L47 55 L52 40 L36 42 L41 47 C30 55 16 56 6 54 Z"
        fill="url(#df-green)"
      />
    </svg>
  );
}

export function Logo({
  size = 32,
  dark = false,
  tagline = false,
}: {
  size?: number;
  dark?: boolean; // true — на тёмном фоне (сайдбар)
  tagline?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <div className="leading-tight">
        <div className="font-display font-bold" style={{ fontSize: size * 0.56 }}>
          <span style={{ color: dark ? "#FFFFFF" : NAVY }}>Debt</span>
          <span style={{ color: GREEN_DARK }}>Flow</span>
        </div>
        {tagline && (
          <div
            className="uppercase tracking-widest"
            style={{ fontSize: Math.max(7, size * 0.17), color: dark ? "rgba(255,255,255,0.6)" : NAVY }}
          >
            Единая операционная система взыскания
          </div>
        )}
      </div>
    </div>
  );
}
