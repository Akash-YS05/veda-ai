"use client";

import type {
  TextContent,
  TextItem,
} from "pdfjs-dist/types/src/display/api";

export interface ProcessedDocument {
  name: string;
  totalPages: number;
  /** Clean images — used for on-screen display / highlight overlay. */
  pageImages: string[];
  /** Same images but with a labeled percentage grid burned in — used ONLY
   * when sending to a vision model, so it can read off position instead
   * of guessing it. Never shown to the user. */
  annotatedPageImages: string[];
  fullText: string;
  pageTexts: string[];
}

let pdfjsLibPromise: Promise<typeof import("pdfjs-dist")> | null = null;

function getPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("pdfjs-dist").then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
      return lib;
    });
  }
  return pdfjsLibPromise;
}

export async function processFileClientSide(
  file: File
): Promise<ProcessedDocument> {
  if (file.type.startsWith("image/")) {
    const dataUrl = await fileToDataUrl(file);
    const annotated = await annotateDataUrlWithGrid(dataUrl);
    return {
      name: file.name,
      totalPages: 1,
      pageImages: [dataUrl],
      annotatedPageImages: [annotated],
      fullText: "",
      pageTexts: [""],
    };
  }

  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    return processPdfFile(file);
  }

  const dataUrl = await fileToDataUrl(file);
  const annotated = await annotateDataUrlWithGrid(dataUrl);
  return {
    name: file.name,
    totalPages: 1,
    pageImages: [dataUrl],
    annotatedPageImages: [annotated],
    fullText: "",
    pageTexts: [""],
  };
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Reconstruct line-structured text from pdf.js text items using their
 * actual position on the page (item.transform), instead of just
 * concatenating strings with spaces. Downstream matching relies on real
 * line boundaries — a naive space-join collapses the page into one line.
 */
function reconstructPageText(textContent: TextContent): string {
  interface PositionedItem {
    str: string;
    x: number;
    y: number;
  }

  const items: PositionedItem[] = textContent.items
    .filter(
      (item): item is TextItem =>
        "str" in item &&
        typeof item.str === "string" &&
        Array.isArray(item.transform)
    )
    .map((item) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
    }));

  if (items.length === 0) return "";

  const Y_TOLERANCE = 3;

  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PositionedItem[][] = [];

  for (const item of sorted) {
    const current = lines[lines.length - 1];

    if (current && Math.abs(current[0].y - item.y) <= Y_TOLERANCE) {
      current.push(item);
    } else {
      lines.push([item]);
    }
  }

  return lines
    .map((line) =>
      line
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(" ")
        .replace(/[ \t]+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .join("\n");
}

/**
 * Draws a labeled percentage grid onto a copy of a canvas's contents.
 * This gives a vision model a printed reference frame so it can READ a
 * y-position off the image instead of estimating it blind, which is far
 * more reliable for localization tasks.
 */
function drawPercentGrid(sourceCanvas: HTMLCanvasElement): string {
  const cloned = document.createElement("canvas");
  cloned.width = sourceCanvas.width;
  cloned.height = sourceCanvas.height;
  const ctx = cloned.getContext("2d");
  if (!ctx) return sourceCanvas.toDataURL("image/jpeg", 0.85);

  ctx.drawImage(sourceCanvas, 0, 0);

  const { width, height } = cloned;
  const fontSize = Math.max(14, Math.round(height * 0.02));
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textBaseline = "middle";

  for (let pct = 0; pct <= 100; pct += 10) {
    const y = (pct / 100) * height;

    ctx.strokeStyle = "rgba(255,0,0,0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    const label = `${pct}%`;
    const labelWidth = ctx.measureText(label).width + 8;
    const labelY = Math.min(Math.max(y, fontSize), height - fontSize);

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(0, labelY - fontSize / 2 - 2, labelWidth, fontSize + 4);
    ctx.fillStyle = "rgba(200,0,0,0.95)";
    ctx.fillText(label, 3, labelY);
  }

  return cloned.toDataURL("image/jpeg", 0.85);
}

async function loadImageToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(img, 0, 0);
  return canvas;
}

async function annotateDataUrlWithGrid(dataUrl: string): Promise<string> {
  try {
    const canvas = await loadImageToCanvas(dataUrl);
    return drawPercentGrid(canvas);
  } catch {
    // If annotation fails for any reason, fall back to the plain image
    // rather than breaking the whole extraction flow.
    return dataUrl;
  }
}

async function processPdfFile(file: File): Promise<ProcessedDocument> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await getPdfjs();

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;

  const pageImages: string[] = [];
  const annotatedPageImages: string[] = [];
  const pageTexts: string[] = [];
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);

    const textContent = await page.getTextContent();
    const pageText = reconstructPageText(textContent);

    pageTexts.push(pageText);
    fullText += `\n--- Page ${i} ---\n${pageText}`;

    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) continue;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: context, canvas, viewport }).promise;

    pageImages.push(canvas.toDataURL("image/jpeg", 0.85));
    annotatedPageImages.push(drawPercentGrid(canvas));
  }

  return {
    name: file.name,
    totalPages: pdf.numPages,
    pageImages,
    annotatedPageImages,
    fullText,
    pageTexts,
  };
}