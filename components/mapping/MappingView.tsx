"use client";

import { useRef, useState } from "react";
import type { Question } from "@/lib/types";
import { PaperPreview } from "./PaperPreview";
import { QuestionCard } from "./QuestionCard";
import { Resizer } from "../ui/Resizer";
import { ChevronRight } from "../ui/ChevronRight";
import { ChevronLeft } from "../ui/ChevronLeft";

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
}: MappingViewProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [questionPanelRatio, setQuestionPanelRatio] = useState(0.52);

  const allExpanded =
    questions.length > 0 && questions.every((q) => expandedIds.includes(q.id));

  function handleResizeStart(event: React.PointerEvent<HTMLButtonElement>) {
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

  function handlePrevPage() {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  }

  function handleNextPage() {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  }

  return (
    <div className="mapping-stage-wrapper">
      {/* Extraction warning banner */}
      {extractionError && (
        <div
          className="flex items-start gap-3 bg-amber-950/60 border border-amber-600/50 text-amber-200 text-sm px-4 py-3 rounded-lg mx-3"
          role="alert"
        >
          <span className="mt-0.5 shrink-0 text-amber-400" aria-hidden>⚠</span>
          <span>{extractionError}</span>
        </div>
      )}

      <section
        className="mapping-stage"
        ref={containerRef}
        style={{
          gridTemplateColumns: `minmax(0, ${questionPanelRatio}fr) 12px minmax(0, ${1 - questionPanelRatio}fr)`,
          flex: 1,
          minHeight: 0,
        }}
      >
      {/* Left: Questions Panel */}
      <section className="questions-panel">
        <header className="panel-title">
          <h2>
            Extracted Questions <span>(from question paper)</span>
          </h2>
          <button onClick={onToggleExpandAll} type="button">
            {allExpanded ? "Collapse All" : "Expand All"}
          </button>
        </header>
        <div className="question-list">
          {questions.map((question) => (
            <QuestionCard
              expanded={expandedIds.includes(question.id)}
              key={question.id}
              onSelect={onSelectQuestion}
              onToggle={onToggleQuestion}
              question={question}
              selected={question.id === selectedId}
            />
          ))}
        </div>
      </section>

      {/* Resizer */}
      <button
        aria-label="Resize question and answer panels"
        className="relative cursor-col-resize bg-transparent border-none p-0 group"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResize}
        type="button"
      >
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-2 h-20 w-3 rounded-[48px] bg-white/80 py-3 px-1 shadow-[0_4px_22.5px_rgba(0,0,0,0.25)]" />
      
      </button>

      {/* Right: Answer Panel */}
      <section className="answer-panel">
        <header className="answer-toolbar">
          <h2>Answer Sheet</h2>
          <div>
            <button
              aria-label="Zoom out"
              onClick={() => setZoom(Math.max(60, zoom - 10))}
              type="button"
            >
              −
            </button>
            <strong>{zoom}%</strong>
            <button
              aria-label="Zoom in"
              onClick={() => setZoom(Math.min(150, zoom + 10))}
              type="button"
            >
              +
            </button>
            <div className="flex items-center ml-3 bg-[#474747] rounded-lg px-2 text-sm text-gray-200">
              <button
                aria-label="Previous page"
                className="pt-1 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed bg-transparent"
                disabled={currentPage <= 1}
                onClick={handlePrevPage}
                type="button"
              >
                <ChevronLeft/>
              </button>
              <span className="px-2 font-medium">
                Page {currentPage} of {totalPages}
              </span>
              <button
                aria-label="Next page"
                className="pt-1 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed bg-transparent"
                disabled={currentPage >= totalPages}
                onClick={handleNextPage}
                type="button"
              >
                <ChevronRight/>
              </button>
            </div>
          </div>
        </header>

        <PaperPreview
          answerPageImages={answerPageImages}
          currentPage={currentPage}
          onPageChange={onPageChange}
          selectedQuestion={selectedQuestion}
          totalPages={totalPages}
          zoom={zoom}
        />
      </section>
    </section>
    </div>
  );
}
