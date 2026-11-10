import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Download,
  FileCheck,
  FileText,
  Filter,
  FlipHorizontal,
  FolderArchive,
  Hash,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  Maximize2,
  Play,
  RotateCw,
  Scissors,
  Sparkles,
  Stamp,
  Trash2,
  Type,
  Workflow,
  XCircle,
} from "lucide-react";
import {
  compileImagesToPdf,
  downloadBlob,
  generateSequence,
  pdfToImages,
  processPipelineItem,
  renamed,
  splitPdf,
  stampImage,
  stampTime,
  zipNamed,
  type Corner,
  type FilterEffect,
  type LabelOptions,
  type NamedBlob,
  type StampStyle,
  type TransformOptions,
} from "@/lib/batch";

export const Route = createFileRoute("/")({ component: Home });

const TABS = [
  { id: "workflow", label: "Connected Studio Workflow", icon: Workflow, badge: "All-in-One" },
  { id: "label", label: "Label & Numbering", icon: Stamp },
  { id: "pdfimg", label: "PDF to Images", icon: ImagePlus },
  { id: "split", label: "Split PDFs", icon: Scissors },
  { id: "rename", label: "Batch Rename", icon: Type },
] as const;

type TabId = (typeof TABS)[number]["id"];

type QueueItem = {
  id: string;
  name: string;
  blob: Blob;
  previewUrl: string;
  customLabel: string;
};

type ProgressState = {
  running: boolean;
  done: number;
  total: number;
  title: string;
  currentItem?: string;
  startedAt: number;
  now: number;
  phase?: string;
};

function formatClock(ms: number) {
  const sec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function useProgressTracker() {
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    if (!progress?.running) return;
    const id = window.setInterval(() => {
      setProgress((cur) => (cur?.running ? { ...cur, now: Date.now() } : cur));
    }, 200);
    return () => window.clearInterval(id);
  }, [progress?.running]);

  return {
    progress,
    isCancelled: () => stopRef.current,
    start(total: number, title = "Processing") {
      stopRef.current = false;
      const now = Date.now();
      setProgress({
        running: true,
        done: 0,
        total,
        title,
        startedAt: now,
        now,
      });
    },
    tick(done: number, title?: string, currentItem?: string, phase?: string) {
      setProgress((cur) =>
        cur
          ? {
              ...cur,
              done,
              title: title ?? cur.title,
              currentItem: currentItem ?? cur.currentItem,
              phase: phase ?? cur.phase,
              now: Date.now(),
            }
          : cur,
      );
    },
    finish(title = "Finished", finalCount?: number) {
      setProgress((cur) =>
        cur
          ? {
              ...cur,
              running: false,
              done: finalCount ?? cur.total,
              title,
              now: Date.now(),
            }
          : cur,
      );
    },
    cancel() {
      stopRef.current = true;
      setProgress((cur) => (cur ? { ...cur, running: false, title: "Stopped by user" } : cur));
    },
    reset() {
      setProgress(null);
    },
  };
}

