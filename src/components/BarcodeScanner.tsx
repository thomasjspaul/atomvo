import { useEffect, useRef, useState, type FormEvent } from "react";

type DetectedBarcode = { rawValue: string; format: string };
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: { new (opts?: { formats?: string[] }): BarcodeDetectorLike };
  }
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
const isBarcode = (s: string) => /^\d{8,14}$/.test(s);

/**
 * Full-screen camera overlay that reads a product barcode via the platform
 * `BarcodeDetector` (Android Chrome). Falls back to a manual digit entry when
 * the API or a camera isn't available.
 */
export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [canTorch, setCanTorch] = useState(false);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
      setError("This browser can’t scan — type the barcode below.");
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
      } catch (e) {
        setError(
          (e as DOMException)?.name === "NotAllowedError"
            ? "Camera permission denied — allow it in your browser settings, or type the barcode."
            : "No camera available — type the barcode below.",
        );
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.muted = true;
      await video.play().catch(() => {});

      const track = stream.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
      setCanTorch(!!caps.torch);

      let detector: BarcodeDetectorLike;
      try {
        detector = new window.BarcodeDetector!({ formats: FORMATS });
      } catch {
        setError("Scanning isn’t supported here — type the barcode below.");
        stopStream();
        return;
      }

      timer = window.setInterval(async () => {
        if (cancelled || video.readyState < 2) return;
        try {
          const hits = await detector.detect(video);
          const code = hits.map((h) => h.rawValue).find(isBarcode);
          if (code) {
            cancelled = true;
            window.clearInterval(timer);
            stopStream();
            (navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate?.(60);
            onDetected(code);
          }
        } catch {
          /* transient decode frame error — keep polling */
        }
      }, 250);
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setCanTorch(false);
    }
  }

  function submitManual(e: FormEvent) {
    e.preventDefault();
    const code = manual.trim();
    if (!isBarcode(code)) return;
    stopStream();
    onDetected(code);
  }

  function close() {
    stopStream();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />
      {!error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-40 w-72 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
      )}

      <div className="relative z-10 flex items-center justify-between p-4 text-white pt-safe">
        <button onClick={close} className="text-sm">
          Cancel
        </button>
        {canTorch && (
          <button
            onClick={toggleTorch}
            className="rounded-full bg-white/15 px-3 py-1.5 text-xs"
          >
            {torchOn ? "Torch off" : "Torch on"}
          </button>
        )}
      </div>

      <div className="relative z-10 mt-auto space-y-3 p-4 pb-safe text-white">
        <p className="text-center text-sm text-white/85">
          {error ?? "Point the camera at a barcode"}
        </p>
        <form onSubmit={submitManual} className="flex gap-2">
          <input
            inputMode="numeric"
            placeholder="Enter barcode digits"
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
            className="min-w-0 flex-1 rounded-xl border border-white/25 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-white/50 outline-none"
          />
          <button
            type="submit"
            disabled={!isBarcode(manual.trim())}
            className="rounded-xl bg-[var(--pro)] px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
          >
            Go
          </button>
        </form>
      </div>
    </div>
  );
}
