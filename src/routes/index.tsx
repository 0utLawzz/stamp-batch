import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, ImagePlus, Scissors, Stamp, Type } from "lucide-react";
import {
  downloadBlob,
  pdfToImages,
  renamed,
  splitPdf,
  stampImage,
  stampTime,
  zipNamed,
  type Corner,
  type NamedBlob,
} from "@/lib/batch";

export const Route = createFileRoute("/")({ component: Home });

const TABS = [
  { id: "label", label: "Label images", icon: Stamp },
  { id: "pdfimg", label: "PDF to images", icon: ImagePlus },
  { id: "split", label: "Split PDFs", icon: Scissors },
  { id: "rename", label: "Rename", icon: Type },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Home() {
  const [tab, setTab] = useState<TabId>("label");
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">
            Personal batch desk
          </p>
          <h1 className="mt-1 text-4xl leading-none text-ink">Stamp Batch</h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted">
            Stamp a yellow tag on many scans, turn PDFs into images, split pages,
            and rename the pile. Everything stays in this browser. Download one
            zip when you are done, then drop it into Google Drive yourself.
          </p>
        </div>
      </header>

      <nav className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm ${
                active
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-line bg-surface text-ink"
              }`}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {tab === "label" && <LabelPanel />}
      {tab === "pdfimg" && <PdfImagePanel />}
      {tab === "split" && <SplitPanel />}
      {tab === "rename" && <RenamePanel />}
    </main>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">
      <h2 className="mb-4 text-2xl text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-muted">
      {label}
      {children}
    </label>
  );
}

const inputClass =
  "min-h-11 rounded-lg border border-line bg-bg px-3 text-base text-ink outline-none focus:border-primary";

type JobState = {
  running: boolean;
  done: number;
  total: number;
  label: string;
  startedAt: number;
  now: number;
};

function formatClock(ms: number) {
  const sec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function useJob() {
  const [job, setJob] = useState<JobState | null>(null);
  const stop = useRef(false);

  useEffect(() => {
    if (!job?.running) return;
    const id = window.setInterval(() => {
      setJob((current) => (current?.running ? { ...current, now: Date.now() } : current));
    }, 250);
    return () => window.clearInterval(id);
  }, [job?.running]);

  return {
    job,
    stopped: () => stop.current,
    start(total: number) {
      stop.current = false;
      const now = Date.now();
      setJob({ running: true, done: 0, total, label: "Starting", startedAt: now, now });
    },
    tick(done: number, label: string) {
      setJob((current) =>
        current ? { ...current, done, label, now: Date.now() } : current,
      );
    },
    end(label: string, done?: number) {
      setJob((current) =>
        current
          ? {
              ...current,
              running: false,
              done: done ?? current.total,
              label,
              now: Date.now(),
            }
          : current,
      );
    },
    cancel() {
      stop.current = true;
    },
  };
}

function JobMeter({ job }: { job: JobState | null }) {
  if (!job) return null;
  const pct = job.total ? Math.min(100, Math.round((job.done / job.total) * 100)) : 0;
  const elapsed = job.now - job.startedAt;
  const rate = job.done > 0 ? elapsed / job.done : 0;
  const left = job.running && job.done > 0 ? rate * (job.total - job.done) : 0;
  return (
    <div className="rounded-xl border border-line bg-bg p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm text-ink">
        <span className="truncate">{job.label}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-stamp" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted">
        <span>
          {job.done} / {job.total}
        </span>
        <span>Elapsed {formatClock(elapsed)}</span>
        <span>{job.running ? `Left about ${formatClock(left)}` : "Finished"}</span>
      </div>
    </div>
  );
}

function LabelPanel() {
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("A-042-027 HIDDEN HILLS HOTEL & RESORTS | C43");
  const [position, setPosition] = useState<Corner>("top-left");
  const [bg, setBg] = useState("#e6b325");
  const [color, setColor] = useState("#1a1408");
  const [fontSize, setFontSize] = useState(28);
  const [padding, setPadding] = useState(12);
  const [margin, setMargin] = useState(16);
  const [perFile, setPerFile] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<string>("");
  const work = useJob();

  const opts = useMemo(
    () => ({ text, position, bg, color, fontSize, padding, margin }),
    [text, position, bg, color, fontSize, padding, margin],
  );

  async function refreshPreview(next: File[]) {
    const first = next[0];
    if (!first) {
      setPreview("");
      return;
    }
    const blob = await stampImage(first, opts);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(blob);
    });
  }

  async function run() {
    if (!files.length || !text.trim()) return;
    setBusy(true);
    work.start(files.length);
    try {
      const lines = perFile.split("\n").map((line) => line.trim()).filter(Boolean);
      const items: NamedBlob[] = [];
      for (let i = 0; i < files.length; i++) {
        if (work.stopped()) {
          work.end("Stopped", i);
          setStatus(`Stopped after ${i} image(s).`);
          return;
        }
        const label = lines[i] || text;
        work.tick(i, files[i].name);
        const blob = await stampImage(files[i], { ...opts, text: label });
        const base = files[i].name.replace(/\.[^.]+$/, "");
        const ext = blob.type === "image/png" ? "png" : "jpg";
        items.push({ name: `labeled_${base}.${ext}`, blob });
        work.tick(i + 1, files[i].name);
      }
      work.tick(files.length, "Packing zip");
      if (items.length === 1) downloadBlob(items[0].blob, items[0].name);
      else await zipNamed(items, `labeled_${stampTime()}.zip`);
      work.end(`Downloaded ${items.length}`);
      setStatus(`Downloaded ${items.length} labeled image${items.length === 1 ? "" : "s"}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      work.end(message);
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Add a corner label">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Field label="Images">
            <input
              className={inputClass}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(e) => {
                const next = [...(e.target.files ?? [])];
                setFiles(next);
                void refreshPreview(next);
              }}
            />
          </Field>
          <Field label="Label text">
            <textarea
              className={`${inputClass} min-h-24 py-2`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => void refreshPreview(files)}
            />
          </Field>
          <Field label="Different label per image, one line each (optional)">
            <textarea
              className={`${inputClass} min-h-20 py-2 font-mono text-sm`}
              value={perFile}
              placeholder={"A-042-027 HOTEL | C43\nA-042-028 HOTEL | C44"}
              onChange={(e) => setPerFile(e.target.value)}
            />
          </Field>
            <select
              className={inputClass}
              value={position}
              onChange={(e) => {
                setPosition(e.target.value as Corner);
              }}
              onBlur={() => void refreshPreview(files)}
            >
              <option value="top-left">Top left</option>
              <option value="top-center">Top center</option>
              <option value="top-right">Top right</option>
              <option value="bottom-left">Bottom left</option>
              <option value="bottom-center">Bottom center</option>
              <option value="bottom-right">Bottom right</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Banner">
              <input
                className="h-11 w-full rounded-lg border border-line bg-bg"
                type="color"
                value={bg}
                onChange={(e) => setBg(e.target.value)}
                onBlur={() => void refreshPreview(files)}
              />
            </Field>
            <Field label="Text">
              <input
                className="h-11 w-full rounded-lg border border-line bg-bg"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                onBlur={() => void refreshPreview(files)}
              />
            </Field>
          </div>
          <Field label={`Size ${fontSize}`}>
            <input
              type="range"
              min={14}
              max={64}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              onMouseUp={() => void refreshPreview(files)}
              onTouchEnd={() => void refreshPreview(files)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Padding ${padding}`}>
              <input
                type="range"
                min={4}
                max={40}
                value={padding}
                onChange={(e) => setPadding(Number(e.target.value))}
                onMouseUp={() => void refreshPreview(files)}
              />
            </Field>
            <Field label={`Margin ${margin}`}>
              <input
                type="range"
                min={0}
                max={80}
                value={margin}
                onChange={(e) => setMargin(Number(e.target.value))}
                onMouseUp={() => void refreshPreview(files)}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !files.length}
              onClick={() => void run()}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 text-primary-fg disabled:opacity-50"
            >
              <Download size={16} />
              {busy ? "Working…" : files.length > 1 ? "Download labeled zip" : "Download labeled image"}
            </button>
            {busy && (
              <button
                type="button"
                onClick={() => work.cancel()}
                className="inline-flex min-h-12 items-center rounded-full border border-line px-5 text-ink"
              >
                Stop
              </button>
            )}
          </div>
          <JobMeter job={work.job} />
          <p className="text-sm text-muted">{status || `${files.length} image(s) ready.`}</p>
        </div>
        <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-line bg-bg p-3">
          {preview ? (
            <img src={preview} alt="Labeled preview" className="max-h-[36rem] w-full object-contain" />
          ) : (
            <p className="max-w-xs text-center text-sm text-muted">
              Upload a scan to preview the yellow tag before you download the batch.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}

function PdfImagePanel() {
  const [files, setFiles] = useState<File[]>([]);
  const [scale, setScale] = useState(1.6);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function run() {
    if (!files.length) return;
    setBusy(true);
    try {
      const items: NamedBlob[] = [];
      for (const file of files) {
        setStatus(`Reading ${file.name}`);
        items.push(...(await pdfToImages(file, scale)));
      }
      await zipNamed(items, `pdf_images_${stampTime()}.zip`);
      setStatus(`Downloaded ${items.length} page image(s).`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Turn PDF pages into images">
      <div className="flex max-w-xl flex-col gap-4">
        <Field label="PDF files">
          <input
            className={inputClass}
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
          />
        </Field>
        <Field label={`Sharpness ${scale.toFixed(1)}×`}>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          />
        </Field>
        <button
          type="button"
          disabled={busy || !files.length}
          onClick={() => void run()}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 text-primary-fg disabled:opacity-50"
        >
          <Download size={16} />
          Download images zip
        </button>
        <p className="text-sm text-muted">
          {status || `${files.length} PDF(s). Each page becomes a PNG inside one zip.`}
        </p>
      </div>
    </Panel>
  );
}

function SplitPanel() {
  const [files, setFiles] = useState<File[]>([]);
  const [ranges, setRanges] = useState("1");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function run() {
    if (!files.length) return;
    setBusy(true);
    try {
      const items: NamedBlob[] = [];
      for (const file of files) {
        setStatus(`Splitting ${file.name}`);
        items.push(...(await splitPdf(file, ranges)));
      }
      await zipNamed(items, `split_pdfs_${stampTime()}.zip`);
      setStatus(`Downloaded ${items.length} page PDF(s).`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Split PDFs into single pages">
      <div className="flex max-w-xl flex-col gap-4">
        <Field label="PDF files">
          <input
            className={inputClass}
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
          />
        </Field>
        <Field label="Pages to keep (example 1-3,5,8)">
          <input className={inputClass} value={ranges} onChange={(e) => setRanges(e.target.value)} />
        </Field>
        <button
          type="button"
          disabled={busy || !files.length}
          onClick={() => void run()}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 text-primary-fg disabled:opacity-50"
        >
          <Download size={16} />
          Download split zip
        </button>
        <p className="text-sm text-muted">{status || "Each listed page is saved as its own PDF."}</p>
      </div>
    </Panel>
  );
}

function RenamePanel() {
  const [files, setFiles] = useState<File[]>([]);
  const [prefix, setPrefix] = useState("A-042-");
  const [start, setStart] = useState(1);
  const [pad, setPad] = useState(3);
  const [busy, setBusy] = useState(false);

  const preview = renamed(files, prefix, start, pad);

  async function run() {
    if (!files.length) return;
    setBusy(true);
    await zipNamed(preview, `renamed_${stampTime()}.zip`);
    setBusy(false);
  }

  return (
    <Panel title="Rename a pile and zip it">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Field label="Files">
            <input
              className={inputClass}
              type="file"
              multiple
              onChange={(e) => setFiles([...(e.target.files ?? [])])}
            />
          </Field>
          <Field label="Prefix">
            <input className={inputClass} value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start number">
              <input
                className={inputClass}
                type="number"
                min={0}
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
              />
            </Field>
            <Field label="Digits">
              <input
                className={inputClass}
                type="number"
                min={1}
                max={6}
                value={pad}
                onChange={(e) => setPad(Number(e.target.value))}
              />
            </Field>
          </div>
          <button
            type="button"
            disabled={busy || !files.length}
            onClick={() => void run()}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 text-primary-fg disabled:opacity-50"
          >
            <Download size={16} />
            Download renamed zip
          </button>
        </div>
        <ul className="max-h-80 overflow-auto rounded-xl border border-line bg-bg p-3 font-mono text-xs leading-6 text-ink">
          {preview.length === 0 && <li className="text-muted">Names appear here.</li>}
          {preview.map((item, i) => (
            <li key={`${item.name}-${i}`}>
              {files[i]?.name} → {item.name}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
