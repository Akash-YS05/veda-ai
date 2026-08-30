import type { Question } from "./types";

export interface GradingSummary {
  totalScore: number;
  totalMaxMarks: number;
  /** 0–100, rounded to 1 decimal place */
  percentage: number;
  correctCount: number;
  partialCount: number;
  incorrectCount: number;
  missingCount: number;
  weakestQuestions: string[];
  overallFeedback: string;
  /** True if scores reflect real correctness grading (AI path).
   * False if scores only reflect whether an answer was present
   * (local/no-AI fallback) — the UI should be honest about this. */
  contentGraded: boolean;
}

function labelFor(q: Question): string {
  return q.subPart ? `Q${q.number}(${q.subPart})` : `Q${q.number}`;
}

/**
 * Builds the final "Grading/Feedback" step output from already-scored
 * questions. Deterministic and cheap — no extra AI call needed. Works
 * for both the AI-graded path and the presence-only local fallback;
 * pass `contentGraded: false` for the latter so the summary is honest
 * about what was actually checked.
 */
export function buildGradingSummary(
  questions: Question[],
  contentGraded: boolean,
): GradingSummary {
  const totalScore = questions.reduce((sum, q) => sum + (q.score ?? 0), 0);
  const totalMaxMarks = questions.reduce((sum, q) => sum + (q.maxMarks ?? 0), 0);
  const percentage =
    totalMaxMarks > 0 ? Math.round((totalScore / totalMaxMarks) * 1000) / 10 : 0;

  const correctCount = questions.filter((q) => q.status === "good").length;
  const partialCount = questions.filter((q) => q.status === "partial").length;
  const incorrectCount = questions.filter((q) => q.status === "incorrect").length;
  const missingCount = questions.filter((q) => q.status === "missing").length;

  const weakest = [...questions]
    .filter((q) => q.status !== "good")
    .sort((a, b) => {
      const ra = (a.score ?? 0) / Math.max(a.maxMarks ?? 1, 1);
      const rb = (b.score ?? 0) / Math.max(b.maxMarks ?? 1, 1);
      return ra - rb;
    })
    .slice(0, 3)
    .map(labelFor);

  let band: string;
  if (!contentGraded) {
    band = "This is a presence-only check — it confirms whether each question was answered, not whether the answer is correct.";
  } else if (percentage >= 85) {
    band = "Excellent performance overall.";
  } else if (percentage >= 70) {
    band = "Good performance overall, with some room for improvement.";
  } else if (percentage >= 50) {
    band = "Fair performance — several areas need more focus.";
  } else {
    band = "Significant gaps found — most questions need revisiting.";
  }

  const weakNote =
    contentGraded && weakest.length > 0 ? ` Focus especially on: ${weakest.join(", ")}.` : "";

  const overallFeedback = contentGraded
    ? `${band} Scored ${totalScore}/${totalMaxMarks} (${percentage}%). ${correctCount} correct, ${partialCount} partial, ${incorrectCount} incorrect, ${missingCount} missing.${weakNote}`
    : `${band} ${questions.length - missingCount} of ${questions.length} questions were answered (${totalScore}/${totalMaxMarks} marks awarded on a presence basis).`;

  return {
    totalScore,
    totalMaxMarks,
    percentage,
    correctCount,
    partialCount,
    incorrectCount,
    missingCount,
    weakestQuestions: weakest,
    overallFeedback,
    contentGraded,
  };
}