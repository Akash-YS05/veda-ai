import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { parseAndMapDocumentsLocally } from "@/lib/local-extractor";
import type { Question, QuestionStatus } from "@/lib/types";

interface UploadFileMeta {
  name?: string;
  totalPages?: number;
  /** All page images as base64 data URLs */
  pageImages?: string[];
  pageTexts?: string[];
  fullText?: string;
}

interface RequestBody {
  questionFile?: UploadFileMeta | null;
  answerFile?: UploadFileMeta | null;
}

// ----- Raw shapes the AI returns -----

interface RawQuestion {
  id?: string;
  number?: string | number;
  subPart?: string | null;
  body?: string;
  text?: string;
  marks?: string;
  maxMarks?: number;
  page?: number;
}

interface RawMappedQuestion extends RawQuestion {
  score?: number;
  status?: string;
  answered?: boolean;
  answerPage?: number;
  answerPages?: number[];
  feedback?: string;
  extractedAnswerText?: string;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
  };
}

// Server-only: reads from GROQ_API_KEY env var
const GROQ_API_KEY = process.env.GROQ_API_KEY;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const { questionFile, answerFile } = body;

    if (GROQ_API_KEY && GROQ_API_KEY.length > 10 && !GROQ_API_KEY.startsWith("your-")) {
      const result = await tryGroqExtraction(questionFile, answerFile, GROQ_API_KEY);
      if (result && result.questions.length > 0) {
        return NextResponse.json({
          success: true,
          questions: result.questions,
          totalPages: result.totalPages,
          isDemo: false,
        });
      }
      // Groq ran but returned nothing useful — fall through to local
      console.warn("Groq extraction returned no questions, falling back to local parser");
    }

    // Local text-based fallback
    const localResult = parseAndMapDocumentsLocally({
      questionTexts: questionFile?.pageTexts || [],
      answerTexts: answerFile?.pageTexts || [],
      questionFullText: questionFile?.fullText || "",
      answerFullText: answerFile?.fullText || "",
      questionPagesCount: questionFile?.totalPages || 2,
      answerPagesCount: answerFile?.totalPages || 4,
    });

    if (localResult.questions.length > 0) {
      return NextResponse.json({
        success: true,
        questions: localResult.questions,
        totalPages: localResult.totalPages,
        isDemo: false,
      });
    }

    return NextResponse.json({
      success: false,
      questions: [],
      totalPages: answerFile?.totalPages || 4,
      isDemo: false,
      extractionError:
        "Could not extract questions. The files may be image-only scans. Try uploading a PDF with a text layer, or ensure the GROQ_API_KEY is valid.",
    });
  } catch (error) {
    console.error("Extraction API error:", error);
    return NextResponse.json(
      {
        success: false,
        questions: [],
        totalPages: 4,
        isDemo: false,
        extractionError: `Extraction failed: ${(error as Error).message}`,
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Core extraction logic
// ---------------------------------------------------------------------------

async function tryGroqExtraction(
  questionFile: UploadFileMeta | null | undefined,
  answerFile: UploadFileMeta | null | undefined,
  apiKey: string,
): Promise<{ questions: Question[]; totalPages: number } | null> {
  const groq = new Groq({ apiKey });
  const answerTotalPages = answerFile?.totalPages || 1;

  const questionText = questionFile?.fullText?.trim() || "";
  const answerText = answerFile?.fullText?.trim() || "";
  const hasQuestionText = questionText.length > 30;
  const hasAnswerText = answerText.length > 30;
  const hasQuestionImages = !!(questionFile?.pageImages?.length);
  const hasAnswerImages = !!(answerFile?.pageImages?.length);

  // ------------------------------------------------------------------
  // STEP 1: Extract questions from the question paper
  // ------------------------------------------------------------------
  let extractedQuestions: RawQuestion[] = [];

  if (hasQuestionText) {
    // We have real text — use fast text model
    extractedQuestions = await extractQuestionsFromText(groq, questionText);
  } else if (hasQuestionImages) {
    // Image-only / scanned — use vision model
    extractedQuestions = await extractQuestionsFromImages(groq, questionFile!.pageImages!);
  }

  if (extractedQuestions.length === 0) {
    console.warn("Step 1: No questions extracted from question paper");
    return null;
  }

  console.log(`Step 1: Extracted ${extractedQuestions.length} questions from question paper`);

  // ------------------------------------------------------------------
  // STEP 2: Map and grade each question against the answer sheet
  // ------------------------------------------------------------------
  let mappedQuestions: Question[] = [];

  if (hasAnswerText) {
    mappedQuestions = await mapAnswersFromText(
      groq,
      extractedQuestions,
      answerText,
      answerTotalPages,
      answerFile?.pageTexts || [],
    );
  } else if (hasAnswerImages) {
    mappedQuestions = await mapAnswersFromImages(
      groq,
      extractedQuestions,
      answerFile!.pageImages!,
    );
  }

  // If mapping totally failed, build safe defaults from extracted questions
  if (mappedQuestions.length === 0 && extractedQuestions.length > 0) {
    mappedQuestions = buildDefaultMappedQuestions(extractedQuestions, answerTotalPages);
  }

  return {
    questions: mappedQuestions,
    totalPages: answerTotalPages,
  };
}

// ---------------------------------------------------------------------------
// Step 1 helpers: extract questions
// ---------------------------------------------------------------------------

async function extractQuestionsFromText(
  groq: Groq,
  questionText: string,
): Promise<RawQuestion[]> {
  const prompt = `You are an expert at parsing exam papers.

Extract ALL questions from the following question paper text in the exact order they appear.

Rules:
- Treat sub-parts as SEPARATE questions: "11 (a)" becomes number "11" subPart "a"
- Preserve the original question number exactly (do NOT renumber)
- Include the complete question text as "body"
- Extract marks if stated, e.g. "[2 marks]" becomes maxMarks 2
- If no marks are stated, infer from context (default 2)

You MUST respond with ONLY valid JSON and absolutely nothing else — no markdown, no code fences, no explanation before or after:
{"questions":[{"id":"q1","number":"1","subPart":null,"body":"Full question text","maxMarks":2,"page":1}]}

Question paper text:
${questionText.substring(0, 12000)}`;

  // Only models confirmed working with this API key (no response_format support)
  const models = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
  for (const model of models) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 4096,
        // NOTE: response_format json_object is NOT supported by these models
      });
      const content = completion.choices[0]?.message?.content || "";
      const parsed = safeParseJson(content);
      const questions = parsed?.questions;
      if (Array.isArray(questions) && questions.length > 0) {
        console.log(`Step1/text: ${questions.length} questions via ${model}`);
        return questions as RawQuestion[];
      }
    } catch (err) {
      console.warn(`Step1/text model ${model} failed:`, (err as Error).message?.slice(0, 120));
    }
  }
  return [];
}

