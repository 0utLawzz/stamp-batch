import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import JSZip from "jszip";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type Corner =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "center";

export type StampStyle = "banner" | "pill" | "watermark" | "subtle";

export type LabelOptions = {
  text: string;
  position: Corner;
  bg: string;
  color: string;
  fontSize: number;
  padding: number;
  margin: number;
  opacity?: number;
  style?: StampStyle;
  fontFamily?: "serif" | "sans" | "mono";
};

export type FilterEffect =
  | "none"
  | "grayscale"
  | "high-contrast"
  | "sepia"
  | "invert";

export type CropMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type TransformOptions = {
  scalePercent: number; // 25 - 200
  maxWidth?: number;
  maxHeight?: number;
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  crop: CropMargins; // percentage 0 - 45%
  effect: FilterEffect;
  brightness: number; // -50 to 50
  contrast: number; // -50 to 50
  borderWidth?: number; // 0 - 20
  borderColor?: string;
};

export type NamedBlob = { name: string; blob: Blob };

export function generateSequence(
  count: number,
  prefix = "IMG-",
  start = 1,
  pad = 1,
  suffix = "",
): string[] {
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const num = String(start + i).padStart(pad, "0");
    result.push(`${prefix}${num}${suffix}`);
  }
  return result;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function drawBanner(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: LabelOptions,
) {
  const text = opts.text.trim();
  if (!text) return;

  const scale = Math.max(width, height) / 1400;
  const fontSize = Math.max(14, Math.round(opts.fontSize * scale));
  const padding = Math.round(opts.padding * scale);
  const margin = Math.round(opts.margin * scale);
  const style = opts.style || "banner";
  const opacity = opts.opacity !== undefined ? Math.max(0.1, Math.min(1, opts.opacity)) : 1;

  ctx.save();
  ctx.globalAlpha = opacity;

  let fontFam = 'Georgia, "Palatino Linotype", serif';
  if (opts.fontFamily === "sans") {
    fontFam = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  } else if (opts.fontFamily === "mono") {
    fontFam = '"IBM Plex Mono", Menlo, Consolas, monospace';
  }
  ctx.font = `700 ${fontSize}px ${fontFam}`;

  const metrics = ctx.measureText(text);
  const boxW = metrics.width + padding * 2;
  const boxH = fontSize + padding * 2;

  let x = margin;
  let y = margin;

  if (opts.position === "center") {
    x = (width - boxW) / 2;
    y = (height - boxH) / 2;
  } else {
    if (opts.position.includes("right")) x = width - boxW - margin;
    if (opts.position.includes("center")) x = (width - boxW) / 2;
    if (opts.position.startsWith("bottom")) y = height - boxH - margin;
  }

  // Draw background according to style
  if (style === "watermark") {
    // Watermark style: semi-transparent rotated text across center or position
    ctx.fillStyle = opts.bg;
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 8;
    roundRect(ctx, x, y, boxW, boxH, fontSize * 0.3);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (style === "pill") {
    ctx.fillStyle = opts.bg;
    roundRect(ctx, x, y, boxW, boxH, boxH / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = Math.max(1, Math.round(scale));
    ctx.stroke();
  } else if (style === "subtle") {
    // Just text with subtle shadow
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
  } else {
    // Solid banner (standard)
    ctx.fillStyle = opts.bg;
    roundRect(ctx, x, y, boxW, boxH, Math.max(6, fontSize * 0.2));
    ctx.fill();
  }

  ctx.fillStyle = opts.color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padding, y + boxH / 2 + 1);
  ctx.restore();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality = 0.92): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))),
      type,
      quality,
    );
  });
}

