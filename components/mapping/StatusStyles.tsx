import type { QuestionStatus } from "@/lib/types";

export const STATUS_STYLES: Record<QuestionStatus, { text: string; bg: string; label: string }> = {
  good: { text: "text-[#23b619]", bg: "bg-[#ecf8e9]", label: "Correct" },
  partial: { text: "text-[#ed7415]", bg: "bg-[#fff4e5]", label: "Partial" },
  incorrect: { text: "text-[#f04421]", bg: "bg-[#ffe9e4]", label: "Incorrect" },
  missing: { text: "text-[#8a8a8a]", bg: "bg-[#efefef]", label: "Not attempted" },
};