async function extractQuestionsFromImages(
  groq: Groq,
  pageImages: string[],
): Promise<RawQuestion[]> {
  // Vision models — process up to 4 pages at once to stay within context
  const visionModels = [
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
  ];

  const promptText = `You are an expert at reading scanned exam papers.

Look at the question paper image(s) provided and extract ALL questions in order.

Rules:
- Treat sub-parts as SEPARATE questions: "11 (a)" becomes number "11" subPart "a"
- Preserve original question numbering exactly
- Include the complete question text as "body"
- Extract marks if visible (e.g. "[2 marks]") and set maxMarks; default 2 if not visible
- Identify which page the question appears on (1-indexed)

You MUST respond with ONLY valid JSON and absolutely nothing else — no markdown, no code fences, no explanation:
{"questions":[{"id":"q1","number":"1","subPart":null,"body":"Full question text","maxMarks":2,"page":1}]}`;

  for (const model of visionModels) {
    try {
      // Build content parts: text prompt + all page images (capped at 8 to avoid rate limits)
      const imagesToSend = pageImages.slice(0, 8);
      const contentParts: Groq.Chat.Completions.ChatCompletionContentPart[] = [
        { type: "text", text: promptText },
        ...imagesToSend.map(
          (img): Groq.Chat.Completions.ChatCompletionContentPart => ({
            type: "image_url",
            image_url: { url: img },
          }),
        ),
      ];

      const completion = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: contentParts }],
        temperature: 0.1,
        max_tokens: 4096,
        // NOTE: response_format json_object not supported; JSON enforced via prompt
      });
      const content = completion.choices[0]?.message?.content || "";
      const parsed = safeParseJson(content);
      const questions = parsed?.questions;
      if (Array.isArray(questions) && questions.length > 0) {
        console.log(`Step1/vision: ${questions.length} questions via ${model}`);
        return questions as RawQuestion[];
      }
    } catch (err) {
      console.warn(`Step1/vision model ${model} failed:`, (err as Error).message?.slice(0, 120));
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Step 2 helpers: map + grade answers
// ---------------------------------------------------------------------------

/**
 * Given the per-page texts and an answer string, find which page it's on
 * and compute the y% position from where that text appears in the page.
 * This is far more accurate than asking the AI to guess coordinates.
 */
function computeRegionFromPageText(
  pageTexts: string[],
  qNumber: string,
  subPart: string | null | undefined,
  extractedAnswerText: string,
  aiAnswerPage: number,
  maxMarks: number,
): { x: number; y: number; width: number; height: number; page: number } {
  const totalPages = pageTexts.length;
  const targetPage = Math.min(Math.max(1, aiAnswerPage), totalPages || 1);
  const pageText = pageTexts[targetPage - 1] || "";

  if (!pageText.trim()) {
    // No text on this page — fall back to a safe default
    return { x: 5, y: 5, width: 88, height: 20, page: targetPage };
  }

  // Build search patterns in priority order:
  // 1. "Ans N (a)" / "Ans N(a)" / "Answer N (a)" style labels
  // 2. The first ~40 chars of the extracted answer text itself
  // 3. Plain "N." / "N)" at start of line
  const sub = subPart ? subPart.replace(/\.$/, "") : null;
  const searchPatterns: RegExp[] = [];

  if (sub) {
    searchPatterns.push(
      new RegExp(`Ans(?:wer)?\\s*${qNumber}\\s*\\(${sub}\\)`, "i"),
      new RegExp(`Ans(?:wer)?\\s*${qNumber}${sub}`, "i"),
      new RegExp(`Q\\.?\\s*${qNumber}\\s*\\(${sub}\\)`, "i"),
      new RegExp(`\\b${qNumber}\\s*\\(${sub}\\)`, "i"),
    );
  } else {
    searchPatterns.push(
      new RegExp(`Ans(?:wer)?\\s*${qNumber}[^(\\w]`, "i"),
      new RegExp(`Q\\.?\\s*${qNumber}[.):][^(\\w]`, "i"),
      new RegExp(`(?:^|\\n)\\s*${qNumber}[.):]`, ""),
    );
  }

  // Also try matching a snippet of the actual extracted answer text
  if (extractedAnswerText && extractedAnswerText.length > 10) {
    const snippet = extractedAnswerText.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    searchPatterns.push(new RegExp(snippet, "i"));
  }

  let charPos = -1;
  for (const pattern of searchPatterns) {
    const m = pattern.exec(pageText);
    if (m) {
      charPos = m.index;
      break;
    }
  }

  if (charPos === -1) {
    // Pattern not found — distribute evenly as a fallback
    return { x: 5, y: 5, width: 88, height: 20, page: targetPage };
  }

  // Convert character position → y percentage.
  // Character position in text doesn't map linearly to page height because
  // of varying line heights, headings, etc. We use a simple linear model
  // but leave ~10% top margin and ~10% bottom margin for page headers/footers.
  const usablePageFraction = pageText.length;
  const rawFraction = charPos / Math.max(usablePageFraction, 1);
  // Map 0–1 fraction to 5–88% of page height
  const y = Math.round(5 + rawFraction * 83);

  // Height based on answer complexity
  const height = maxMarks >= 5 ? 28 : maxMarks >= 3 ? 22 : 16;

  return {
    x: 5,
    y: Math.min(y, 88 - height), // ensure box doesn't overflow page bottom
    width: 88,
    height,
    page: targetPage,
  };
}

async function mapAnswersFromText(
  groq: Groq,
  questions: RawQuestion[],
  answerText: string,
  totalPages: number,
  answerPageTexts?: string[],
): Promise<Question[]> {
  const questionList = questions
    .map((q) => {
      const label = q.subPart ? `${q.number} (${q.subPart})` : q.number;
      return `- Q${label}: ${q.body}`;
    })
    .join("\n");

  // Do NOT ask the AI for region coordinates — it has no spatial information.
  // We compute accurate regions ourselves from the page text after mapping.
  const prompt = `You are an expert exam grader.

Below are the questions from the exam paper. Map each to the student's answer sheet text, then grade.

QUESTIONS:
${questionList}

STUDENT ANSWER SHEET TEXT (${totalPages} page(s)):
${answerText.substring(0, 12000)}

For each question:
1. Find the student's answer (they may answer out of order, or skip questions).
2. Grade: status "good" (full/near-full), "partial", or "missing" (unanswered).
3. Set answerPage to the 1-indexed page number where the answer appears.
   If the answer spans multiple pages, set answerPages to e.g. [2,3].
4. Copy the student's answer text verbatim into extractedAnswerText (up to 300 chars).
5. Write constructive feedback.

You MUST respond with ONLY valid JSON and absolutely nothing else — no markdown, no code fences, no explanation:
{"questions":[{"id":"q1","number":"1","subPart":null,"body":"Question text","marks":"2 / 2","score":2,"maxMarks":2,"status":"good","answered":true,"page":1,"answerPage":1,"answerPages":[1],"feedback":"...","extractedAnswerText":"Student answer verbatim"}]}`;

  const models = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
  for (const model of models) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 6000,
      });
      const content = completion.choices[0]?.message?.content || "";
      const parsed = safeParseJson(content);
      const rawList = parsed?.questions;
      if (Array.isArray(rawList) && rawList.length > 0) {
        console.log(`Step2/text: mapped ${rawList.length} questions via ${model}`);
        // Compute accurate regions from page text instead of using AI guesses
        return formatQuestionsWithComputedRegions(
          rawList as RawMappedQuestion[],
          totalPages,
          answerPageTexts || [],
        );
      }
    } catch (err) {
      console.warn(`Step2/text model ${model} failed:`, (err as Error).message?.slice(0, 120));
    }
  }

  // Text mapping failed — use defaults
  return buildDefaultMappedQuestions(questions, totalPages);
}

