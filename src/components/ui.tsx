import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 ${className}`}
    >
      {children}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "subtle";
};
export function Button({ variant = "primary", className = "", ...props }: BtnProps) {
  const styles: Record<string, string> = {
    primary: "bg-[var(--pro)] text-black font-semibold active:brightness-95",
    subtle: "bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)]",
    ghost: "bg-transparent text-[var(--text-dim)]",
    danger: "bg-transparent text-[var(--warn)] border border-[var(--border)]",
  };
  return (
    <button
      className={`rounded-xl px-4 py-2.5 text-sm disabled:opacity-40 disabled:pointer-events-none ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-[var(--text-dim)]">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-[var(--text-dim)]">{hint}</div>}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--pro)] ${props.className ?? ""}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--pro)] ${props.className ?? ""}`}
    />
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`spin inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto scroll-pt-16 rounded-t-3xl border border-[var(--border)] bg-[var(--surface)] pb-safe">
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-[var(--text-dim)] px-2 py-1 text-sm">
            Close
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--text-dim)]">
      {children}
    </div>
  );
}
