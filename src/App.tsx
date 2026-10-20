import { createContext, lazy, Suspense, useContext, useState, type ReactNode } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { LogMealSheet } from "./screens/LogMeal";
import { Today } from "./screens/Today";

const History = lazy(() => import("./screens/History").then((m) => ({ default: m.History })));
const Workout = lazy(() => import("./screens/Workout").then((m) => ({ default: m.Workout })));
const Progress = lazy(() => import("./screens/Progress").then((m) => ({ default: m.Progress })));
const Memory = lazy(() => import("./screens/Memory").then((m) => ({ default: m.Memory })));
const Settings = lazy(() => import("./screens/Settings").then((m) => ({ default: m.Settings })));
const Favourites = lazy(() =>
  import("./screens/Favourites").then((m) => ({ default: m.Favourites })),
);

const LogSheetContext = createContext<{ open: () => void }>({ open: () => {} });
export const useLogSheet = () => useContext(LogSheetContext);

export function App() {
  const [logOpen, setLogOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <LogSheetContext.Provider value={{ open: () => setLogOpen(true) }}>
      <div className="mx-auto min-h-full max-w-md">
        <main className="px-4 pt-safe pb-[calc(9.5rem+env(safe-area-inset-bottom))]">
          <Suspense fallback={<div className="py-16 text-center text-sm text-[var(--text-dim)]">Loading…</div>}>
            <Routes>
              <Route path="/" element={<Today />} />
              <Route path="/history" element={<History />} />
              <Route path="/workout" element={<Workout />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/memory" element={<Memory />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/favourites" element={<Favourites />} />
            </Routes>
          </Suspense>
        </main>

        <div className="fixed inset-x-0 z-40 flex justify-center gap-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom))]">
          <button
            onClick={() => setLogOpen(true)}
            className="rounded-full bg-[var(--pro)] px-5 py-3 text-sm font-semibold text-black shadow-lg shadow-black/30 active:brightness-95"
          >
            ＋ Log meal
          </button>
          <button
            onClick={() => navigate("/workout")}
            className="rounded-full bg-[var(--pro)] px-5 py-3 text-sm font-semibold text-black shadow-lg shadow-black/30 active:brightness-95"
          >
            ＋ Log gym
          </button>
        </div>

        <BottomNav />
        <LogMealSheet open={logOpen} onClose={() => setLogOpen(false)} />
      </div>
    </LogSheetContext.Provider>
  );
}

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h1 className="mb-3 mt-1 text-xl font-semibold">{title}</h1>
      {children}
    </>
  );
}
