import type { Question } from "@/lib/types";
import { ArrowDown } from "../ui/ArrowDown";
import { STATUS_STYLES } from "./StatusStyles";

type QuestionCardProps = {
  question: Question;
  selected: boolean;
  expanded: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
};

export function QuestionCard({
  question,
  selected,
  expanded,
  onSelect,
  onToggle,
}: QuestionCardProps) {
  const isMissing =
    question.status === "missing" || question.answered === false;

  const part =
    question.subPart ||
    (question.id === "q11a"
      ? "a."
      : question.id === "q11b"
      ? "b."
      : undefined);

  const statusStyle =
    STATUS_STYLES[question.status] ?? STATUS_STYLES.missing;

  return (
    <article
      onClick={() => onSelect(question.id)}
      className={`p-3 md:p-[14px] border-2 rounded-[18px] bg-[rgba(255,255,255,0.92)] transition-[0.16s] hover:-translate-y-[1px] ${
        selected ? "border-[#ff7b40]" : "border-transparent"
      } ${isMissing ? "opacity-70" : ""}`}
    >
      {/* ---------- MOBILE ---------- */}
<div className="flex flex-col gap-3 md:hidden">
  {/* Top row */}
  <div className="flex items-start">
    <div className="flex items-center gap-2">
      <span
        className={`grid place-items-center w-8 h-8 text-white border-[3px] rounded-full shadow-[0_2px_5px_#aaa] text-[15px] font-bold ${
          selected
            ? "bg-orange border-[#ff9b76]"
            : "bg-[#5b5b5b] border-[#eee]"
        }`}
      >
        {question.number}
      </span>

      {part && (
        <span className="px-2 py-1 rounded-full bg-[#f5f5f4] text-xs font-bold">
          {part.endsWith(".") ? part : `${part}.`}
        </span>
      )}
    </div>

    <div className="ml-auto flex items-center gap-2">
      <span
        title={statusStyle.label}
        className={`px-3 py-1 rounded-full text-[13px] font-bold whitespace-nowrap ${statusStyle.text} ${statusStyle.bg}`}
      >
        {isMissing ? statusStyle.label : question.marks}
      </span>

      <button
        type="button"
        aria-label={
          expanded
            ? "Collapse question feedback"
            : "Expand question feedback"
        }
        onClick={(e) => {
          e.stopPropagation();
          onToggle(question.id);
        }}
        className={`grid place-items-center w-8 h-8 rounded-lg bg-[#f4f4f4] text-[#444] transition-transform ${
          expanded ? "rotate-180" : ""
        }`}
      >
        <ArrowDown />
      </button>
    </div>
  </div>

  {/* Question text */}
  <p className="m-0 text-[14px] leading-[1.45] tracking-[-0.3px] text-[#3f3f3f]">
    {question.body}
  </p>
</div>

      {/* ---------- DESKTOP ---------- */}
      <div className="hidden md:flex items-start gap-[14px]">
        <span
          className={`grid place-items-center w-[42px] h-[42px] text-white border-[3px] rounded-full shadow-[0_2px_5px_#aaa] text-[18px] font-bold ${
            selected
              ? "bg-orange border-[#ff9b76]"
              : "bg-[#5b5b5b] border-[#eee]"
          }`}
        >
          {question.number}
        </span>

        {part && (
          <span className="px-[9px] py-[6px] rounded-full bg-[#f5f5f4] font-bold">
            {part.endsWith(".") ? part : `${part}.`}
          </span>
        )}

        <p className="flex-1 m-0 text-[14px] leading-[1.45] tracking-[-0.45px] text-[#3f3f3f]">
          {question.body}
        </p>

        <span
          title={statusStyle.label}
          className={`px-[10px] py-[6px] rounded-[18px] text-[13px] font-bold whitespace-nowrap ${statusStyle.text} ${statusStyle.bg}`}
        >
          {isMissing ? statusStyle.label : question.marks}
        </span>

        <button
          type="button"
          aria-label={
            expanded
              ? "Collapse question feedback"
              : "Expand question feedback"
          }
          onClick={(e) => {
            e.stopPropagation();
            onToggle(question.id);
          }}
          className={`grid place-items-center w-[30px] h-[30px] rounded-[8px] bg-[#f4f4f4] text-[#444] transition-transform ${
            expanded || selected ? "rotate-180" : ""
          }`}
        >
          <ArrowDown />
        </button>
      </div>

      {/* ---------- FEEDBACK ---------- */}
      {expanded && question.feedback && (
        <div className="mt-4 ml-0 md:ml-12 p-4 rounded-[15px] bg-[#f3f3f2]">
          <strong className="text-[16px]">AI Feedback</strong>
          <p className="mt-[10px] text-[14px] leading-[1.5]">
            {question.feedback}
          </p>
        </div>
      )}
    </article>
  );
}