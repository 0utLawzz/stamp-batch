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
  | "bottom-right";

export type LabelOptions = {
  text: string;
  position: Corner;
  bg: string;
  color: string;
  fontSize: number;
  padding: number;
  margin: number;
};

export type NamedBlob = { name: string; blob: Blob };

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

export async function stampImage(file: File, opts: LabelOptions): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(img, 0, 0);
    drawBanner(ctx, canvas.width, canvas.height, opts);
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    return await canvasToBlob(canvas, type);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))),
      type,
      0.95,
    );
  });
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
  ctx.font = `700 ${fontSize}px Georgia, "Palatino Linotype", serif`;
  const metrics = ctx.measureText(text);
  const boxW = metrics.width + padding * 2;
  const boxH = fontSize + padding * 2;
  let x = margin;
  let y = margin;
  if (opts.position.includes("right")) x = width - boxW - margin;
  if (opts.position.includes("center")) x = (width - boxW) / 2;
  if (opts.position.startsWith("bottom")) y = height - boxH - margin;
  ctx.fillStyle = opts.bg;
  roundRect(ctx, x, y, boxW, boxH, Math.max(6, fontSize * 0.2));
  ctx.fill();
  ctx.fillStyle = opts.color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padding, y + boxH / 2 + 1);
}

export async function pdfToImages(
  file: File,
  dpiScale: number,
  onPage?: (page: number, total: number) => void,
): Promise<NamedBlob[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const stem = file.name.replace(/\.pdf$/i, "");
  const out: NamedBlob[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    onPage?.(i, doc.numPages);
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
): Promise<NamedBlob[]> {
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes);
  const wanted = parseRanges(ranges, src.getPageCount());
  if (!wanted.length) throw new Error("No valid pages in that range");
  const stem = file.name.replace(/\.pdf$/i, "");
  const out: NamedBlob[] = [];
  for (let i = 0; i < wanted.length; i++) {
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

export async function zipNamed(items: NamedBlob[], zipName: string) {
  const zip = new JSZip();
  for (const item of items) zip.file(item.name, item.blob);
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, zipName);
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function stampTime() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
