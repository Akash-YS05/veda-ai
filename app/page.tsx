"use client";

import { useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { MappingView } from "@/components/mapping/MappingView";
import { UploadView } from "@/components/upload/UploadView";
import { demoQuestions } from "@/lib/demo-data";
import { processQuestionAndAnswerFiles } from "@/lib/groq";
import type { GradingSummary } from "@/lib/grading-summary";
import type { FileSlot, Phase, Question } from "@/lib/types";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [files, setFiles] = useState<Partial<Record<FileSlot, File>>>({});
  const [questions, setQuestions] = useState<Question[]>(demoQuestions);
  const [selectedId, setSelectedId] = useState("q2");
  const [expandedIds, setExpandedIds] = useState<string[]>(["q2"]);
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(4);
  const [answerPageImages, setAnswerPageImages] = useState<string[]>([]);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [summary, setSummary] = useState<GradingSummary | undefined>(undefined);

  const selectedQuestion = useMemo(
    () => questions.find((q) => q.id === selectedId) ?? questions[0] ?? demoQuestions[0],
    [questions, selectedId],
  );

  const isLanding = phase !== "mapped";

  function handleFileChange(slot: FileSlot, file: File) {
    setFiles((current) => ({ ...current, [slot]: file }));
  }

  function handleFileRemove(slot: FileSlot) {
    setFiles((current) => {
      const next = { ...current };
      delete next[slot];
      return next;
    });
  }

  async function handleStartMapping() {
    if (!files.question || !files.answer) return;
    setPhase("processing");
    setExtractionError(null);
    try {
      const result = await processQuestionAndAnswerFiles({
        questionFile: files.question,
        answerFile: files.answer,
      });
      setQuestions(result.questions);
      setTotalPages(result.totalPages || 4);
      setAnswerPageImages(result.answerPageImages || []);
      setSummary(result.summary);
      if (result.extractionError) setExtractionError(result.extractionError);
      const defaultQ = result.questions[1] || result.questions[0];
      if (defaultQ) {
        setSelectedId(defaultQ.id);
        setExpandedIds([defaultQ.id]);
        setCurrentPage(defaultQ.answerPage || 1);
      }
    } catch (err) {
      setQuestions(demoQuestions);
      setTotalPages(4);
      setAnswerPageImages([]);
      setSummary(undefined);
      setExtractionError(
        `Extraction failed: ${(err as Error).message || "Unknown error"}. Showing demo data.`,
      );
    } finally {
      setTimeout(() => setPhase("mapped"), 1500);
    }
  }

  function handleSelectQuestion(id: string) {
    setSelectedId(id);
    const targetQ = questions.find((q) => q.id === id);
    if (targetQ?.answerPage) setCurrentPage(targetQ.answerPage);
    setExpandedIds((curr) => (curr.includes(id) ? curr : [...curr, id]));
  }

  function handleToggleQuestion(id: string) {
    setExpandedIds((curr) =>
      curr.includes(id) ? curr.filter((i) => i !== id) : [...curr, id],
    );
  }

  function handleToggleExpandAll() {
    if (questions.length > 0 && questions.every((q) => expandedIds.includes(q.id))) {
      setExpandedIds([]);
    } else {
      setExpandedIds(questions.map((q) => q.id));
    }
  }

  function handleBack() {
    setPhase("upload");
    setExtractionError(null);
  }

  /* ── shell styles vary between landing (upload) and mapping views ── */
  const shellClass = isLanding
    ? // Landing: radial white→grey gradient, full height, compact gap, no scroll
      "min-h-dvh flex gap-2 p-[9px_8px] overflow-hidden bg-[radial-gradient(circle_at_50%_48%,#fff_0,#f7f7f5_43%,#d7d7d5_100%)]"
    : // Mapping: simple flex row, full height
      "min-h-screen flex bg-[radial-gradient(80%_70%_at_60%_-20%,#fff_0,#f5f5f3_55%,#e8e8e5_100%)]";

  const workspaceClass = isLanding
    ? "flex-1 min-w-0 p-0"
    : "flex-1 min-w-0 h-screen p-2 overflow-hidden";

  return (
    <main className={shellClass}>
      <Sidebar expanded={isLanding} />
      <section className={workspaceClass}>
        <Header onBack={handleBack} isLanding={isLanding} />
        {phase === "mapped" ? (
          <MappingView
            answerPageImages={answerPageImages}
            currentPage={currentPage}
            expandedIds={expandedIds}
            extractionError={extractionError}
            onPageChange={setCurrentPage}
            onSelectQuestion={handleSelectQuestion}
            onToggleExpandAll={handleToggleExpandAll}
            onToggleQuestion={handleToggleQuestion}
            questions={questions}
            selectedId={selectedId}
            selectedQuestion={selectedQuestion}
            setZoom={setZoom}
            summary={summary}
            totalPages={totalPages}
            zoom={zoom}
          />
        ) : (
          <UploadView
            files={files}
            onFileChange={handleFileChange}
            onFileRemove={handleFileRemove}
            onStartMapping={handleStartMapping}
            phase={phase}
          />
        )}
      </section>
    </main>
  );
}