export async function stampImage(
  fileOrBlob: File | Blob,
  opts: LabelOptions,
): Promise<Blob> {
  const url = URL.createObjectURL(fileOrBlob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(img, 0, 0);
    drawBanner(ctx, canvas.width, canvas.height, opts);
    const type = fileOrBlob.type === "image/png" ? "image/png" : "image/jpeg";
    return await canvasToBlob(canvas, type);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Full Pipeline: Crop, Resize, Rotate, Filters, and Label
 */
export async function processPipelineItem(
  source: File | Blob,
  transform: TransformOptions,
  labelOpts?: LabelOptions,
): Promise<Blob> {
  const url = URL.createObjectURL(source);
  try {
    const img = await loadImage(url);
    const origW = img.naturalWidth;
    const origH = img.naturalHeight;

    // 1. Calculate Crop
    const cropL = Math.round((origW * (transform.crop.left || 0)) / 100);
    const cropR = Math.round((origW * (transform.crop.right || 0)) / 100);
    const cropT = Math.round((origH * (transform.crop.top || 0)) / 100);
    const cropB = Math.round((origH * (transform.crop.bottom || 0)) / 100);

    const croppedW = Math.max(10, origW - cropL - cropR);
    const croppedH = Math.max(10, origH - cropT - cropB);

    // 2. Calculate Scaling
    const scale = Math.max(0.1, (transform.scalePercent || 100) / 100);
    let targetW = Math.round(croppedW * scale);
    let targetH = Math.round(croppedH * scale);

    if (transform.maxWidth && targetW > transform.maxWidth) {
      const ratio = transform.maxWidth / targetW;
      targetW = transform.maxWidth;
      targetH = Math.round(targetH * ratio);
    }
    if (transform.maxHeight && targetH > transform.maxHeight) {
      const ratio = transform.maxHeight / targetH;
      targetH = transform.maxHeight;
      targetW = Math.round(targetW * ratio);
    }

    // 3. Handle Rotation
    const isSideways = transform.rotate === 90 || transform.rotate === 270;
    const canvasW = isSideways ? targetH : targetW;
    const canvasH = isSideways ? targetW : targetH;

    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas context unavailable");

    ctx.save();
    // Move to center for rotation/flip
    ctx.translate(canvasW / 2, canvasH / 2);
    if (transform.rotate) {
      ctx.rotate((transform.rotate * Math.PI) / 180);
    }
    if (transform.flipH || transform.flipV) {
      ctx.scale(transform.flipH ? -1 : 1, transform.flipV ? -1 : 1);
    }

    // Draw the cropped & scaled portion
    ctx.drawImage(
      img,
      cropL,
      cropT,
      croppedW,
      croppedH,
      -targetW / 2,
      -targetH / 2,
      targetW,
      targetH,
    );
    ctx.restore();

    // 4. Apply Pixel Effects (Grayscale, High-Contrast, Sepia, Invert, Brightness/Contrast)
    applyCanvasFilters(ctx, canvasW, canvasH, transform);

    // 5. Border
    if (transform.borderWidth && transform.borderWidth > 0) {
      ctx.strokeStyle = transform.borderColor || "#1c1915";
      ctx.lineWidth = transform.borderWidth;
      ctx.strokeRect(
        transform.borderWidth / 2,
        transform.borderWidth / 2,
        canvasW - transform.borderWidth,
        canvasH - transform.borderWidth,
      );
    }

    // 6. Draw Label / Stamp
    if (labelOpts && labelOpts.text.trim()) {
      drawBanner(ctx, canvasW, canvasH, labelOpts);
    }

    const type = source.type === "image/png" ? "image/png" : "image/jpeg";
    return await canvasToBlob(canvas, type);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function applyCanvasFilters(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  transform: TransformOptions,
) {
  const hasEffect =
    transform.effect !== "none" ||
    transform.brightness !== 0 ||
    transform.contrast !== 0;

  if (!hasEffect) return;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Brightness factor: -50 to 50 maps to -128 to 128
  const bFactor = (transform.brightness / 50) * 128;
  // Contrast factor: -50 to 50 maps to 0.2 to 2.5
  const cFactor =
    transform.contrast >= 0
      ? 1 + (transform.contrast / 50) * 1.5
      : 1 + (transform.contrast / 50) * 0.8;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Brightness & Contrast
    if (bFactor !== 0) {
      r += bFactor;
      g += bFactor;
      b += bFactor;
    }
    if (cFactor !== 1) {
      r = (r - 128) * cFactor + 128;
      g = (g - 128) * cFactor + 128;
      b = (b - 128) * cFactor + 128;
    }

    // Specific filters
    if (transform.effect === "grayscale") {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray;
      g = gray;
      b = gray;
    } else if (transform.effect === "high-contrast") {
      // Document scan binarization with smooth thresholding
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const threshold = 145;
      const val = gray > threshold ? 255 : gray < threshold - 30 ? 0 : (gray - (threshold - 30)) * 8.5;
      r = val;
      g = val;
      b = val;
    } else if (transform.effect === "sepia") {
      const sr = r * 0.393 + g * 0.769 + b * 0.189;
      const sg = r * 0.349 + g * 0.686 + b * 0.168;
      const sb = r * 0.272 + g * 0.534 + b * 0.131;
      r = sr;
      g = sg;
      b = sb;
    } else if (transform.effect === "invert") {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }

    data[i] = Math.min(255, Math.max(0, r));
    data[i + 1] = Math.min(255, Math.max(0, g));
    data[i + 2] = Math.min(255, Math.max(0, b));
  }

  ctx.putImageData(imgData, 0, 0);
}

export type SplitPageResult = {
  pageNumber: number;
  totalPages: number;
  name: string;
  blob: Blob;
  width: number;
  height: number;
};

export async function getPdfInfo(file: File | Blob): Promise<{ totalPages: number }> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  return { totalPages: doc.numPages };
}

export async function splitPdfToPageImages(
  file: File | Blob,
  options?: {
    dpiScale?: number;
    pagesRange?: string;
    namingPattern?: string;
    onProgress?: (page: number, total: number, name: string) => void;
    shouldStop?: () => boolean;
  },
): Promise<SplitPageResult[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const stem = (file as File).name ? (file as File).name.replace(/\.pdf$/i, "") : "document";
  const scale = options?.dpiScale ?? 1.6;

  let wantedPages: number[] = [];
  if (!options?.pagesRange || options.pagesRange === "all" || !options.pagesRange.trim()) {
    wantedPages = Array.from({ length: doc.numPages }, (_, i) => i + 1);
  } else {
    wantedPages = parseRanges(options.pagesRange, doc.numPages);
  }

  const results: SplitPageResult[] = [];
  for (let idx = 0; idx < wantedPages.length; idx++) {
    if (options?.shouldStop?.()) break;
    const pageNum = wantedPages[idx];
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    const blob = await canvasToBlob(canvas, "image/png");

    let formattedName = `${stem}_p${String(pageNum).padStart(3, "0")}.png`;
    if (options?.namingPattern) {
      formattedName = options.namingPattern
        .replace("{n}", String(pageNum))
        .replace("{p2}", String(pageNum).padStart(2, "0"))
        .replace("{p3}", String(pageNum).padStart(3, "0"))
        .replace("{stem}", stem);
      if (!formattedName.toLowerCase().endsWith(".png")) formattedName += ".png";
    }

    options?.onProgress?.(idx + 1, wantedPages.length, formattedName);

    results.push({
      pageNumber: pageNum,
      totalPages: doc.numPages,
      name: formattedName,
      blob,
      width: canvas.width,
      height: canvas.height,
    });
  }

  return results;
}

export async function pdfToImages(
  file: File | Blob,
  dpiScale: number,
  onPage?: (page: number, total: number, fileName?: string) => void,
  shouldStop?: () => boolean,
): Promise<NamedBlob[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const stem = (file as File).name
    ? (file as File).name.replace(/\.pdf$/i, "")
    : "document";
  const out: NamedBlob[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    if (shouldStop?.()) break;
    onPage?.(i, doc.numPages, `${stem}_page_${String(i).padStart(3, "0")}.png`);
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: dpiScale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    const blob = await canvasToBlob(canvas, "image/png");
    out.push({
      name: `${stem}_page_${String(i).padStart(3, "0")}.png`,
      blob,
    });
  }
  return out;
}

function parseRanges(input: string, total: number): number[] {
  const pages = new Set<number>();
  for (const part of input.split(",")) {
    const bit = part.trim();
    if (!bit) continue;
    if (bit.includes("-")) {
      const [a, b] = bit.split("-").map((n) => Number(n.trim()));
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      for (let p = Math.min(a, b); p <= Math.max(a, b); p++) {
        if (p >= 1 && p <= total) pages.add(p);
      }
    } else {
      const p = Number(bit);
      if (p >= 1 && p <= total) pages.add(p);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

export async function splitPdf(
  file: File,
  ranges: string,
  onPage?: (index: number, total: number) => void,
  shouldStop?: () => boolean,
): Promise<NamedBlob[]> {
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes);
  const wanted = parseRanges(ranges, src.getPageCount());
  if (!wanted.length) throw new Error("No valid pages in that range");
  const stem = file.name.replace(/\.pdf$/i, "");
  const out: NamedBlob[] = [];

  for (let i = 0; i < wanted.length; i++) {
    if (shouldStop?.()) break;
    const page = wanted[i];
    onPage?.(i + 1, wanted.length);
    const doc = await PDFDocument.create();
    const [copied] = await doc.copyPages(src, [page - 1]);
    doc.addPage(copied);
    const saved = await doc.save();
    out.push({
      name: `${stem}_p${String(page).padStart(3, "0")}.pdf`,
      blob: new Blob([saved.slice().buffer], { type: "application/pdf" }),
    });
  }
  return out;
}

export function renamed(files: File[], prefix: string, start: number, pad: number) {
  return files.map((file, i) => {
    const dot = file.name.lastIndexOf(".");
    const ext = dot >= 0 ? file.name.slice(dot) : "";
    const num = String(start + i).padStart(pad, "0");
    const name = `${prefix}${num}${ext}`;
    return { name, blob: file };
  });
}

/**
 * Combines an array of image blobs into a single multipage PDF
 */
export async function compileImagesToPdf(
  items: NamedBlob[],
  onProgress?: (index: number, total: number) => void,
  shouldStop?: () => boolean,
): Promise<Blob> {
  const doc = await PDFDocument.create();

  for (let i = 0; i < items.length; i++) {
    if (shouldStop?.()) break;
    onProgress?.(i + 1, items.length);
    const item = items[i];
    const arrayBuf = await item.blob.arrayBuffer();
    const isPng = item.blob.type.includes("png") || item.name.toLowerCase().endsWith(".png");

    let embeddedImg;
    if (isPng) {
      embeddedImg = await doc.embedPng(arrayBuf);
    } else {
      embeddedImg = await doc.embedJpg(arrayBuf);
    }

    const { width, height } = embeddedImg;
    const page = doc.addPage([width, height]);
    page.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  const pdfBytes = await doc.save();
  return new Blob([pdfBytes.slice().buffer], { type: "application/pdf" });
}

export async function zipNamed(
  items: NamedBlob[],
  zipName: string,
  onProgress?: (percent: number, currentItem?: string) => void,
) {
  const zip = new JSZip();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    zip.file(item.name, item.blob);
  }
  const blob = await zip.generateAsync(
    { type: "blob" },
    (metadata) => {
      onProgress?.(Math.round(metadata.percent), metadata.currentFile || undefined);
    },
  );
  downloadBlob(blob, zipName);
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function stampTime() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
