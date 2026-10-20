import { useState } from "react";
import { Button, Field, Select, Sheet } from "../ui";
import { addDaysISO, todayISO } from "../../lib/day";

const REPORTS = [
  { value: "sessions", label: "Sessions" },
  { value: "sets", label: "Every set" },
  { value: "exercise_summary", label: "Exercise summary" },
  { value: "personal_records", label: "Personal records" },
];

function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function ExportSheet({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState("sessions");
  const [format, setFormat] = useState<"pdf" | "xlsx" | "csv">("pdf");
  const [from, setFrom] = useState(addDaysISO(todayISO(), -89));
  const [to, setTo] = useState(todayISO());

  const go = () => {
    const params = new URLSearchParams({ report, from, to });
    if (format === "pdf") {
      params.set("format", "html");
      window.open(`/api/workouts/export?${params}`, "_blank");
    } else {
      params.set("format", format);
      triggerDownload(`/api/workouts/export?${params}`);
    }
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title="Export gym progress">
      <div className="space-y-3">
        <Field label="Report">
          <Select value={report} onChange={(e) => setReport(e.target.value)}>
            {REPORTS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-2">
          <Field label="From">
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--pro)]"
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={to}
              min={from}
              max={todayISO()}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--pro)]"
            />
          </Field>
        </div>
        <Field label="Format">
          <Select
            value={format}
            onChange={(e) => setFormat(e.target.value as "pdf" | "xlsx" | "csv")}
          >
            <option value="pdf">PDF (print)</option>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV</option>
          </Select>
        </Field>
        <p className="text-[11px] text-[var(--text-dim)]">
          PDF opens a printable report in a new tab — choose “Save as PDF” in the print dialog.
        </p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={go} disabled={from > to}>
            Download
          </Button>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
