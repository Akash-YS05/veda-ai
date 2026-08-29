import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { parseAndMapDocumentsLocally } from "@/lib/local-extractor";
import type { Question, QuestionStatus } from "@/lib/types";

interface UploadFileMeta {
  name?: string;
  totalPages?: number;
  pageImages?: string[];
  /** Same images with a printed % grid — used for vision model calls only. */
  annotatedPageImages?: string[];
  pageTexts?: string[];
  fullText?: string;
}

interface RequestBody {
  questionFile?: UploadFileMeta | null;
  answerFile?: UploadFileMeta | null;
}

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
      console.warn("Groq extraction returned no questions, falling back to local parser");
    }

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

  let extractedQuestions: RawQuestion[] = [];

  if (hasQuestionText) {
    extractedQuestions = await extractQuestionsFromText(groq, questionText);
  } else if (hasQuestionImages) {
    extractedQuestions = await extractQuestionsFromImages(
      groq,
      questionFile!.annotatedPageImages?.length
        ? questionFile!.annotatedPageImages!
        : questionFile!.pageImages!,
    );
  }

  if (extractedQuestions.length === 0) {
    console.warn("Step 1: No questions extracted from question paper");
    return null;
  }

  console.log(`Step 1: Extracted ${extractedQuestions.length} questions from question paper`);

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
      answerFile!.annotatedPageImages?.length
        ? answerFile!.annotatedPageImages!
        : answerFile!.pageImages!,
    );
  }

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

  const models = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
  for (const model of models) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 4096,
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

const MAX_SLOTS_PER_PAGE = 4;
const SLOT_HEIGHT = 22;

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normaliseForMatch(str: string): string {
  return str.replace(/\s+/g, " ").trim();
}

