# Stamp Batch

A fast, privacy-first in-browser document processing and batch automation suite. All conversions, transformations, and exports are performed 100% locally on the client side using HTML5 Canvas, WebAssembly, and modern Web APIs—no files or personal data are ever uploaded to an external server.

---

## 🌟 Key Features

### 1. 🔄 Connected Studio Workflow (All-in-One Pipeline)
A unified, multi-stage pipeline where tools connect seamlessly:
1. **Source Ingestion**: Load PDF documents (automatic high-DPI page rendering to images) and/or image files (PNG, JPG, WebP) into an interactive queue with the dedicated PDF auto-splitter.
2. **Batch Crop Studio & Dimensions**: Define a unified crop box across your batch with live visual overlay, preset aspect ratios (Full Frame, Scanner Trim -5%, Header/Footer Cut -12%, 1:1 Square, A4), 90°/180°/270° rotation, horizontal/vertical flipping, and scaling constraints.
3. **Scan Enhancements & Visual Filters**: Clean Scan (high-contrast B&W document binarization), Grayscale, Sepia/Vintage, Invert (Dark Mode scan), Brightness, Contrast, and custom framing borders.
4. **Sequential Numbering & Stamping**: Auto-sequence generator (e.g., `IMG-1`, `IMG-2`, `IMG-3`), custom prefix/suffix/zero-padding, per-image custom label inputs, import labels from text/CSV files, live preview, and corner/center positioning.
5. **Multi-Format Export**: One-click download as a ZIP archive of individual processed images OR compile all transformed pages directly into a merged multi-page PDF!

### 2. 🏷️ Flexible Labeling & Auto-Sequencing
- **Sequential Pattern Generator**: Easily generate continuous series like `IMG-1`, `IMG-2`, `IMG-3`, `Scan_001`, or `Page {n}` with custom start index and digit padding.
- **Individual Per-Image Inputs**: View a thumbnail and file name for every uploaded page/image and type a unique, dedicated label for each one individually.
- **Import from Text or CSV**: Upload or paste multi-line lists of labels with automatic delimiter detection (newline, comma, tab, semicolon) and an interactive mapping table.
- **Styling**: Solid banner, modern pill, transparent watermark, or subtle shadow with full color, font family (Serif, Sans, Mono), opacity, margin, and padding controls.

### 3. 📄 PDF to Images
- Extract every page of uploaded PDF files into lossless PNG images.
- Adjustable rendering quality / DPI scale factor (1.0× to 3.0×).

### 4. ✂️ Split PDFs
- Extract selected page ranges (e.g. `1-3, 5, 8`) as standalone PDF documents.
- Batch-process multiple PDFs and download the result as a ZIP file.

### 5. 🔤 Batch Rename
- Sequentially rename large piles of files with custom prefixes, start counts, and zero padding (`001`, `002`, ...).

### 6. 📊 Real-Time Animated Progress Bar
- Live percentage, item count tracker (`3 of 10`), phase description, current filename indicator, elapsed timer, and ETA calculator with pause/cancel support.

---

## 🛠️ Stack & Technologies

- **Framework**: [TanStack Start](https://tanstack.com/start) / [TanStack Router](https://tanstack.com/router)
- **UI & Styling**: [React 19](https://react.dev/), [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/)
- **PDF Engine**: [pdf.js](https://mozilla.github.io/pdf.js/) (rendering) & [pdf-lib](https://pdf-lib.js.org/) (manipulation & PDF creation)
- **Archiving**: [JSZip](https://stuk.github.io/jszip/)

---

## 🚀 Getting Started

### Installation

```bash
npm install
```

### Development Server

```bash
npm run dev
```

The application runs on `http://0.0.0.0:3000`.

### Production Build

```bash
npm run build
```

---

## 🔒 Privacy & Security

- **Zero Telemetry**: No third-party tracking scripts.
- **Client-Authoritative**: All image pixel manipulation, canvas rendering, and PDF generation happen directly inside your browser. No files leave your machine.

---

## 📄 License

[MIT](LICENSE)
