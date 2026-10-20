import { NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Today", glyph: "◎" },
  { to: "/workout", label: "Gym", glyph: "🏋" },
  { to: "/favourites", label: "Favourites", glyph: "★" },
  { to: "/progress", label: "Progress", glyph: "📈" },
  { to: "/memory", label: "Memory", glyph: "🧠" },
  { to: "/settings", label: "Settings", glyph: "⚙" },
];

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur pb-safe">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === "/"}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
                isActive ? "text-[var(--pro)]" : "text-[var(--text-dim)]"
              }`
            }
          >
            <span className="text-lg leading-none">{it.glyph}</span>
            {it.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