async function mapAnswersFromImages(
  groq: Groq,
  questions: RawQuestion[],
  answerPageImages: string[],
): Promise<Question[]> {
  const totalPages = answerPageImages.length;
  const visionModels = [
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
  ];

  const questionList = questions
    .map((q) => {
      const label = q.subPart ? `${q.number} (${q.subPart})` : q.number;
      return `- Q${label}: ${q.body}`;
    })
    .join("\n");

  const promptText = `You are an expert exam grader reading a student's handwritten answer sheet.

The exam has these questions:
${questionList}

Look at the answer sheet page image(s) carefully. For each question:
1. Find the student's handwritten answer. Students may answer out of order or skip questions.
2. Grade: status "good", "partial", or "missing".
3. Estimate the bounding box of the answer as percentages of the page:
   - region: { x, y, width, height } where top-left is (0,0) and bottom-right is (100,100)
   - y = vertical start of answer, height = vertical span of the answer block
4. Record which page(s) the answer is on (answerPage, answerPages).
5. Write brief, constructive feedback.
6. Transcribe the answer text (extractedAnswerText, up to 300 chars).

You MUST respond with ONLY valid JSON and absolutely nothing else — no markdown, no code fences, no explanation:
{"questions":[{"id":"q1","number":"1","subPart":null,"body":"...","marks":"2 / 2","score":2,"maxMarks":2,"status":"good","answered":true,"page":1,"answerPage":1,"answerPages":[1],"feedback":"...","extractedAnswerText":"...","region":{"x":5,"y":8,"width":88,"height":20,"page":1}}]}

IMPORTANT for sub-parts (e.g. "11 (a)" and "11 (b)"):
- Each sub-part gets its own separate region object
- region.page must equal the answerPage for that specific sub-part
- Sub-parts answered on the same sheet page must have different y values (one above the other)
- Sub-parts answered on different sheet pages must have different answerPage and region.page`;

  for (const model of visionModels) {
    try {
      // Send up to 6 answer pages (more = better coverage, but heavier request)
      const imagesToSend = answerPageImages.slice(0, 6);
      const contentParts: Groq.Chat.Completions.ChatCompletionContentPart[] = [
        { type: "text", text: promptText },
        ...imagesToSend.map(
          (img): Groq.Chat.Completions.ChatCompletionContentPart => ({
            type: "image_url",
            image_url: { url: img },
          }),
        ),
      ];

      const completion = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: contentParts }],
        temperature: 0.1,
        max_tokens: 6000,
        // NOTE: response_format json_object not supported; JSON enforced via prompt
      });
      const content = completion.choices[0]?.message?.content || "";
      const parsed = safeParseJson(content);
      const rawList = parsed?.questions;
      if (Array.isArray(rawList) && rawList.length > 0) {
        console.log(`Step2/vision: mapped ${rawList.length} questions via ${model}`);
        return formatQuestions(rawList as RawMappedQuestion[], totalPages);
      }
    } catch (err) {
      console.warn(`Step2/vision model ${model} failed:`, (err as Error).message?.slice(0, 120));
    }
  }

  return buildDefaultMappedQuestions(questions, totalPages);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse JSON from model output — strips markdown code fences if present.
 */
function safeParseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  // Strip ```json ... ``` or ``` ... ``` wrappers
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // Try to extract the first {...} block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        // give up
      }
    }
    return null;
  }
}

/**
/**
 * Like formatQuestions but computes regions from actual page text positions
 * instead of trusting AI-guessed coordinates.
 */
function formatQuestionsWithComputedRegions(
  rawQuestions: RawMappedQuestion[],
  totalPages: number,
  pageTexts: string[],
): Question[] {
  const slotsUsedPerPage = new Map<number, number>();

  return rawQuestions.map((q, idx) => {
    const status: QuestionStatus =
      q.status === "good" || q.status === "partial" || q.status === "missing"
        ? q.status
        : q.answered === false
          ? "missing"
          : "good";

    const maxMarks = q.maxMarks ?? 2;
    const score = q.score ?? (status === "missing" ? 0 : maxMarks);
    const answered = q.answered ?? status !== "missing";
    const answerPage = clamp(q.answerPage ?? 1, 1, Math.max(totalPages, 1));

    const answerPages =
      Array.isArray(q.answerPages) && q.answerPages.length > 0
        ? q.answerPages.map((p) => clamp(p, 1, Math.max(totalPages, 1)))
        : [answerPage];

    // Compute region from the page text — accurate spatial position
    let region: { x: number; y: number; width: number; height: number; page: number };
    if (pageTexts.length > 0 && answered) {
      region = computeRegionFromPageText(
        pageTexts,
        String(q.number || idx + 1),
        q.subPart,
        q.extractedAnswerText || "",
        answerPage,
        maxMarks,
      );
    } else {
      // Missing answer or no page texts — use slot-based fallback
      const slot = slotsUsedPerPage.get(answerPage) ?? 0;
      slotsUsedPerPage.set(answerPage, slot + 1);
      region = { x: 5, y: 5 + slot * 22, width: 88, height: 18, page: answerPage };
    }

    return {
      id: q.id || `q${idx + 1}`,
      number: String(q.number || idx + 1),
      subPart: q.subPart || undefined,
      body: q.body || q.text || `Question ${idx + 1}`,
      marks: q.marks || `${score} / ${maxMarks}`,
      score,
      maxMarks,
      status,
      feedback: q.feedback || "",
      answered,
      page: q.page || 1,
      answerPage,
      answerPages,
      region,
      extractedAnswerText: q.extractedAnswerText || "",
    };
  });
}

