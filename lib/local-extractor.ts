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

  const extractedQuestions: ExtractedQuestion[] = [];
  const seenIds = new Set<string>();
  questionTexts.forEach((pageText, pageIndex) => {
    const pageNum = pageIndex + 1;
    const questions = parseQuestionsFromPage(pageText, pageNum);
    for (const q of questions) {
      if (seenIds.has(q.id)) continue;
      seenIds.add(q.id);
      extractedQuestions.push(q);
    }
  });

  if (extractedQuestions.length === 0) {
    return { questions: [], totalPages: totalAnswerPages };
  }

  const answerIndex = buildAnswerIndex(answerTexts);
  const slotsUsedPerPage = new Map<number, number>();

  const mappedQuestions: Question[] = extractedQuestions.map((q, idx) => {
    const mapping = findAnswer(
      q,
      idx,
      extractedQuestions.length,
      answerIndex,
      totalAnswerPages,
      slotsUsedPerPage,
    );

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

function normalisePageText(pageText: string): string {
  return pageText
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function parseQuestionsFromPage(pageText: string, pageNum: number): ExtractedQuestion[] {
  const questions: ExtractedQuestion[] = [];
  if (!pageText?.trim()) return questions;

  const text = normalisePageText(pageText);

  const questionBoundary =
    /(?:^|\n)\s*(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\b\s*(?:\(([a-zA-Z])\)|\.\s*([a-zA-Z])\b)?\s*[.:)]/gim;

  type MatchEntry = { index: number; matchLength: number; number: string; subPart?: string };
  const matches: MatchEntry[] = [];
  let m: RegExpExecArray | null;

  while ((m = questionBoundary.exec(text)) !== null) {
    const num = m[1];
    const sub = m[2] || m[3];
    matches.push({
      index: m.index,
      matchLength: m[0].length,
      number: num,
      subPart: sub ? sub.toLowerCase() : undefined,
    });
  }

  matches.forEach((match, i) => {
    const start = match.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const rawBody = text.slice(start, end).trim();

    const cleanBody = rawBody
      .replace(/^(?:Q(?:uestion)?\.?\s*)?\d{1,3}\s*(?:\([a-zA-Z]\))?\s*[.:)]\s*/i, "")
      .replace(/\n+/g, " ")
      .trim();

    const body = cleanBody.length > 5 ? cleanBody.substring(0, 400) : `Question ${match.number}`;
    const maxMarks = extractMarks(rawBody) ?? 2;

    const subLabel = match.subPart;
    const id = subLabel ? `q${match.number}${subLabel}` : `q${match.number}`;

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
  /** Fraction of the page (by line index) where this answer starts (0–1) */
  yFraction: number;
  /** The FULL text between this label and the next one (or page end) —
   * not truncated — so downstream sizing reflects the real answer length. */
  text: string;
}

interface AnswerIndex {
  byLabel: Map<string, AnswerEntry>;
  all: AnswerEntry[];
  pageTexts: string[];
}

function buildAnswerIndex(answerTexts: string[]): AnswerIndex {
  const byLabel = new Map<string, AnswerEntry>();
  const all: AnswerEntry[] = [];

  answerTexts.forEach((pageText, pageIndex) => {
    if (!pageText?.trim()) return;
    const page = pageIndex + 1;
    const text = normalisePageText(pageText);

    const answerBoundary =
      /(?:^|\n)\s*(?:Ans(?:wer)?\.?\s*|Q(?:uestion)?\.?\s*)?(\d{1,3})\b\s*(?:\(([a-zA-Z])\))?\s*[.:)]/gim;

    type RawMatch = { index: number; matchLength: number; number: string; subPart?: string };
    const rawMatches: RawMatch[] = [];
    let m: RegExpExecArray | null;
    while ((m = answerBoundary.exec(text)) !== null) {
      rawMatches.push({
        index: m.index,
        matchLength: m[0].length,
        number: m[1],
        subPart: m[2]?.toLowerCase(),
      });
    }

    const totalLines = Math.max(1, (text.match(/\n/g) || []).length + 1);

    rawMatches.forEach((match, i) => {
      const bodyStart = match.index + match.matchLength;
      // The real end of this answer is wherever the NEXT label starts.
      // This is what lets us measure the actual amount the student wrote,
      // instead of guessing a size purely from the question's mark value.
      const bodyEnd = i + 1 < rawMatches.length ? rawMatches[i + 1].index : text.length;
      const fullAnsText = text.slice(bodyStart, bodyEnd).replace(/\n+/g, " ").trim();

      // Skip labels that lead to essentially no content — almost always a
      // false positive (stray number, page artifact), not a real answer.
      if (fullAnsText.length < 5) return;

      const startLine = (text.slice(0, match.index).match(/\n/g) || []).length;
      const yFraction = startLine / totalLines;

      const entry: AnswerEntry = { page, yFraction, text: fullAnsText };

      const num = match.number;
      const sub = match.subPart;
      const baseLabel = num;
      const fullLabel = sub ? `${num}${sub}` : num;
      const parenLabel = sub ? `${num}(${sub})` : num;

      if (!byLabel.has(fullLabel)) byLabel.set(fullLabel, entry);
      if (!byLabel.has(parenLabel)) byLabel.set(parenLabel, entry);
      if (sub && !byLabel.has(baseLabel)) byLabel.set(baseLabel, entry);

      all.push(entry);
    });
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

const MAX_SLOTS_PER_PAGE = 4;
const SLOT_HEIGHT = 22;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nextSlotY(slotsUsedPerPage: Map<number, number>, page: number): number {
  const slot = slotsUsedPerPage.get(page) ?? 0;
  slotsUsedPerPage.set(page, slot + 1);
  const wrapped = slot % MAX_SLOTS_PER_PAGE;
  return 5 + wrapped * SLOT_HEIGHT;
}

function findAnswer(
  q: ExtractedQuestion,
  idx: number,
  totalQuestions: number,
  index: AnswerIndex,
  totalPages: number,
  slotsUsedPerPage: Map<number, number>,
): AnswerMapping {
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
    const y = Math.round(entry.yFraction * 85) + 3; // 3–88%
    const height = estimateHeight(entry.text, q.maxMarks);
    const width = estimateWidth(entry.text);

    return {
      answered: true,
      status: "good",
      answerPage: entry.page,
      answerText: entry.text.substring(0, 300),
      feedback: "Answer identified and mapped from the student's answer sheet.",
      region: {
        x: 5,
        y: Math.min(y, 92 - height),
        width,
        height,
        page: entry.page,
      },
    };
  }

  // Positional fallback: distribute questions evenly across answer pages
  const targetPage = Math.min(
    totalPages,
    Math.max(1, Math.ceil(((idx + 1) / totalQuestions) * totalPages)),
  );

  const pageText = (index.pageTexts[targetPage - 1] || "").trim();
  const hasPageContent = pageText.length > 10;

  if (!hasPageContent) {
    const y = nextSlotY(slotsUsedPerPage, targetPage);
    return {
      answered: false,
      status: "missing",
      answerPage: targetPage,
      answerText: "",
      feedback: "No answer found for this question on the answer sheet.",
      region: { x: 5, y, width: 88, height: 18, page: targetPage },
    };
  }

  const slotForSlice = (slotsUsedPerPage.get(targetPage) ?? 0) % MAX_SLOTS_PER_PAGE;
  const sectionSize = Math.floor(pageText.length / MAX_SLOTS_PER_PAGE) || pageText.length;
  const sliceStart = slotForSlice * sectionSize;
  const answerText = pageText.slice(sliceStart, sliceStart + 300).trim();
  const hasAnswer = answerText.length > 10;

  const y = nextSlotY(slotsUsedPerPage, targetPage);
  const height = hasAnswer ? estimateHeight(answerText, q.maxMarks) : 18;
  const width = hasAnswer ? estimateWidth(answerText) : 88;

  return {
    answered: hasAnswer,
    status: hasAnswer ? "good" : "missing",
    answerPage: targetPage,
    answerText: hasAnswer ? answerText : "",
    feedback: hasAnswer
      ? "Answer region estimated from position on the answer sheet."
      : "No answer found for this question on the answer sheet.",
    region: { x: 5, y, width, height, page: targetPage },
  };
}

/**
 * Estimate highlight HEIGHT from the actual measured length of the answer
 * text, not just the question's mark value. `maxMarks` is used only as a
 * minimum floor, so a high-mark question never collapses to a tiny box
 * even if the matched text came back short.
 */
function estimateHeight(text: string, maxMarks: number): number {
  const len = text.trim().length;
  // Roughly how many characters typically occupy one percentage-point of
  // page height for a normal line of writing — tune this constant against
  // your real documents if boxes consistently run too tall/short.
  const CHARS_PER_PCT = 45;
  const lengthBasedHeight = Math.round(len / CHARS_PER_PCT);
  const minFloor = maxMarks >= 5 ? 14 : maxMarks >= 3 ? 10 : 6;
  return clamp(Math.max(lengthBasedHeight, minFloor), 6, 65);
}

/**
 * Estimate highlight WIDTH from answer length. Very short answers (a word
 * or a number) get a narrower box instead of always spanning 88% of the
 * page width.
 */
function estimateWidth(text: string): number {
  const len = text.trim().length;
  if (len < 20) return 40;
  if (len < 60) return 65;
  return 88;
}