import type { Question, QuestionStatus } from "@/lib/types";
import { ArrowDown } from "../ui/ArrowDown";

type QuestionCardProps = {
  question: Question;
  selected: boolean;
  expanded: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
};

import { STATUS_STYLES } from "./StatusStyles";

export function QuestionCard({
  question,
  selected,
  expanded,
  onSelect,
  onToggle,
}: QuestionCardProps) {
  const isMissing = question.status === "missing" || question.answered === false;

  const part =
    question.subPart ||
    (question.id === "q11a" ? "a." : question.id === "q11b" ? "b." : undefined);

  const statusStyle = STATUS_STYLES[question.status] ?? STATUS_STYLES.missing;

  return (
    <article
      className={`p-[13px_12px] md:p-[14px] border-2 rounded-[18px] bg-[rgba(255,255,255,0.91)] md:bg-[rgba(255,255,255,0.92)] transition-[0.16s] hover:translate-y-[-1px] ${
        selected ? 'border-[#ff7b40]' : 'border-transparent'
      } ${isMissing ? 'opacity-70' : ''}`}
      onClick={() => onSelect(question.id)}
    >
      <div className="flex items-center md:items-start gap-[14px] md:gap-[14px]">
        <span className={`flex-[0_0_auto] grid place-items-center w-[32px] h-[32px] md:w-[42px] md:h-[42px] text-white border-[3px] rounded-full shadow-[0_2px_5px_#aaa] text-[17px] md:text-[18px] font-bold ${
          selected ? 'bg-orange border-[#ff9b76]' : 'bg-[#5b5b5b] border-[#eee]'
        }`}>
          {question.number}
        </span>
        {part && <span className="flex-[0_0_auto] p-[6px_9px] rounded-full bg-[#f5f5f4] font-bold">{part.endsWith(".") ? part : `${part}.`}</span>}
        <p className="flex-1 m-0 text-[#3f3f3f] text-[16px] md:text-[14px] leading-[1.42] md:leading-[1.45] tracking-[-0.45px]">{question.body}</p>
        <span
          className={`flex-[0_0_auto] p-[7px_11px] md:p-[6px_10px] rounded-[18px] text-[16px] md:text-[13px] font-bold whitespace-nowrap ${statusStyle.text} ${statusStyle.bg}`}
          title={statusStyle.label}
        >
          {isMissing ? statusStyle.label : question.marks}
        </span>
        <button
          aria-label={expanded ? "Collapse question feedback" : "Expand question feedback"}
          className={`flex-[0_0_auto] grid place-items-center w-[30px] h-[30px] text-[#444] rounded-[8px] bg-[#f4f4f4] transition-transform ${
            expanded || selected ? 'rotate-180' : ''
          }`}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(question.id);
          }}
          type="button"
        >
          <ArrowDown />
        </button>
      </div>
      {expanded && question.feedback && (
        <div className="mt-[15px] ml-[49px] md:ml-[48px] p-[17px_24px] md:p-[16px] rounded-[15px] bg-[#f3f3f2]">
          <strong className="text-[16px]">AI Feedback</strong>
          <p className="mt-[10px] text-[14px] leading-[1.5]">{question.feedback}</p>
        </div>
      )}
    </article>
  );
}