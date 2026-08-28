export interface ProcessedDocument {
  name: string;
  totalPages: number;
  pageImages: string[]; // data URLs
  fullText: string;
  pageTexts: string[];
}

export async function processFileClientSide(file: File): Promise<ProcessedDocument> {
  if (file.type.startsWith("image/")) {
    const dataUrl = await fileToDataUrl(file);
    return {
      name: file.name,
      totalPages: 1,
      pageImages: [dataUrl],
      fullText: "",
      pageTexts: [""],
    };
  }

  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    return processPdfFile(file);
  }

  // Fallback
  const dataUrl = await fileToDataUrl(file);
  return {
    name: file.name,
    totalPages: 1,
    pageImages: [dataUrl],
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

async function processPdfFile(file: File): Promise<ProcessedDocument> {
  const arrayBuffer = await file.arrayBuffer();

  // Dynamically import pdfjs-dist in the browser
  const pdfjsLib = await import("pdfjs-dist");
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || "3.11.174"}/pdf.worker.min.js`;
  }

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  const pageImages: string[] = [];
  const pageTexts: string[] = [];
  let fullText = "";

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);

    // Extract text
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
      .join(" ");
    pageTexts.push(pageText);
    fullText += `\n--- Page ${i} ---\n` + pageText;

    // Render to canvas
    const scale = 1.5;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (context) {
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Draw white background
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;

      pageImages.push(canvas.toDataURL("image/jpeg", 0.85));
    }
  }

  return {
    name: file.name,
    totalPages: numPages,
    pageImages,
    fullText,
    pageTexts,
  };
}