/**
 * When the AI mapping step fails entirely, synthesise sensible defaults
 * so at least the question list is populated with correct question data.
 */
function buildDefaultMappedQuestions(
  rawQuestions: RawQuestion[],
  totalPages: number,
): Question[] {
  return rawQuestions.map((q, idx) => {
    const maxMarks = q.maxMarks ?? 2;
    const targetPage = Math.min(
      totalPages,
      Math.max(1, Math.ceil(((idx + 1) / rawQuestions.length) * totalPages)),
    );
    // Spread questions evenly down the page, 4 slots per page
    const slotOnPage = idx % 4;
    const yPos = 5 + slotOnPage * 22;

    return {
      id: q.id || `q${idx + 1}`,
      number: String(q.number || idx + 1),
      subPart: q.subPart || undefined,
      body: q.body || q.text || `Question ${idx + 1}`,
      marks: `0 / ${maxMarks}`,
      score: 0,
      maxMarks,
      status: "missing" as QuestionStatus,
      answered: false,
      feedback:
        "Answer mapping could not be completed automatically. Please review the answer sheet manually.",
      extractedAnswerText: "",
      page: q.page || 1,
      answerPage: targetPage,
      answerPages: [targetPage],
      region: { x: 5, y: yPos, width: 88, height: 20, page: targetPage },
    };
  });
}