function ProgressBar({
  progress,
  onCancel,
}: {
  progress: ProgressState | null;
  onCancel?: () => void;
}) {
  if (!progress) return null;

  const pct =
    progress.total > 0
      ? Math.min(100, Math.max(0, Math.round((progress.done / progress.total) * 100)))
      : 0;
  const elapsed = progress.now - progress.startedAt;
  const rate = progress.done > 0 ? elapsed / progress.done : 0;
  const eta = progress.running && progress.done > 0 ? rate * (progress.total - progress.done) : 0;

  return (
    <div className="rounded-2xl border-2 border-primary/20 bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {progress.running && (
              <span className="inline-block h-3 w-3 animate-ping rounded-full bg-stamp" />
            )}
            <p className="font-semibold text-ink sm:text-base">
              {progress.title}
            </p>
          </div>
          {progress.currentItem && (
            <p className="truncate font-mono text-xs text-muted sm:text-sm">
              Current: {progress.currentItem}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-bold text-ink">{pct}%</span>
          {progress.running && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex min-h-9 items-center gap-1 rounded-full border border-danger/40 px-3 text-xs font-semibold text-danger hover:bg-danger/10"
            >
              <XCircle size={14} />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Primary progress track */}
      <div className="mt-3 h-3.5 w-full overflow-hidden rounded-full bg-bg shadow-inner">
        <div
          className="h-full rounded-full bg-gradient-to-r from-stamp to-amber-500 transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Progress stats */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-y-1 font-mono text-xs text-muted">
        <div className="flex items-center gap-3">
          <span>
            {progress.done} of {progress.total} items
          </span>
          {progress.phase && (
            <span className="rounded bg-bg px-2 py-0.5 text-ink">{progress.phase}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span>Elapsed: {formatClock(elapsed)}</span>
          {progress.running && progress.done > 0 && <span>ETA: ~{formatClock(eta)}</span>}
          {!progress.running && <span className="font-semibold text-primary">Ready</span>}
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description?: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm sm:p-7">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-ink sm:text-3xl">{title}</h2>
            {badge && (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-medium text-primary">
                {badge}
              </span>
            )}
          </div>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
      <div className="flex items-baseline justify-between gap-2">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

const inputClass =
  "min-h-11 rounded-xl border border-line bg-bg px-3.5 py-2 text-sm text-ink outline-none transition focus:border-primary focus:ring-1 focus:ring-primary";

function Home() {
  const [tab, setTab] = useState<TabId>("workflow");

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-stamp/20 px-3 py-0.5 font-mono text-xs font-bold tracking-wider text-stamp-ink uppercase">
              <Sparkles size={12} className="text-amber-700" />
              100% In-Browser Batch Engine
            </span>
          </div>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Stamp Batch
          </h1>
          <p className="mt-2.5 max-w-2xl text-base leading-relaxed text-muted">
            The all-in-one local pipeline desk: Convert PDFs to images, crop, rotate, resize,
            apply document scan filters, generate sequential labels (e.g. IMG-1, IMG-2), and
            export directly as ZIP or Combined PDF. No server uploads.
          </p>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="mb-8 flex gap-2.5 overflow-x-auto pb-2">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex min-h-12 shrink-0 items-center gap-2.5 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "border-primary bg-primary text-primary-fg shadow-sm"
                  : "border-line bg-surface text-ink hover:border-primary/50 hover:bg-bg"
              }`}
            >
              <Icon size={17} />
              <span>{item.label}</span>
              {item.badge && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    active ? "bg-stamp text-stamp-ink" : "bg-primary/10 text-primary"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {tab === "workflow" && <WorkflowStudioPanel />}
      {tab === "label" && <LabelPanel />}
      {tab === "pdfimg" && <PdfImagePanel />}
      {tab === "split" && <SplitPanel />}
      {tab === "rename" && <RenamePanel />}
    </main>
  );
}

/**
 * CONNECTED STUDIO WORKFLOW (PDF -> Images -> Crop/Size -> Effects -> Numbering/Labels -> Export)
 */
function WorkflowStudioPanel() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Workflow Step Wizard: 1: Import, 2: Crop & Size, 3: Effects, 4: Numbering, 5: Export
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step 2: Transform options
  const [scalePercent, setScalePercent] = useState(100);
  const [maxWidth, setMaxWidth] = useState<number | undefined>(undefined);
  const [rotate, setRotate] = useState<0 | 90 | 180 | 270>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [cropTop, setCropTop] = useState(0);
  const [cropRight, setCropRight] = useState(0);
  const [cropBottom, setCropBottom] = useState(0);
  const [cropLeft, setCropLeft] = useState(0);

  // Step 3: Effects
  const [effect, setEffect] = useState<FilterEffect>("none");
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [borderWidth, setBorderWidth] = useState(0);
  const [borderColor, setBorderColor] = useState("#1c1915");

  // Step 4: Stamping / Numbering
  const [stampEnabled, setStampEnabled] = useState(true);
  const [prefix, setPrefix] = useState("IMG-");
  const [startNum, setStartNum] = useState(1);
  const [padDigits, setPadDigits] = useState(1);
  const [suffix, setSuffix] = useState("");
  const [position, setPosition] = useState<Corner>("top-left");
  const [stampStyle, setStampStyle] = useState<StampStyle>("banner");
  const [bg, setBg] = useState("#e6b325");
  const [color, setColor] = useState("#1a1408");
  const [fontSize, setFontSize] = useState(26);
  const [padding, setPadding] = useState(12);
  const [margin, setMargin] = useState(16);
  const [opacity, setOpacity] = useState(1);
  const [fontFamily, setFontFamily] = useState<"serif" | "sans" | "mono">("serif");

  // Step 5: Export settings
  const [exportName, setExportName] = useState(`processed_batch_${stampTime()}`);
  const [pdfRenderDpi, setPdfRenderDpi] = useState(1.6);

  // Live preview & Progress
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const tracker = useProgressTracker();

  // Assemble transform options
  const transformOpts: TransformOptions = useMemo(
    () => ({
      scalePercent,
      maxWidth,
      rotate,
      flipH,
      flipV,
      crop: { top: cropTop, right: cropRight, bottom: cropBottom, left: cropLeft },
      effect,
      brightness,
      contrast,
      borderWidth,
      borderColor,
    }),
    [
      scalePercent,
      maxWidth,
      rotate,
      flipH,
      flipV,
      cropTop,
      cropRight,
      cropBottom,
      cropLeft,
      effect,
      brightness,
      contrast,
      borderWidth,
      borderColor,
    ],
  );

  // Assemble label options
  const labelOpts: LabelOptions = useMemo(() => {
    const currentItem = items[selectedIdx];
    const text = currentItem?.customLabel || `${prefix}${startNum}${suffix}`;
    return {
      text: stampEnabled ? text : "",
      position,
      bg,
      color,
      fontSize,
      padding,
      margin,
      opacity,
      style: stampStyle,
      fontFamily,
    };
  }, [
    items,
    selectedIdx,
    prefix,
    startNum,
    suffix,
    stampEnabled,
    position,
    bg,
    color,
    fontSize,
    padding,
    margin,
    opacity,
    stampStyle,
    fontFamily,
  ]);

  // Update live preview whenever settings or selected item change
  useEffect(() => {
    const currentItem = items[selectedIdx];
    if (!currentItem) {
      setPreviewBlobUrl("");
      return;
    }

    let isSubscribed = true;
    setPreviewLoading(true);

    const timer = setTimeout(async () => {
      try {
        const processed = await processPipelineItem(
          currentItem.blob,
          transformOpts,
          stampEnabled ? { ...labelOpts, text: currentItem.customLabel } : undefined,
        );
        if (isSubscribed) {
          const url = URL.createObjectURL(processed);
          setPreviewBlobUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        }
      } catch (err) {
        console.error("Preview render failed:", err);
      } finally {
        if (isSubscribed) setPreviewLoading(false);
      }
    }, 120);

    return () => {
      isSubscribed = false;
      clearTimeout(timer);
    };
  }, [items, selectedIdx, transformOpts, labelOpts, stampEnabled]);

  // Handle file uploads (Images or PDFs)
  async function handleAddFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    tracker.start(files.length, "Importing files");
    const newItems: QueueItem[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        if (tracker.isCancelled()) break;
        const file = files[i];

        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          tracker.tick(i, `Extracting pages from PDF`, file.name, "PDF Extraction");
          const pages = await pdfToImages(
            file,
            pdfRenderDpi,
            (p, total, name) => {
              tracker.tick(i, `Reading ${file.name}: page ${p}/${total}`, name);
            },
            () => tracker.isCancelled(),
          );

          pages.forEach((page, pIdx) => {
            const pageNum = items.length + newItems.length + 1;
            const seqLabel = `${prefix}${String(startNum + pageNum - 1).padStart(padDigits, "0")}${suffix}`;
            newItems.push({
              id: `${file.name}-p${pIdx + 1}-${Date.now()}-${Math.random()}`,
              name: page.name,
              blob: page.blob,
              previewUrl: URL.createObjectURL(page.blob),
              customLabel: seqLabel,
            });
          });
        } else {
          // Direct image
          tracker.tick(i, "Loading image", file.name, "Image Loading");
          const itemNum = items.length + newItems.length + 1;
          const seqLabel = `${prefix}${String(startNum + itemNum - 1).padStart(padDigits, "0")}${suffix}`;
          newItems.push({
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            name: file.name,
            blob: file,
            previewUrl: URL.createObjectURL(file),
            customLabel: seqLabel,
          });
        }
      }

      setItems((prev) => [...prev, ...newItems]);
      tracker.finish(`Imported ${newItems.length} image(s)`, files.length);
    } catch (err) {
      tracker.finish(err instanceof Error ? err.message : "Import failed");
    }
  }

  // Auto-apply numbering sequence to all items
  function applySequentialLabels() {
    const sequence = generateSequence(items.length, prefix, startNum, padDigits, suffix);
    setItems((prev) =>
      prev.map((item, idx) => ({
        ...item,
        customLabel: sequence[idx] || `${prefix}${idx + 1}`,
      })),
    );
  }

  // Update label for single item
  function updateItemLabel(idx: number, newLabel: string) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, customLabel: newLabel } : item)),
    );
  }

  // Remove single item
  function removeItem(idx: number) {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (selectedIdx >= next.length) {
        setSelectedIdx(Math.max(0, next.length - 1));
      }
      return next;
    });
  }

  // Clear all items
  function clearAllItems() {
    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setItems([]);
    setSelectedIdx(0);
    setPreviewBlobUrl("");
    tracker.reset();
  }

  // Execute Batch Export (ZIP or PDF)
  async function runExport(mode: "zip" | "pdf") {
    if (items.length === 0) return;

    tracker.start(items.length, `Processing & Exporting as ${mode.toUpperCase()}`);
    const results: NamedBlob[] = [];

    try {
      for (let i = 0; i < items.length; i++) {
        if (tracker.isCancelled()) {
          tracker.finish("Export cancelled by user", i);
          return;
        }

        const item = items[i];
        tracker.tick(i, `Processing item ${i + 1} of ${items.length}`, item.name, "Applying pipeline");

        const processedBlob = await processPipelineItem(
          item.blob,
          transformOpts,
          stampEnabled
            ? {
                ...labelOpts,
                text: item.customLabel,
              }
            : undefined,
        );

        const base = item.name.replace(/\.[^.]+$/, "");
        const ext = processedBlob.type === "image/png" ? "png" : "jpg";
        const finalName = `${base}_stamped.${ext}`;

        results.push({
          name: finalName,
          blob: processedBlob,
        });

        tracker.tick(i + 1, `Finished ${item.name}`);
      }

      if (mode === "zip") {
        tracker.tick(items.length, "Creating ZIP archive...", "", "Compressing");
        await zipNamed(results, `${exportName}.zip`, (pct, cur) => {
          tracker.tick(items.length, `Creating ZIP: ${pct}%`, cur, "Compressing");
        });
        tracker.finish(`Successfully exported ${results.length} files to ZIP!`);
      } else {
        tracker.tick(items.length, "Compiling multi-page PDF document...", "", "PDF Generation");
        const pdfBlob = await compileImagesToPdf(
          results,
          (done, total) => {
            tracker.tick(done, `Compiling PDF page ${done}/${total}`, "", "PDF Merging");
          },
          () => tracker.isCancelled(),
        );
        downloadBlob(pdfBlob, `${exportName}.pdf`);
        tracker.finish(`Successfully exported ${results.length} pages into PDF!`);
      }
    } catch (err) {
      tracker.finish(err instanceof Error ? err.message : "Export failed");
    }
  }

  return (
    <Panel
      title="Connected Studio Workflow"
      badge="Step-by-Step Pipeline"
      description="Start with documents or PDFs, extract images, crop & size, apply enhancements, assign custom or sequential labels (IMG-1, IMG-2), and export to ZIP or a merged PDF."
    >
      {/* Pipeline Step Navigator */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { num: 1, label: "1. Import Source", icon: Layers },
          { num: 2, label: "2. Crop & Resize", icon: Scissors },
          { num: 3, label: "3. Effects & Scan", icon: Filter },
          { num: 4, label: "4. Number & Label", icon: Hash },
          { num: 5, label: "5. Export & PDF", icon: Download },
        ].map((s) => {
          const Icon = s.icon;
          const isActive = activeStep === s.num;
          return (
            <button
              key={s.num}
              type="button"
              onClick={() => setActiveStep(s.num as 1 | 2 | 3 | 4 | 5)}
              className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-semibold transition sm:text-sm ${
                isActive
                  ? "border-primary bg-primary text-primary-fg shadow-sm"
                  : "border-line bg-bg text-ink hover:border-primary/40"
              }`}
            >
              <Icon size={16} />
              <span className="truncate">{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Column: Controls for Active Step */}
        <div className="space-y-6 lg:col-span-7">
          {/* STEP 1: Import Source */}
          {activeStep === 1 && (
            <div className="space-y-4 rounded-2xl border border-line bg-bg/50 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-ink">Source Documents & Images</h3>
                <span className="rounded-full bg-stamp/20 px-2.5 py-0.5 font-mono text-xs font-bold text-stamp-ink">
                  {items.length} in queue
                </span>
              </div>
              <p className="text-sm text-muted">
                Add PDFs (each page will be converted to high-res image) or existing images (PNG,
                JPG, WebP).
              </p>

              <Field label="Upload Files" hint="Accepts PDF, PNG, JPG, WebP">
                <input
                  type="file"
                  multiple
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  className={inputClass}
                  onChange={(e) => void handleAddFiles(e.target.files)}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={`PDF Extraction Quality: ${pdfRenderDpi.toFixed(1)}×`}>
                  <input
                    type="range"
                    min={1}
                    max={2.5}
                    step={0.1}
                    value={pdfRenderDpi}
                    onChange={(e) => setPdfRenderDpi(Number(e.target.value))}
                    className="accent-primary"
                  />
                </Field>
                <div className="flex items-end">
                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAllItems}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-danger/40 px-3 text-xs font-semibold text-danger hover:bg-danger/10"
                    >
                      <Trash2 size={15} />
                      Clear Queue
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Jump to Next Step */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={items.length === 0}
                  onClick={() => setActiveStep(2)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg disabled:opacity-40"
                >
                  Next: Crop & Resize
                  <Play size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Crop, Rotate & Resize */}
          {activeStep === 2 && (
            <div className="space-y-5 rounded-2xl border border-line bg-bg/50 p-4 sm:p-5">
              <h3 className="text-lg font-bold text-ink">Crop, Rotate & Dimensions</h3>

              {/* Scaling */}
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Scale: ${scalePercent}%`}>
                  <input
                    type="range"
                    min={25}
                    max={200}
                    step={5}
                    value={scalePercent}
                    onChange={(e) => setScalePercent(Number(e.target.value))}
                    className="accent-primary"
                  />
                </Field>
                <Field label="Max Width Constraint" hint="Optional max pixels">
                  <input
                    type="number"
                    placeholder="e.g. 1920 (no limit)"
                    value={maxWidth || ""}
                    onChange={(e) => setMaxWidth(e.target.value ? Number(e.target.value) : undefined)}
                    className={inputClass}
                  />
                </Field>
              </div>

              {/* Rotation & Flip */}
              <div>
                <span className="text-xs font-semibold text-ink uppercase tracking-wider">
                  Orientation & Flip
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[0, 90, 180, 270].map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => setRotate(deg as 0 | 90 | 180 | 270)}
                      className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold ${
                        rotate === deg
                          ? "border-primary bg-primary text-primary-fg"
                          : "border-line bg-surface text-ink"
                      }`}
                    >
                      <RotateCw size={14} />
                      {deg}°
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFlipH(!flipH)}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold ${
                      flipH
                        ? "border-primary bg-primary text-primary-fg"
                        : "border-line bg-surface text-ink"
                    }`}
                  >
                    <FlipHorizontal size={14} />
                    Flip H
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlipV(!flipV)}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold ${
                      flipV
                        ? "border-primary bg-primary text-primary-fg"
                        : "border-line bg-surface text-ink"
                    }`}
                  >
                    <FlipHorizontal size={14} className="rotate-90" />
                    Flip V
                  </button>
                </div>
              </div>

              {/* Crop Margins */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink uppercase tracking-wider">
                    Crop Margins (% trimmed from edges)
                  </span>
                  {(cropTop > 0 || cropRight > 0 || cropBottom > 0 || cropLeft > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCropTop(0);
                        setCropRight(0);
                        setCropBottom(0);
                        setCropLeft(0);
                      }}
                      className="text-xs font-medium text-danger hover:underline"
                    >
                      Reset Crop
                    </button>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label={`Top ${cropTop}%`}>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={cropTop}
                      onChange={(e) => setCropTop(Number(e.target.value))}
                      className="accent-primary"
                    />
                  </Field>
                  <Field label={`Right ${cropRight}%`}>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={cropRight}
                      onChange={(e) => setCropRight(Number(e.target.value))}
                      className="accent-primary"
                    />
                  </Field>
                  <Field label={`Bottom ${cropBottom}%`}>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={cropBottom}
                      onChange={(e) => setCropBottom(Number(e.target.value))}
                      className="accent-primary"
                    />
                  </Field>
                  <Field label={`Left ${cropLeft}%`}>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={cropLeft}
                      onChange={(e) => setCropLeft(Number(e.target.value))}
                      className="accent-primary"
                    />
                  </Field>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className="rounded-xl border border-line px-4 py-2 text-sm text-ink"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg"
                >
                  Next: Effects & Filters
                  <Play size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Effects & Scan Filters */}
          {activeStep === 3 && (
            <div className="space-y-5 rounded-2xl border border-line bg-bg/50 p-4 sm:p-5">
              <h3 className="text-lg font-bold text-ink">Image Enhancements & Scan Filters</h3>

              <div>
                <span className="text-xs font-semibold text-ink uppercase tracking-wider">
                  Preset Filters
                </span>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    { id: "none", label: "Normal" },
                    { id: "high-contrast", label: "Clean Scan B&W" },
                    { id: "grayscale", label: "Grayscale" },
                    { id: "sepia", label: "Sepia / Vintage" },
                    { id: "invert", label: "Invert (Dark)" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setEffect(f.id as FilterEffect)}
                      className={`min-h-11 rounded-xl border p-2 text-xs font-semibold transition ${
                        effect === f.id
                          ? "border-primary bg-primary text-primary-fg shadow-sm"
                          : "border-line bg-surface text-ink hover:border-primary/40"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Brightness & Contrast */}
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label={`Brightness (${brightness > 0 ? `+${brightness}` : brightness})`}
                  hint="-50 to +50"
                >
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="accent-primary"
                  />
                </Field>
                <Field
                  label={`Contrast (${contrast > 0 ? `+${contrast}` : contrast})`}
                  hint="-50 to +50"
                >
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="accent-primary"
                  />
                </Field>
              </div>

              {/* Border framing */}
              <div className="grid grid-cols-2 gap-4">
                <Field label={`Frame Border: ${borderWidth}px`}>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={borderWidth}
                    onChange={(e) => setBorderWidth(Number(e.target.value))}
                    className="accent-primary"
                  />
                </Field>
                <Field label="Border Color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={borderColor}
                      onChange={(e) => setBorderColor(e.target.value)}
                      className="h-11 w-14 rounded-lg border border-line bg-surface"
                    />
                    <input
                      type="text"
                      value={borderColor}
                      onChange={(e) => setBorderColor(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                </Field>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="rounded-xl border border-line px-4 py-2 text-sm text-ink"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep(4)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg"
                >
                  Next: Numbering & Labels
                  <Play size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Numbering & Labels (IMG-1, IMG-2, etc.) */}
          {activeStep === 4 && (
            <div className="space-y-5 rounded-2xl border border-line bg-bg/50 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-ink">Sequential Numbering & Labels</h3>
                  <p className="text-xs text-muted">
                    Apply sequential tags like IMG-1, IMG-2, or edit labels individually below.
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
                  <input
                    type="checkbox"
                    checked={stampEnabled}
                    onChange={(e) => setStampEnabled(e.target.checked)}
                    className="h-4 w-4 rounded accent-primary"
                  />
                  Enable Stamp
                </label>
              </div>

              {stampEnabled && (
                <>
                  {/* Auto-sequence Generator Card */}
                  <div className="rounded-xl border border-stamp/50 bg-stamp/10 p-4">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-stamp-ink uppercase tracking-wide">
                        <Hash size={14} />
                        Auto-Sequence Generator (e.g. IMG-1, IMG-2, IMG-3...)
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Field label="Prefix">
                        <input
                          type="text"
                          value={prefix}
                          onChange={(e) => setPrefix(e.target.value)}
                          placeholder="IMG-"
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Start Number">
                        <input
                          type="number"
                          value={startNum}
                          onChange={(e) => setStartNum(Number(e.target.value))}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Digits Pad" hint="1=1, 2=01, 3=001">
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={padDigits}
                          onChange={(e) => setPadDigits(Number(e.target.value))}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Suffix (optional)">
                        <input
                          type="text"
                          value={suffix}
                          onChange={(e) => setSuffix(e.target.value)}
                          placeholder="e.g. -FINAL"
                          className={inputClass}
                        />
                      </Field>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted">
                        Preview sequence:{" "}
                        <strong className="text-ink">
                          {prefix}
                          {String(startNum).padStart(padDigits, "0")}
                          {suffix}
                        </strong>
                        ,{" "}
                        <strong className="text-ink">
                          {prefix}
                          {String(startNum + 1).padStart(padDigits, "0")}
                          {suffix}
                        </strong>
                        ,{" "}
                        <strong className="text-ink">
                          {prefix}
                          {String(startNum + 2).padStart(padDigits, "0")}
                          {suffix}
                        </strong>
                        ...
                      </span>
                      <button
                        type="button"
                        onClick={applySequentialLabels}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-stamp px-3.5 text-xs font-bold text-stamp-ink hover:brightness-105"
                      >
                        <Sparkles size={13} />
                        Apply to All {items.length} Images
                      </button>
                    </div>
                  </div>

                  {/* Stamp Styling & Positioning */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Field label="Position">
                      <select
                        value={position}
                        onChange={(e) => setPosition(e.target.value as Corner)}
                        className={inputClass}
                      >
                        <option value="top-left">Top Left</option>
                        <option value="top-center">Top Center</option>
                        <option value="top-right">Top Right</option>
                        <option value="bottom-left">Bottom Left</option>
                        <option value="bottom-center">Bottom Center</option>
                        <option value="bottom-right">Bottom Right</option>
                        <option value="center">Center</option>
                      </select>
                    </Field>

                    <Field label="Style">
                      <select
                        value={stampStyle}
                        onChange={(e) => setStampStyle(e.target.value as StampStyle)}
                        className={inputClass}
                      >
                        <option value="banner">Solid Banner</option>
                        <option value="pill">Rounded Pill</option>
                        <option value="watermark">Watermark</option>
                        <option value="subtle">Subtle Shadow</option>
                      </select>
                    </Field>

                    <Field label="Font Family">
                      <select
                        value={fontFamily}
                        onChange={(e) => setFontFamily(e.target.value as "serif" | "sans" | "mono")}
                        className={inputClass}
                      >
                        <option value="serif">Serif (Classic)</option>
                        <option value="sans">Sans-serif (Modern)</option>
                        <option value="mono">Monospace (Code)</option>
                      </select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label="Banner Color">
                      <input
                        type="color"
                        value={bg}
                        onChange={(e) => setBg(e.target.value)}
                        className="h-11 w-full rounded-lg border border-line bg-surface"
                      />
                    </Field>
                    <Field label="Text Color">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="h-11 w-full rounded-lg border border-line bg-surface"
                      />
                    </Field>
                    <Field label={`Font Size: ${fontSize}`}>
                      <input
                        type="range"
                        min={14}
                        max={64}
                        value={fontSize}
                        onChange={(e) => setFontSize(Number(e.target.value))}
                        className="accent-primary"
                      />
                    </Field>
                    <Field label={`Opacity: ${Math.round(opacity * 100)}%`}>
                      <input
                        type="range"
                        min={0.2}
                        max={1}
                        step={0.05}
                        value={opacity}
                        onChange={(e) => setOpacity(Number(e.target.value))}
                        className="accent-primary"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label={`Padding: ${padding}px`}>
                      <input
                        type="range"
                        min={4}
                        max={36}
                        value={padding}
                        onChange={(e) => setPadding(Number(e.target.value))}
                        className="accent-primary"
                      />
                    </Field>
                    <Field label={`Margin: ${margin}px`}>
                      <input
                        type="range"
                        min={4}
                        max={60}
                        value={margin}
                        onChange={(e) => setMargin(Number(e.target.value))}
                        className="accent-primary"
                      />
                    </Field>
                  </div>
                </>
              )}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="rounded-xl border border-line px-4 py-2 text-sm text-ink"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep(5)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg"
                >
                  Next: Export & Output
                  <Play size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: Export & PDF Output */}
          {activeStep === 5 && (
            <div className="space-y-5 rounded-2xl border border-line bg-bg/50 p-4 sm:p-5">
              <h3 className="text-lg font-bold text-ink">Export Processed Batch</h3>
              <p className="text-sm text-muted">
                Choose how you want to download your finished images. All changes (crop, resize,
                filters, numbering) will be applied.
              </p>

              <Field label="Batch File Name" hint="Without extension">
                <input
                  type="text"
                  value={exportName}
                  onChange={(e) => setExportName(e.target.value)}
                  className={inputClass}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={tracker.progress?.running || items.length === 0}
                  onClick={() => void runExport("zip")}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-primary p-4 text-primary-fg shadow-sm transition hover:brightness-110 disabled:opacity-50"
                >
                  <div className="flex items-center gap-2 text-base font-bold">
                    <FolderArchive size={20} />
                    Download All as ZIP
                  </div>
                  <span className="text-xs opacity-80">
                    Exports individual PNG/JPG files packed in one archive
                  </span>
                </button>

                <button
                  type="button"
                  disabled={tracker.progress?.running || items.length === 0}
                  onClick={() => void runExport("pdf")}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-primary bg-surface p-4 text-primary shadow-sm transition hover:bg-bg disabled:opacity-50"
                >
                  <div className="flex items-center gap-2 text-base font-bold">
                    <FileText size={20} />
                    Download as Combined PDF
                  </div>
                  <span className="text-xs text-muted">
                    Merges all processed images into one multi-page PDF document
                  </span>
                </button>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveStep(4)}
                  className="rounded-xl border border-line px-4 py-2 text-sm text-ink"
                >
                  Back to Numbering
                </button>
              </div>
            </div>
          )}

          {/* Progress Bar (Always visible while working or when active) */}
          <ProgressBar progress={tracker.progress} onCancel={() => tracker.cancel()} />

          {/* Per-Image Individual Label & Preview Selector Card List */}
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-ink">
                  Queue Items & Per-Image Custom Labels ({items.length})
                </h4>
                <p className="text-xs text-muted">
                  Click an image to preview. Type directly in the input box to assign a unique label
                  to that specific image.
                </p>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-bg p-4 text-center">
                <ImageIcon size={24} className="text-muted" />
                <p className="mt-1 text-xs text-muted">No images loaded yet. Upload files above.</p>
              </div>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {items.map((item, idx) => {
                  const isSelected = selectedIdx === idx;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 rounded-xl border p-2 transition ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-line bg-bg hover:border-primary/40"
                      }`}
                    >
                      {/* Thumbnail with selection */}
                      <button
                        type="button"
                        onClick={() => setSelectedIdx(idx)}
                        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-line bg-surface"
                      >
                        <img
                          src={item.previewUrl}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute bottom-0 right-0 rounded-tl bg-ink/75 px-1 font-mono text-[9px] text-white">
                          #{idx + 1}
                        </span>
                      </button>

                      {/* File Name & Dimensions */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs font-semibold text-ink">
                          {item.name}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted">Label:</span>
                          <input
                            type="text"
                            value={item.customLabel}
                            onChange={(e) => updateItemLabel(idx, e.target.value)}
                            placeholder={`IMG-${idx + 1}`}
                            className="h-7 w-full rounded border border-line bg-surface px-2 font-mono text-xs text-ink outline-none focus:border-primary"
                          />
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedIdx(idx)}
                          title="Preview this item"
                          className={`rounded-lg p-1.5 text-xs font-medium ${
                            isSelected
                              ? "bg-primary text-primary-fg"
                              : "text-muted hover:bg-surface hover:text-ink"
                          }`}
                        >
                          <Maximize2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          title="Delete from batch"
                          className="rounded-lg p-1.5 text-xs font-medium text-danger hover:bg-danger/10"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Interactive Preview */}
        <div className="lg:col-span-5">
          <div className="sticky top-6 flex flex-col gap-3 rounded-2xl border border-line bg-bg p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-ink uppercase tracking-wider">
                <FileCheck size={14} className="text-primary" />
                Live Preview
                {items.length > 0 && ` (Page ${selectedIdx + 1} of ${items.length})`}
              </span>
              {previewLoading && (
                <span className="font-mono text-xs text-muted animate-pulse">Rendering...</span>
              )}
            </div>

            <div className="flex min-h-[22rem] max-h-[34rem] items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-surface p-2 shadow-inner">
              {previewBlobUrl ? (
                <img
                  src={previewBlobUrl}
                  alt="Transformed Preview"
                  className="max-h-[30rem] w-full object-contain"
                />
              ) : (
                <div className="p-6 text-center text-sm text-muted">
                  <ImageIcon size={36} className="mx-auto mb-2 text-line" />
                  <p className="font-medium text-ink">No image selected</p>
                  <p className="mt-1 text-xs text-muted">
                    Upload documents or images on the left to see live crop, filters, and stamped
                    labels in real-time.
                  </p>
                </div>
              )}
            </div>

            {items.length > 1 && (
              <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-3">
                <button
                  type="button"
                  disabled={selectedIdx <= 0}
                  onClick={() => setSelectedIdx((p) => Math.max(0, p - 1))}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-40"
                >
                  ← Prev Image
                </button>
                <span className="font-mono text-xs text-muted">
                  {selectedIdx + 1} / {items.length}
                </span>
                <button
                  type="button"
                  disabled={selectedIdx >= items.length - 1}
                  onClick={() => setSelectedIdx((p) => Math.min(items.length - 1, p + 1))}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-40"
                >
                  Next Image →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

/**
 * STANDALONE LABEL & NUMBERING PANEL
 */
function LabelPanel() {
  const [files, setFiles] = useState<File[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [defaultText, setDefaultText] = useState("A-042-027 HIDDEN HILLS HOTEL & RESORTS | C43");
  const [position, setPosition] = useState<Corner>("top-left");
  const [stampStyle, setStampStyle] = useState<StampStyle>("banner");
  const [bg, setBg] = useState("#e6b325");
  const [color, setColor] = useState("#1a1408");
  const [fontSize, setFontSize] = useState(28);
  const [padding, setPadding] = useState(12);
  const [margin, setMargin] = useState(16);
  const [opacity, setOpacity] = useState(1);
  const [fontFamily, setFontFamily] = useState<"serif" | "sans" | "mono">("serif");

  // Sequential pattern state
  const [prefix, setPrefix] = useState("IMG-");
  const [startNum, setStartNum] = useState(1);
  const [padDigits, setPadDigits] = useState(1);
  const [suffix, setSuffix] = useState("");

  const [busy, setBusy] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [preview, setPreview] = useState<string>("");
  const tracker = useProgressTracker();

  // Multi-line text area sync
  const multiLineText = useMemo(() => labels.join("\n"), [labels]);

  const opts: LabelOptions = useMemo(
    () => ({
      text: labels[previewIdx] || defaultText,
      position,
      bg,
      color,
      fontSize,
      padding,
      margin,
      opacity,
      style: stampStyle,
      fontFamily,
    }),
    [
      labels,
      previewIdx,
      defaultText,
      position,
      bg,
      color,
      fontSize,
      padding,
      margin,
      opacity,
      stampStyle,
      fontFamily,
    ],
  );

  async function refreshPreview(targetFiles: File[], idx = previewIdx) {
    const file = targetFiles[idx] || targetFiles[0];
    if (!file) {
      setPreview("");
      return;
    }
    const currentLabel = labels[idx] || defaultText;
    const blob = await stampImage(file, { ...opts, text: currentLabel });
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(blob);
    });
  }

  function handleFilesChange(newFiles: File[]) {
    setFiles(newFiles);
    // Initialize labels with sequence if empty
    const seq = generateSequence(newFiles.length, prefix, startNum, padDigits, suffix);
    setLabels(seq);
    setPreviewIdx(0);
    void refreshPreview(newFiles, 0);
  }

  function applySequence() {
    const seq = generateSequence(files.length, prefix, startNum, padDigits, suffix);
    setLabels(seq);
    void refreshPreview(files, previewIdx);
  }

  function handleMultiLineChange(raw: string) {
    const lines = raw.split("\n");
    setLabels(lines);
    void refreshPreview(files, previewIdx);
  }

  function updateSingleLabel(index: number, val: string) {
    const next = [...labels];
    while (next.length <= index) next.push("");
    next[index] = val;
    setLabels(next);
    if (index === previewIdx) {
      void refreshPreview(files, index);
    }
  }

  async function run() {
    if (!files.length) return;
    setBusy(true);
    tracker.start(files.length, "Stamping batch images");

    try {
      const items: NamedBlob[] = [];
      for (let i = 0; i < files.length; i++) {
        if (tracker.isCancelled()) {
          tracker.finish("Stamping cancelled", i);
          return;
        }

        const label = labels[i] !== undefined && labels[i].trim() ? labels[i] : defaultText;
        tracker.tick(i, `Stamping image ${i + 1} of ${files.length}`, files[i].name, label);

        const blob = await stampImage(files[i], { ...opts, text: label });
        const base = files[i].name.replace(/\.[^.]+$/, "");
        const ext = blob.type === "image/png" ? "png" : "jpg";
        items.push({ name: `labeled_${base}.${ext}`, blob });

        tracker.tick(i + 1, `Finished ${files[i].name}`);
      }

      tracker.tick(files.length, "Creating download package...", "", "Packing");
      if (items.length === 1) {
        downloadBlob(items[0].blob, items[0].name);
      } else {
        await zipNamed(items, `labeled_${stampTime()}.zip`);
      }
      tracker.finish(`Successfully stamped and downloaded ${items.length} images!`);
    } catch (err) {
      tracker.finish(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Label & Numbering Tool"
      description="Add corner badges or custom numbering sequences (IMG-1, IMG-2, IMG-3...) with individual text edits for each scan."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Field label="Upload Images">
            <input
              className={inputClass}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(e) => handleFilesChange([...(e.target.files ?? [])])}
            />
          </Field>

          {/* Sequential Generator Box */}
          <div className="rounded-xl border border-stamp/50 bg-stamp/10 p-3.5">
            <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-stamp-ink uppercase">
              <Hash size={14} />
              Sequential Numbering Generator (IMG-1, IMG-2...)
            </span>
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Field label="Prefix">
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Start">
                <input
                  type="number"
                  value={startNum}
                  onChange={(e) => setStartNum(Number(e.target.value))}
                  className={inputClass}
                />
              </Field>
              <Field label="Digits Pad">
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={padDigits}
                  onChange={(e) => setPadDigits(Number(e.target.value))}
                  className={inputClass}
                />
              </Field>
              <Field label="Suffix">
                <input
                  type="text"
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <button
              type="button"
              onClick={applySequence}
              className="mt-2.5 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-stamp px-3 text-xs font-bold text-stamp-ink hover:brightness-105"
            >
              <Sparkles size={12} />
              Apply Pattern to All Images
            </button>
          </div>

          {/* Per-Image Individual Card List */}
          {files.length > 0 && (
            <div className="rounded-xl border border-line bg-bg p-3">
              <span className="text-xs font-bold text-ink">
                Individual Labels per Image ({files.length} loaded)
              </span>
              <p className="text-[11px] text-muted">
                Edit label text directly for each individual image:
              </p>
              <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                {files.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className={`flex items-center gap-2 rounded-lg border p-1.5 text-xs ${
                      previewIdx === idx ? "border-primary bg-surface" : "border-line bg-surface/50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewIdx(idx);
                        void refreshPreview(files, idx);
                      }}
                      className="truncate font-mono font-semibold text-ink hover:underline"
                    >
                      #{idx + 1} {file.name}
                    </button>
                    <input
                      type="text"
                      value={labels[idx] || ""}
                      onChange={(e) => updateSingleLabel(idx, e.target.value)}
                      placeholder={defaultText}
                      className="h-7 flex-1 rounded border border-line bg-bg px-2 font-mono text-xs text-ink"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <Field label="Or Paste Multi-line Labels (one line per image)">
            <textarea
              className={`${inputClass} min-h-20 py-2 font-mono text-xs`}
              value={multiLineText}
              placeholder={"IMG-1\nIMG-2\nIMG-3"}
              onChange={(e) => handleMultiLineChange(e.target.value)}
            />
          </Field>

          <Field label="Default Fallback Label">
            <input
              type="text"
              value={defaultText}
              onChange={(e) => {
                setDefaultText(e.target.value);
                void refreshPreview(files);
              }}
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Corner Position">
              <select
                className={inputClass}
                value={position}
                onChange={(e) => setPosition(e.target.value as Corner)}
                onBlur={() => void refreshPreview(files)}
              >
                <option value="top-left">Top left</option>
                <option value="top-center">Top center</option>
                <option value="top-right">Top right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="bottom-center">Bottom center</option>
                <option value="bottom-right">Bottom right</option>
                <option value="center">Center</option>
              </select>
            </Field>

            <Field label="Badge Style">
              <select
                className={inputClass}
                value={stampStyle}
                onChange={(e) => setStampStyle(e.target.value as StampStyle)}
                onBlur={() => void refreshPreview(files)}
              >
                <option value="banner">Solid Banner</option>
                <option value="pill">Rounded Pill</option>
                <option value="watermark">Watermark</option>
                <option value="subtle">Subtle</option>
              </select>
            </Field>

            <Field label="Font Family">
              <select
                className={inputClass}
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value as "serif" | "sans" | "mono")}
                onBlur={() => void refreshPreview(files)}
              >
                <option value="serif">Serif (Classic)</option>
                <option value="sans">Sans-serif (Modern)</option>
                <option value="mono">Monospace (Code)</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Banner Color">
              <input
                className="h-11 w-full rounded-lg border border-line bg-bg"
                type="color"
                value={bg}
                onChange={(e) => setBg(e.target.value)}
                onBlur={() => void refreshPreview(files)}
              />
            </Field>
            <Field label="Text Color">
              <input
                className="h-11 w-full rounded-lg border border-line bg-bg"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                onBlur={() => void refreshPreview(files)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label={`Font Size: ${fontSize}`}>
              <input
                type="range"
                min={14}
                max={64}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                onMouseUp={() => void refreshPreview(files)}
              />
            </Field>
            <Field label={`Opacity: ${Math.round(opacity * 100)}%`}>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                onMouseUp={() => void refreshPreview(files)}
              />
            </Field>
            <Field label={`Padding: ${padding}px`}>
              <input
                type="range"
                min={4}
                max={36}
                value={padding}
                onChange={(e) => setPadding(Number(e.target.value))}
                onMouseUp={() => void refreshPreview(files)}
              />
            </Field>
            <Field label={`Margin: ${margin}px`}>
              <input
                type="range"
                min={4}
                max={60}
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
              {busy
                ? "Working…"
                : files.length > 1
                  ? "Download Labeled ZIP"
                  : "Download Labeled Image"}
            </button>
            {busy && (
              <button
                type="button"
                onClick={() => tracker.cancel()}
                className="inline-flex min-h-12 items-center rounded-full border border-line px-5 text-ink"
              >
                Stop
              </button>
            )}
          </div>

          {/* Dedicated Progress Bar */}
          <ProgressBar progress={tracker.progress} onCancel={() => tracker.cancel()} />
        </div>

        {/* Preview Container */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              Previewing image {files.length > 0 ? previewIdx + 1 : 0} of {files.length}
            </span>
          </div>
          <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-line bg-bg p-3">
            {preview ? (
              <img
                src={preview}
                alt="Labeled preview"
                className="max-h-[36rem] w-full object-contain"
              />
            ) : (
              <p className="max-w-xs text-center text-sm text-muted">
                Upload scans or images to preview the stamp label before downloading.
              </p>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

/**
 * STANDALONE PDF TO IMAGES PANEL
 */
function PdfImagePanel() {
  const [files, setFiles] = useState<File[]>([]);
  const [scale, setScale] = useState(1.6);
  const [busy, setBusy] = useState(false);
  const tracker = useProgressTracker();

  async function run() {
    if (!files.length) return;
    setBusy(true);
    tracker.start(files.length, "Converting PDF pages to images");

    try {
      const items: NamedBlob[] = [];
      for (let i = 0; i < files.length; i++) {
        if (tracker.isCancelled()) break;
        const file = files[i];
        tracker.tick(i, `Reading ${file.name}`, file.name, "Rendering pages");
        const rendered = await pdfToImages(
          file,
          scale,
          (p, total, name) => {
            tracker.tick(i, `Rendering page ${p} of ${total}`, name);
          },
          () => tracker.isCancelled(),
        );
        items.push(...rendered);
      }

      tracker.tick(files.length, "Creating ZIP archive...", "", "Packing");
      await zipNamed(items, `pdf_images_${stampTime()}.zip`);
      tracker.finish(`Downloaded ${items.length} page image(s) in ZIP!`);
    } catch (err) {
      tracker.finish(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Turn PDF Pages into Images"
      description="Extract every page of your PDF documents into crisp, lossless PNG images."
    >
      <div className="flex max-w-xl flex-col gap-4">
        <Field label="PDF Files">
          <input
            className={inputClass}
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
          />
        </Field>
        <Field label={`Sharpness / DPI Scale: ${scale.toFixed(1)}×`}>
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
          {busy ? "Extracting..." : "Download Images ZIP"}
        </button>

        {/* Progress bar */}
        <ProgressBar progress={tracker.progress} onCancel={() => tracker.cancel()} />
      </div>
    </Panel>
  );
}

/**
 * STANDALONE SPLIT PDF PANEL
 */
function SplitPanel() {
  const [files, setFiles] = useState<File[]>([]);
  const [ranges, setRanges] = useState("1");
  const [busy, setBusy] = useState(false);
  const tracker = useProgressTracker();

  async function run() {
    if (!files.length) return;
    setBusy(true);
    tracker.start(files.length, "Splitting PDF files");

    try {
      const items: NamedBlob[] = [];
      for (let i = 0; i < files.length; i++) {
        if (tracker.isCancelled()) break;
        const file = files[i];
        tracker.tick(i, `Splitting ${file.name}`, file.name);
        const splitPages = await splitPdf(
          file,
          ranges,
          (cur, total) => {
            tracker.tick(i, `Extracting page ${cur} of ${total}`, file.name);
          },
          () => tracker.isCancelled(),
        );
        items.push(...splitPages);
      }

      tracker.tick(files.length, "Creating ZIP archive...", "", "Packing");
      await zipNamed(items, `split_pdfs_${stampTime()}.zip`);
      tracker.finish(`Downloaded ${items.length} page PDF(s) in ZIP!`);
    } catch (err) {
      tracker.finish(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Split PDFs into Single Pages"
      description="Extract specific pages or page ranges (e.g. 1-3, 5, 8) as standalone PDF documents."
    >
      <div className="flex max-w-xl flex-col gap-4">
        <Field label="PDF Files">
          <input
            className={inputClass}
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
          />
        </Field>
        <Field label="Pages to Keep" hint="e.g. 1-3, 5, 8">
          <input
            className={inputClass}
            value={ranges}
            onChange={(e) => setRanges(e.target.value)}
          />
        </Field>
        <button
          type="button"
          disabled={busy || !files.length}
          onClick={() => void run()}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 text-primary-fg disabled:opacity-50"
        >
          <Download size={16} />
          {busy ? "Splitting..." : "Download Split ZIP"}
        </button>

        {/* Progress bar */}
        <ProgressBar progress={tracker.progress} onCancel={() => tracker.cancel()} />
      </div>
    </Panel>
  );
}

/**
 * STANDALONE BATCH RENAME PANEL
 */
function RenamePanel() {
  const [files, setFiles] = useState<File[]>([]);
  const [prefix, setPrefix] = useState("A-042-");
  const [start, setStart] = useState(1);
  const [pad, setPad] = useState(3);
  const [busy, setBusy] = useState(false);
  const tracker = useProgressTracker();

  const preview = renamed(files, prefix, start, pad);

  async function run() {
    if (!files.length) return;
    setBusy(true);
    tracker.start(files.length, "Renaming and packing files");
    try {
      await zipNamed(preview, `renamed_${stampTime()}.zip`, (pct, cur) => {
        tracker.tick(files.length, `Zipping renamed files: ${pct}%`, cur);
      });
      tracker.finish(`Successfully renamed and downloaded ${files.length} files!`);
    } catch (err) {
      tracker.finish(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Batch Rename Files"
      description="Sequentially rename a batch of documents or photos with prefix, starting index, and zero padding."
    >
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
            <input
              className={inputClass}
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Number">
              <input
                className={inputClass}
                type="number"
                min={0}
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
              />
            </Field>
            <Field label="Digits Pad">
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
            {busy ? "Packing..." : "Download Renamed ZIP"}
          </button>

          <ProgressBar progress={tracker.progress} onCancel={() => tracker.cancel()} />
        </div>

        <ul className="max-h-80 overflow-auto rounded-xl border border-line bg-bg p-3 font-mono text-xs leading-6 text-ink">
          {preview.length === 0 && <li className="text-muted">Names appear here once files are uploaded.</li>}
          {preview.map((item, i) => (
            <li key={`${item.name}-${i}`}>
              {files[i]?.name} → <strong className="text-primary">{item.name}</strong>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
