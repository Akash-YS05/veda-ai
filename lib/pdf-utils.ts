export interface ProcessedDocument {
  name: string;
  totalPages: number;
  pageImages: string[];
  fullText: string;
  pageTexts: string[];
}

export async function processFileClientSide(
  file: File
): Promise<ProcessedDocument> {
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

  const pdfjsLib = await import("pdfjs-dist/webpack");

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
  });

  const pdf = await loadingTask.promise;

  const pageImages: string[] = [];
  const pageTexts: string[] = [];
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);

    // Extract text
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ");

    pageTexts.push(pageText);
    fullText += `\n--- Page ${i} ---\n${pageText}`;

    // Render page to image
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) continue;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    pageImages.push(canvas.toDataURL("image/jpeg", 0.85));
  }

  return {
    name: file.name,
    totalPages: pdf.numPages,
    pageImages,
    fullText,
    pageTexts,
  };
}