/**
 * Normalise raw AI output into typed Question objects.
 * Fills in safe defaults for every field so the UI never breaks.
 */
function formatQuestions(rawQuestions: RawMappedQuestion[], totalPages: number): Question[] {
  // Track how many questions have already been assigned to each page
  // so fallback regions don't stack on the same y position
  const slotsUsedPerPage = new Map<number, number>();

  return rawQuestions.map((q, idx) => {
    const status: QuestionStatus =
      q.status === "good" || q.status === "partial" || q.status === "missing"
        ? q.status
        : q.answered === false
          ? "missing"
          : "good";

    const maxMarks = q.maxMarks ?? 2;
    const score = q.score ?? (status === "missing" ? 0 : maxMarks);
    const answered = q.answered ?? status !== "missing";
    const answerPage = clamp(q.answerPage ?? 1, 1, totalPages);

    // Validate region — ensure all values are plausible percentages
    let region = q.region;
    if (
      !region ||
      typeof region.x !== "number" ||
      typeof region.y !== "number" ||
      typeof region.width !== "number" ||
      typeof region.height !== "number"
    ) {
      // Assign slots per page sequentially, not globally, so sub-parts on the
      // same page get consecutive y positions rather than repeating every 4
      const slot = slotsUsedPerPage.get(answerPage) ?? 0;
      slotsUsedPerPage.set(answerPage, slot + 1);
      region = {
        x: 5,
        y: 5 + slot * 22,
        width: 88,
        height: 20,
        page: answerPage,
      };
    } else {
      // Clamp to valid % range and ensure region.page is set correctly
      region = {
        x: clamp(region.x, 0, 95),
        y: clamp(region.y, 0, 90),
        width: clamp(region.width, 5, 95),
        height: clamp(region.height, 5, 90),
        // region.page must be the page the answer is on, not a global index
        page: clamp(region.page ?? answerPage, 1, totalPages),
      };
    }

    const answerPages =
      Array.isArray(q.answerPages) && q.answerPages.length > 0
        ? q.answerPages.map((p) => clamp(p, 1, totalPages))
        : [answerPage];

    return {
      id: q.id || `q${idx + 1}`,
      number: String(q.number || idx + 1),
      subPart: q.subPart || undefined,
      body: q.body || q.text || `Question ${idx + 1}`,
      marks: q.marks || `${score} / ${maxMarks}`,
      score,
      maxMarks,
      status,
      feedback: q.feedback || "",
      answered,
      page: q.page || 1,
      answerPage,
      answerPages,
      region,
      extractedAnswerText: q.extractedAnswerText || "",
    };
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
