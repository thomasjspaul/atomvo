interface RingProps {
  value: number;
  target: number;
  label: string;
  unit: string;
  color: string;
  size?: number;
}

/** Circular progress. Goes past 100% by darkening / overshoot arc. */
export function Ring({ value, target, label, unit, color, size = 132 }: RingProps) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const frac = target > 0 ? value / target : 0;
  const clamped = Math.max(0, Math.min(1, frac));
  const over = frac > 1.02;
  const remaining = Math.round(target - value);

  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{ width: size, height: size }} className="relative">
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - clamped)}
            style={{ transition: "stroke-dashoffset .5s ease", opacity: over ? 0.55 : 1 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{Math.round(value)}</span>
          <span className="text-[11px] text-[var(--text-dim)]">
            / {Math.round(target)} {unit}
          </span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-medium">{label}</div>
        <div className={`text-xs ${remaining < 0 ? "text-[var(--warn)]" : "text-[var(--text-dim)]"}`}>
          {remaining >= 0 ? `${remaining} ${unit} left` : `${-remaining} ${unit} over`}
        </div>
      </div>
    </div>
  );
}
