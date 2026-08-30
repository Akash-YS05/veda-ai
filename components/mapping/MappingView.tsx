"use client";

import { useRef, useState } from "react";
import type { Question } from "@/lib/types";
import type { GradingSummary } from "@/lib/grading-summary";
import { PaperPreview } from "./PaperPreview";
import { QuestionCard } from "./QuestionCard";
import { GradingSummaryBar } from "./GradingSummaryBar";
import { ChevronLeft } from "../ui/ChevronLeft";
import { ChevronRight } from "../ui/ChevronRight";

type MappingViewProps = {
  questions: Question[];
  expandedIds: string[];
  selectedId: string;
  selectedQuestion: Question;
  zoom: number;
  setZoom: (zoom: number) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onSelectQuestion: (id: string) => void;
  onToggleQuestion: (id: string) => void;
  onToggleExpandAll: () => void;
  answerPageImages?: string[];
  extractionError?: string | null;
  summary?: GradingSummary;
};

export function MappingView({
  questions,
  expandedIds,
  selectedId,
  selectedQuestion,
  zoom,
  setZoom,
  currentPage,
  totalPages,
  onPageChange,
  onSelectQuestion,
  onToggleQuestion,
  onToggleExpandAll,
  answerPageImages,
  extractionError,
  summary,
}: MappingViewProps) {
  const containerRef = useRef<HTMLElement>(null);

  const [questionPanelRatio, setQuestionPanelRatio] = useState(0.52);
  const [mobileTab, setMobileTab] = useState<"questions" | "answers">(
    "questions"
  );

  const allExpanded =
    questions.length > 0 && questions.every((q) => expandedIds.includes(q.id));

  function handleResizeStart(
    event: React.PointerEvent<HTMLButtonElement>
  ) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

    const container = containerRef.current;
    if (!container) return;

    const bounds = container.getBoundingClientRect();
    const nextRatio = (event.clientX - bounds.left) / bounds.width;

    setQuestionPanelRatio(Math.min(0.68, Math.max(0.32, nextRatio)));
  }

  const handlePrevPage = () =>
    currentPage > 1 && onPageChange(currentPage - 1);

  const handleNextPage = () =>
    currentPage < totalPages && onPageChange(currentPage + 1);

  const QuestionsPanel = () => (
    <section className="questions-panel flex h-full min-h-0 flex-col">
      <header className="panel-title">
        <strong className="font-bold">
          Extracted Questions <span>(from question paper)</span>
        </strong>

        <button className="hidden lg:block" onClick={onToggleExpandAll} type="button">
          {allExpanded ? "Collapse All" : "Expand All"}
        </button>
      </header>

      <div className="question-list flex-1 overflow-y-auto">
        {questions.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            expanded={expandedIds.includes(question.id)}
            selected={question.id === selectedId}
            onSelect={onSelectQuestion}
            onToggle={onToggleQuestion}
          />
        ))}
      </div>
    </section>
  );

  const AnswerPanel = () => (
    <section className="answer-panel h-full flex flex-col">
      <header className="answer-toolbar">
        <h2 className="hidden lg:block">Answer Sheet</h2>

        <div className="">
          <button
            onClick={() => setZoom(Math.max(60, zoom - 10))}
            type="button"
          >
            −
          </button>

          <strong>{zoom}%</strong>

          <button
            onClick={() => setZoom(Math.min(150, zoom + 10))}
            type="button"
          >
            +
          </button>

          <div className="flex items-center ml-14 md:ml-3 bg-[#474747] rounded-lg px-2 text-sm text-gray-200">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
              className="pt-1 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft />
            </button>

            <span className="px-2 font-medium">
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              onClick={handleNextPage}
              disabled={currentPage >= totalPages}
              className="pt-1 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight />
            </button>
          </div>
        </div>
      </header>

      <PaperPreview
        answerPageImages={answerPageImages}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
        selectedQuestion={selectedQuestion}
        zoom={zoom}
      />
    </section>
  );

  return (
    <div className="mapping-stage-wrapper h-full">
      {summary && <GradingSummaryBar summary={summary} />}

      {extractionError && (
        <div className="flex items-start gap-3 bg-amber-950/60 border border-amber-600/50 text-amber-200 text-sm px-4 py-3 rounded-lg mx-3 mb-3">
          <span>⚠</span>
          <span>{extractionError}</span>
        </div>
      )}

      {/* ---------------- MOBILE ---------------- */}
      <div className="lg:hidden flex h-[calc(100vh-64px)] flex-col">
        <div className="mx-3 mb-3 rounded-full bg-[#ECECEA] p-1 flex">
          <button
            type="button"
            onClick={() => setMobileTab("questions")}
            className={`flex-1 rounded-full py-2 text-xs font-medium transition ${
              mobileTab === "questions"
                ? "bg-[#2E2E2E] text-white"
                : "text-[#757575]"
            }`}
          >
            Questions
          </button>

          <button
            type="button"
            onClick={() => setMobileTab("answers")}
            className={`flex-1 rounded-full py-2 text-xs font-medium transition ${
              mobileTab === "answers"
                ? "bg-[#2E2E2E] text-white"
                : "text-[#757575]"
            }`}
          >
            Answer Sheet
          </button>
        </div>

        <div className="flex-1 min-h-0 px-2">
          {mobileTab === "questions" ? <QuestionsPanel /> : <AnswerPanel />}
        </div>
      </div>

      {/* ---------------- DESKTOP ---------------- */}
      <section
        ref={containerRef}
        className="hidden lg:grid h-full"
        style={{
          gridTemplateColumns: `minmax(0, ${questionPanelRatio}fr) 12px minmax(0, ${1 - questionPanelRatio}fr)`,
        }}
      >
        <QuestionsPanel />

        <button
          type="button"
          aria-label="Resize panels"
          onPointerDown={handleResizeStart}
          onPointerMove={handleResize}
          className="relative cursor-col-resize bg-transparent"
        >
          <span className="absolute left-1/2 top-1/2 h-20 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 shadow-[0_4px_22px_rgba(0,0,0,0.25)]" />
        </button>

        <AnswerPanel />
      </section>
    </div>
  );
}