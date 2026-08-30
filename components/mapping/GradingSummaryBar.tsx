"use client";

import type { GradingSummary } from "@/lib/grading-summary";
import { STATUS_STYLES } from "./StatusStyles";

type GradingSummaryBarProps = {
  summary: GradingSummary;
};

export function GradingSummaryBar({ summary }: GradingSummaryBarProps) {
  const {
    totalScore,
    totalMaxMarks,
    percentage,
    correctCount,
    partialCount,
    incorrectCount,
    missingCount,
    overallFeedback,
    contentGraded,
  } = summary;

  const counts: Array<{ status: keyof typeof STATUS_STYLES; count: number }> = [
    { status: "good", count: correctCount },
    { status: "partial", count: partialCount },
    { status: "incorrect", count: incorrectCount },
    { status: "missing", count: missingCount },
  ];

  return (
    <div
      className={`mx-3 mb-3 rounded-[18px] border-2 p-[16px_20px] ${
        contentGraded ? "bg-[rgba(255,255,255,0.92)] border-transparent" : "bg-amber-50 border-amber-300"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <strong className="text-[22px] font-bold text-[#2e2e2e]">
            {totalScore} / {totalMaxMarks}
          </strong>
          <span className="text-[14px] font-medium text-[#757575]">({percentage}%)</span>
          {!contentGraded && (
            <span className="ml-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
              Presence-only
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {counts.map(({ status, count }) =>
            count > 0 ? (
              <span
                key={status}
                className={`text-[12px] font-bold px-[10px] py-[5px] rounded-full whitespace-nowrap ${STATUS_STYLES[status].text} ${STATUS_STYLES[status].bg}`}
              >
                {count} {STATUS_STYLES[status].label}
              </span>
            ) : null,
          )}
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-[1.5] text-[#4a4a4a]">{overallFeedback}</p>
    </div>
  );
}