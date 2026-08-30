import { GradingSummary } from "./grading-summary";

export type FileSlot = "question" | "answer";
export type Phase = "upload" | "processing" | "mapped";
export type QuestionStatus = "good" | "partial" | "incorrect" | "missing";

export interface AnswerRegion {
  x: number; // percentage 0-100
  y: number; // percentage 0-100 (top coordinate)
  width: number; // percentage 0-100
  height: number; // percentage 0-100
  page: number; // 1-indexed page number
}

export interface Question {
  id: string;
  number: string;
  subPart?: string; // e.g. "a.", "b.", "a", "b"
  body: string;
  marks: string; // e.g. "2 / 2", "4 / 5", "0 / 2"
  score?: number;
  maxMarks?: number;
  status: QuestionStatus;
  feedback?: string;
  answered?: boolean;
  page?: number; // Question paper page
  answerPage?: number; // Answer sheet page where answer begins
  answerPages?: number[]; // If answer spans multiple pages [1, 2]
  region?: AnswerRegion; // Exact bounding box coordinates
  extractedAnswerText?: string;
}

export interface AnswerSheetPage {
  pageNumber: number;
  label: string;
  imageUrl?: string;
}

export interface ExtractionResult {
  questions: Question[];
  totalPages: number;
  answerPageImages?: string[];
  questionPageImages?: string[];
  /** Human-readable message when extraction partially or fully failed */
  extractionError?: string;
  summary?: GradingSummary;
}
