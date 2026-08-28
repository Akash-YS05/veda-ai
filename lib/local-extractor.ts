import type { Question, QuestionStatus } from "./types";

export interface ParsedDocumentData {
  questionTexts: string[];
  answerTexts: string[];
  questionFullText: string;
  answerFullText: string;
  questionPagesCount: number;
  answerPagesCount: number;
}

interface ExtractedQuestion {
  id: string;
  number: string;
  subPart?: string;
  body: string;
  maxMarks: number;
  page: number;
}

export function parseAndMapDocumentsLocally(data: ParsedDocumentData): {
  questions: Question[];
  totalPages: number;
} {
  const { questionTexts, answerTexts, answerPagesCount } = data;
  const totalAnswerPages = Math.max(1, answerPagesCount);

  // Extract questions from each page of the question paper
  const extractedQuestions: ExtractedQuestion[] = [];
  questionTexts.forEach((pageText, pageIndex) => {
    const pageNum = pageIndex + 1;
    const questions = parseQuestionsFromPage(pageText, pageNum);
    extractedQuestions.push(...questions);
  });

  if (extractedQuestions.length === 0) {
    return { questions: [], totalPages: totalAnswerPages };
  }

  // Build a searchable index of the answer sheet
  const answerIndex = buildAnswerIndex(answerTexts);

  // Map each question to its answer region
  const mappedQuestions: Question[] = extractedQuestions.map((q, idx) => {
    const mapping = findAnswer(q, idx, extractedQuestions.length, answerIndex, totalAnswerPages);

    return {
      id: q.id,
      number: q.number,
      subPart: q.subPart,
      body: q.body,
      marks: mapping.answered ? `${q.maxMarks} / ${q.maxMarks}` : `0 / ${q.maxMarks}`,
      score: mapping.answered ? q.maxMarks : 0,
      maxMarks: q.maxMarks,
      status: mapping.status,
      answered: mapping.answered,
      feedback: mapping.feedback,
      page: q.page,
      answerPage: mapping.answerPage,
      answerPages: [mapping.answerPage],
      extractedAnswerText: mapping.answerText,
      region: mapping.region,
    };
  });

  return { questions: mappedQuestions, totalPages: totalAnswerPages };
}

// ---------------------------------------------------------------------------
// Question paper parsing
// ---------------------------------------------------------------------------

function parseQuestionsFromPage(pageText: string, pageNum: number): ExtractedQuestion[] {
  const questions: ExtractedQuestion[] = [];
  if (!pageText?.trim()) return questions;

  // Normalise whitespace
  const text = pageText.replace(/\s+/g, " ").trim();

  // Split on likely question boundaries.
  // Matches patterns like: "1.", "Q1.", "Q1:", "1)", "1 (a)", "Q1 (a)", "Question 1"
  const questionBoundary =
    /(?:^|\s)(?:Q(?:uestion)?\s*)?(\d+)\s*(?:\(([a-zA-Z])\)|\.\s*([a-zA-Z])\b)?\s*[\.\:\)]/gi;

  // Collect all matches with their positions
  type MatchEntry = { index: number; number: string; subPart?: string };
  const matches: MatchEntry[] = [];
  let m: RegExpExecArray | null;

  while ((m = questionBoundary.exec(text)) !== null) {
    const num = m[1];
    const sub = m[2] || m[3]; // captured subpart letter
    matches.push({
      index: m.index,
      number: num,
      subPart: sub ? sub.toLowerCase() : undefined,
    });
  }

  // Extract body text between consecutive question starts
  matches.forEach((match, i) => {
    const start = match.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const rawBody = text.slice(start, end).trim();

    // Clean up the leading "1." / "Q1." prefix from the body
    const cleanBody = rawBody
      .replace(/^(?:Q(?:uestion)?\s*)?\d+\s*(?:\([a-zA-Z]\))?\s*[\.\:\)]\s*/i, "")
      .trim();

    const body = cleanBody.length > 5 ? cleanBody.substring(0, 400) : `Question ${match.number}`;
    const maxMarks = extractMarks(rawBody) ?? 2;

    const subLabel = match.subPart;
    const id = subLabel ? `q${match.number}${subLabel}` : `q${match.number}`;

    // Deduplicate — skip if we already have this id from a previous page
    questions.push({
      id,
      number: match.number,
      subPart: subLabel,
      body,
      maxMarks,
      page: pageNum,
    });
  });

  return questions;
}