function charIndexToLineFraction(text: string, charIndex: number): number {
  const upTo = text.slice(0, Math.max(0, charIndex));
  const lineIndex = (upTo.match(/\n/g) || []).length;
  const totalLines = Math.max(1, (text.match(/\n/g) || []).length + 1);
  return lineIndex / totalLines;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Size HEIGHT from the actual length of the transcribed answer text
 * (Groq already gives us this in `extractedAnswerText`), instead of a
 * fixed lookup keyed only on the question's mark value. `maxMarks` is
 * used only as a floor so high-mark questions never collapse to a
 * sliver even if the transcription came back short.
 */
function estimateHeightFromLength(answerText: string, maxMarks: number): number {
  const len = (answerText || "").trim().length;
  const CHARS_PER_PCT = 45;
  const lengthBasedHeight = Math.round(len / CHARS_PER_PCT);
  const minFloor = maxMarks >= 5 ? 14 : maxMarks >= 3 ? 10 : 6;
  return clamp(Math.max(lengthBasedHeight, minFloor), 6, 65);
}

/** Size WIDTH from answer length — short answers get a narrower box. */
function estimateWidthFromLength(answerText: string): number {
  const len = (answerText || "").trim().length;
  if (len < 20) return 40;
  if (len < 60) return 65;
  return 88;
}

function computeRegionFromPageText(
  pageTexts: string[],
  qNumber: string,
  subPart: string | null | undefined,
  extractedAnswerText: string,
  aiAnswerPage: number,
  maxMarks: number,
  slotsUsedPerPage: Map<number, number>,
): { x: number; y: number; width: number; height: number; page: number } {
  const totalPages = pageTexts.length;
  const targetPage = Math.min(Math.max(1, aiAnswerPage), totalPages || 1);
  const pageText = pageTexts[targetPage - 1] || "";
  const height = estimateHeightFromLength(extractedAnswerText, maxMarks);
  const width = estimateWidthFromLength(extractedAnswerText);

  const fallbackRegion = () => {
    const slot = slotsUsedPerPage.get(targetPage) ?? 0;
    slotsUsedPerPage.set(targetPage, slot + 1);
    const wrapped = slot % MAX_SLOTS_PER_PAGE;
    return { x: 5, y: 5 + wrapped * SLOT_HEIGHT, width, height, page: targetPage };
  };

  if (!pageText.trim()) {
    return fallbackRegion();
  }

  const num = escapeRegExp(qNumber);
  const sub = subPart ? escapeRegExp(subPart.replace(/\.$/, "")) : null;

  const searchPatterns: RegExp[] = [];

  if (sub) {
    searchPatterns.push(
      new RegExp(`Ans(?:wer)?\\.?\\s*${num}\\b\\s*\\(${sub}\\)`, "i"),
      new RegExp(`Ans(?:wer)?\\.?\\s*${num}\\b${sub}\\b`, "i"),
      new RegExp(`Q\\.?\\s*${num}\\b\\s*\\(${sub}\\)`, "i"),
      new RegExp(`(?:^|\\n)\\s*${num}\\b\\s*\\(${sub}\\)`, "im"),
    );
  } else {
    searchPatterns.push(
      new RegExp(`Ans(?:wer)?\\.?\\s*${num}\\b(?!\\d)[.:)]`, "i"),
      new RegExp(`Q\\.?\\s*${num}\\b(?!\\d)[.:)]`, "i"),
      new RegExp(`(?:^|\\n)\\s*${num}\\b(?!\\d)[.:)]`, "im"),
    );
  }

  if (extractedAnswerText && extractedAnswerText.length > 10) {
    const normalisedPage = normaliseForMatch(pageText);
    const snippet = escapeRegExp(normaliseForMatch(extractedAnswerText).slice(0, 40));
    const snippetMatch = new RegExp(snippet, "i").exec(normalisedPage);
    if (snippetMatch) {
      const fraction = snippetMatch.index / Math.max(normalisedPage.length, 1);
      const y = Math.round(5 + fraction * 83);
      return { x: 5, y: Math.min(y, 92 - height), width, height, page: targetPage };
    }
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
    return fallbackRegion();
  }

  const fraction = charIndexToLineFraction(pageText, charPos);
  const y = Math.round(5 + fraction * 83);

  return {
    x: 5,
    y: Math.min(y, 92 - height),
    width,
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
4. Copy the student's answer text verbatim into extractedAnswerText, INCLUDING ITS FULL LENGTH
   (do not truncate short answers or pad short ones) — this is used to size the highlight, so
   accuracy of length matters as much as content.
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

Each image has a printed reference grid: thin red horizontal lines every 10% of the page height, labeled "0%" at the very top down to "100%" at the very bottom, printed on the left edge of each line.

For each question:
1. Find the student's handwritten answer. Students may answer out of order or skip questions.
2. Grade: status "good", "partial", or "missing".
3. Determine the bounding box of the answer using the printed grid labels as your reference — do NOT estimate percentages freehand:
   - Find the grid line(s) nearest the TOP and BOTTOM of the answer's actual handwriting/text, read their printed percentage labels directly, and use those to set "y" (top) and derive "height" (bottom % minus y).
   - CRITICAL: the box size MUST vary with how much the student wrote. A one-line or single-word answer should get a short box (roughly height 6-15). A multi-line paragraph should get a taller box that spans all of its lines (height can be 20, 40, 60+ if the answer is long). Do NOT give every answer the same height — measure each one independently off the grid.
   - x and width should span most of the usable page width (roughly x=5, width=88) for normal paragraph answers, but use a narrower width (e.g. width=30-50) for a short one-line or single-word answer.
4. Record which page(s) the answer is on (answerPage, answerPages) — this is the image order (1-indexed), not the printed grid.
5. Write brief, constructive feedback.
6. Transcribe the answer text (extractedAnswerText, up to 300 chars) — its actual length should be consistent with the box size you chose.

You MUST respond with ONLY valid JSON and absolutely nothing else — no markdown, no code fences, no explanation:
{"questions":[{"id":"q1","number":"1","subPart":null,"body":"...","marks":"2 / 2","score":2,"maxMarks":2,"status":"good","answered":true,"page":1,"answerPage":1,"answerPages":[1],"feedback":"...","extractedAnswerText":"...","region":{"x":5,"y":8,"width":88,"height":20,"page":1}}]}

IMPORTANT for sub-parts (e.g. "11 (a)" and "11 (b)"):
- Each sub-part gets its own separate region object, read off the grid independently
- region.page must equal the answerPage for that specific sub-part
- Sub-parts answered on the same sheet page must have different y values (one above the other) based on where they actually fall on the grid
- Sub-parts answered on different sheet pages must have different answerPage and region.page`;

  for (const model of visionModels) {
    try {
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

function safeParseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
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

    let region: { x: number; y: number; width: number; height: number; page: number };
    if (pageTexts.length > 0 && answered) {
      region = computeRegionFromPageText(
        pageTexts,
        String(q.number || idx + 1),
        q.subPart,
        q.extractedAnswerText || "",
        answerPage,
        maxMarks,
        slotsUsedPerPage,
      );
    } else {
      const slot = slotsUsedPerPage.get(answerPage) ?? 0;
      slotsUsedPerPage.set(answerPage, slot + 1);
      const wrapped = slot % MAX_SLOTS_PER_PAGE;
      region = { x: 5, y: 5 + wrapped * SLOT_HEIGHT, width: 88, height: 18, page: answerPage };
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

function buildDefaultMappedQuestions(
  rawQuestions: RawQuestion[],
  totalPages: number,
): Question[] {
  const slotsUsedPerPage = new Map<number, number>();

  return rawQuestions.map((q, idx) => {
    const maxMarks = q.maxMarks ?? 2;
    const targetPage = Math.min(
      totalPages,
      Math.max(1, Math.ceil(((idx + 1) / rawQuestions.length) * totalPages)),
    );
    const slot = slotsUsedPerPage.get(targetPage) ?? 0;
    slotsUsedPerPage.set(targetPage, slot + 1);
    const wrapped = slot % MAX_SLOTS_PER_PAGE;
    const yPos = 5 + wrapped * SLOT_HEIGHT;

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

function formatQuestions(rawQuestions: RawMappedQuestion[], totalPages: number): Question[] {
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

    let region = q.region;
    if (
      !region ||
      typeof region.x !== "number" ||
      typeof region.y !== "number" ||
      typeof region.width !== "number" ||
      typeof region.height !== "number"
    ) {
      // No usable AI-provided region — fall back to content-length sizing
      // using the transcribed text, rather than a fixed generic box.
      const slot = slotsUsedPerPage.get(answerPage) ?? 0;
      slotsUsedPerPage.set(answerPage, slot + 1);
      const wrapped = slot % MAX_SLOTS_PER_PAGE;
      const height = estimateHeightFromLength(q.extractedAnswerText || "", maxMarks);
      const width = estimateWidthFromLength(q.extractedAnswerText || "");
      region = {
        x: 5,
        y: 5 + wrapped * SLOT_HEIGHT,
        width,
        height,
        page: answerPage,
      };
    } else {
      region = {
        x: clamp(region.x, 0, 95),
        y: clamp(region.y, 0, 90),
        width: clamp(region.width, 5, 95),
        height: clamp(region.height, 5, 90),
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