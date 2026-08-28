import type { ExtractionResult } from "./types";
import { processFileClientSide } from "./pdf-utils";
import { demoQuestions } from "./demo-data";
import { parseAndMapDocumentsLocally } from "./local-extractor";

export interface DocumentUploadPayload {
  questionFile: File | null;
  answerFile: File | null;
}

export async function processQuestionAndAnswerFiles({
  questionFile,
  answerFile,
}: DocumentUploadPayload): Promise<ExtractionResult> {
  let questionDoc = null;
  let answerDoc = null;

  if (questionFile) {
    questionDoc = await processFileClientSide(questionFile);
  }

  if (answerFile) {
    answerDoc = await processFileClientSide(answerFile);
  }

  const totalAnswerPages = answerDoc?.totalPages || 4;
  const answerPageImages = answerDoc?.pageImages || [];

  try {
    // Call the server-side extraction API.
    // API keys are ONLY on the server — never passed from the browser.
    const response = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionFile: questionDoc
          ? {
              name: questionDoc.name,
              totalPages: questionDoc.totalPages,
              // Send ALL page images so multi-page question papers work
              pageImages: questionDoc.pageImages,
              pageTexts: questionDoc.pageTexts,
              fullText: questionDoc.fullText,
            }
          : null,
        answerFile: answerDoc
          ? {
              name: answerDoc.name,
              totalPages: answerDoc.totalPages,
              // Send ALL page images so multi-page answer sheets work
              pageImages: answerDoc.pageImages,
              pageTexts: answerDoc.pageTexts,
              fullText: answerDoc.fullText,
            }
          : null,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.questions && data.questions.length > 0) {
        return {
          questions: data.questions,
          totalPages: data.totalPages || totalAnswerPages,
          answerPageImages,
          extractionError: data.extractionError || undefined,
        };
      }
      // API responded but returned no questions — surface the error
      if (data.extractionError) {
        return {
          questions: demoQuestions,
          totalPages: totalAnswerPages,
          answerPageImages,
          extractionError: data.extractionError,
        };
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      return {
        questions: demoQuestions,
        totalPages: totalAnswerPages,
        answerPageImages,
        extractionError: errorData.extractionError || `Server error: ${response.status}`,
      };
    }
  } catch (apiErr) {
    console.warn("API request failed, falling back to client parser:", apiErr);
  }

  // Client-side local parser fallback (no API key needed)
  const localResult = parseAndMapDocumentsLocally({
    questionTexts: questionDoc?.pageTexts || [],
    answerTexts: answerDoc?.pageTexts || [],
    questionFullText: questionDoc?.fullText || "",
    answerFullText: answerDoc?.fullText || "",
    questionPagesCount: questionDoc?.totalPages || 2,
    answerPagesCount: totalAnswerPages,
  });

  if (localResult.questions.length > 0) {
    return {
      questions: localResult.questions,
      totalPages: localResult.totalPages,
      answerPageImages,
    };
  }

  // Last resort: demo data with a warning
  return {
    questions: demoQuestions,
    totalPages: 4,
    answerPageImages,
    extractionError:
      "Could not extract questions from the uploaded files. The files may be image-only scans with no text layer. Showing demo data.",
  };
}