function extractMarks(text: string): number | null {
  const m = text.match(/\[(\d+)\s*marks?\]|\((\d+)\s*marks?\)|(\d+)\s*marks?/i);
  if (m) {
    return parseInt(m[1] || m[2] || m[3], 10);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Answer sheet indexing
// ---------------------------------------------------------------------------

interface AnswerEntry {
  page: number;
  /** Fraction of the page where this answer starts (0–1) */
  yFraction: number;
  text: string;
}

interface AnswerIndex {
  /** Map from question label (e.g. "1", "11a", "11 (a)") → entry */
  byLabel: Map<string, AnswerEntry>;
  /** All entries in order for positional fallback */
  all: AnswerEntry[];
  pageTexts: string[];
}

function buildAnswerIndex(answerTexts: string[]): AnswerIndex {
  const byLabel = new Map<string, AnswerEntry>();
  const all: AnswerEntry[] = [];

  answerTexts.forEach((pageText, pageIndex) => {
    if (!pageText?.trim()) return;
    const page = pageIndex + 1;
    const text = pageText.replace(/\s+/g, " ").trim();

    // Find every answer label on this page
    // Patterns: "Ans 1", "Answer 1", "1.", "Q1.", "1)", "11(a)", etc.
    const answerBoundary =
      /(?:^|\s)(?:Ans(?:wer)?\s*)?(?:Q(?:uestion)?\s*)?(\d+)\s*(?:\(([a-zA-Z])\))?\s*[\.\:\)]/gi;

    let m: RegExpExecArray | null;
    while ((m = answerBoundary.exec(text)) !== null) {
      const num = m[1];
      const sub = m[2]?.toLowerCase();

      // Extract up to 400 chars of answer text following this label
      const bodyStart = m.index + m[0].length;
      const bodyEnd = Math.min(text.length, bodyStart + 400);
      const ansText = text.slice(bodyStart, bodyEnd).trim();

      // Calculate vertical fraction for region estimation
      const yFraction = m.index / Math.max(text.length, 1);

      const entry: AnswerEntry = { page, yFraction, text: ansText };

      // Register under multiple label variants for flexible lookup
      const baseLabel = num;
      const fullLabel = sub ? `${num}${sub}` : num;
      const parenLabel = sub ? `${num}(${sub})` : num;

      if (!byLabel.has(fullLabel)) byLabel.set(fullLabel, entry);
      if (!byLabel.has(parenLabel)) byLabel.set(parenLabel, entry);
      if (sub && !byLabel.has(baseLabel)) byLabel.set(baseLabel, entry);

      all.push(entry);
    }
  });

  return { byLabel, all, pageTexts: answerTexts };
}

// ---------------------------------------------------------------------------
// Answer finding & region estimation
// ---------------------------------------------------------------------------

interface AnswerMapping {
  answered: boolean;
  status: QuestionStatus;
  answerPage: number;
  answerText: string;
  feedback: string;
  region: { x: number; y: number; width: number; height: number; page: number };
}

function findAnswer(
  q: ExtractedQuestion,
  idx: number,
  totalQuestions: number,
  index: AnswerIndex,
  totalPages: number,
): AnswerMapping {
  // Try to find by label
  const lookupKeys = [
    q.subPart ? `${q.number}${q.subPart}` : q.number,
    q.subPart ? `${q.number}(${q.subPart})` : q.number,
    q.number,
  ];

  let entry: AnswerEntry | undefined;
  for (const key of lookupKeys) {
    entry = index.byLabel.get(key);
    if (entry) break;
  }

  if (entry) {
    // Found a matching answer label on the answer sheet
    const y = Math.round(entry.yFraction * 85) + 3; // 3–88%
    const height = estimateHeight(entry.text, q.maxMarks);

    return {
      answered: true,
      status: "good",
      answerPage: entry.page,
      answerText: entry.text.substring(0, 300),
      feedback: "Answer identified and mapped from the student's answer sheet.",
      region: { x: 5, y, width: 88, height, page: entry.page },
    };
  }

  // Positional fallback: distribute questions evenly across answer pages
  const targetPage = Math.min(
    totalPages,
    Math.max(1, Math.ceil(((idx + 1) / totalQuestions) * totalPages)),
  );
  const slotOnPage = idx % 4;
  const y = 5 + slotOnPage * 22;

  // Check if there's any text on that answer page
  const pageText = (index.pageTexts[targetPage - 1] || "").trim();
  const hasPageContent = pageText.length > 10;

  if (!hasPageContent) {
    return {
      answered: false,
      status: "missing",
      answerPage: targetPage,
      answerText: "",
      feedback: "No answer found for this question on the answer sheet.",
      region: { x: 5, y, width: 88, height: 18, page: targetPage },
    };
  }

  // Extract a positional slice of the page text as the likely answer
  const sectionSize = Math.floor(pageText.length / 4);
  const sliceStart = slotOnPage * sectionSize;
  const answerText = pageText.slice(sliceStart, sliceStart + 300).trim();
  const hasAnswer = answerText.length > 10;

  return {
    answered: hasAnswer,
    status: hasAnswer ? "good" : "missing",
    answerPage: targetPage,
    answerText: hasAnswer ? answerText : "",
    feedback: hasAnswer
      ? "Answer region estimated from position on the answer sheet."
      : "No answer found for this question on the answer sheet.",
    region: { x: 5, y, width: 88, height: hasAnswer ? 20 : 18, page: targetPage },
  };
}

/** Estimate highlight height based on answer length and max marks */
function estimateHeight(text: string, maxMarks: number): number {
  if (maxMarks >= 5) return 30;
  if (maxMarks >= 3) return 24;
  if (text.length > 200) return 22;
  return 18;
}
