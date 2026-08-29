import type { ChangeEvent, MouseEvent } from "react";
import type { FileSlot } from "@/lib/types";
import { UploadIcon } from "../ui/UploadIcon";

type FilePickerProps = {
  type: FileSlot;
  file?: File;
  onChange: (slot: FileSlot, file: File) => void;
  onRemove?: (slot: FileSlot) => void;
};

export function FilePicker({ type, file, onChange, onRemove }: FilePickerProps) {
  const id = `${type}-file`;
  const label = type === "question" ? "Question Paper" : "Answer Sheet";

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (nextFile) onChange(type, nextFile);
  }

  function handleRemove(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (onRemove) onRemove(type);
  }

  return (
    <label 
      className={`relative min-h-[151px] md:min-h-[129px] md:landing:min-h-[127px] p-[25px_16px] flex flex-col items-center justify-center gap-[9px] md:gap-[8px] border-[2px] border-dashed rounded-[13px] text-center transition-[0.2s_ease] ${
        file 
          ? 'border-orange bg-[#fffaf7] md:border-[#cbcbcb] md:bg-white' 
          : 'border-[#d1d1d1] bg-[rgba(255,255,255,0.4)] md:bg-[rgba(255,255,255,0.94)] hover:border-orange hover:bg-[#fffaf7] md:hover:border-[#cbcbcb] md:hover:bg-white'
      }`} 
      htmlFor={id}
    >
      <input
        accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp"
        id={id}
        onChange={handleChange}
        type="file"
        className="absolute opacity-0 inset-0 cursor-pointer"
      />
      {file ? (
        <UploadedFile file={file} onRemove={handleRemove} type={type} />
      ) : (
        <EmptyFilePicker label={label} />
      )}
    </label>
  );
}

function EmptyFilePicker({ label }: { label: string }) {
  return (
    <>
      <span className="grid place-items-center w-[48px] h-[48px] md:w-[34px] md:h-[34px] rounded-[11px] md:rounded-[6px] text-[#686868] md:text-[#363636] bg-[#eeeeec]">
        <UploadIcon />
      </span>
      <span className="grid gap-[3px]">
        <strong className="text-[16px] md:text-[13px] md:tracking-[-0.7px]">
          Upload <em className="not-italic text-orange">{label}</em>
        </strong>
        <small className="text-[#878787] text-[13px] md:text-[10px]">Max 10MB</small>
      </span>
    </>
  );
}

function UploadedFile({
  file,
  onRemove,
  type,
}: {
  file: File;
  onRemove: (e: MouseEvent) => void;
  type: FileSlot;
}) {
  const isImage = file.type.startsWith("image/");
  const sizeMb = (file.size / 1024 / 1024).toFixed(1);
  const sizeText = Number(sizeMb) < 0.1 ? `${Math.round(file.size / 1024)}KB` : `${sizeMb}MB`;
  const pagesText = type === "question" ? "2 Pages" : "4 Pages";

  return (
    <span className="relative w-[min(212px,90%)] min-h-[46px] p-[8px_11px] flex items-center gap-[9px] rounded-[9px] bg-[#f4f4f3] text-left">
      <span className="grid place-items-center w-[22px] h-[25px] rounded-[2px] text-white bg-[#e85650] font-[Arial,sans-serif] text-[7px] font-bold">
        {isImage ? "IMG" : "PDF"}
      </span>
      <span className="grid gap-[3px]">
        <strong className="block overflow-hidden max-w-[140px] text-ellipsis whitespace-nowrap text-[11px]">
          {file.name}
        </strong>
        <small className="text-[#878787] text-[9px]">
          {sizeText} &nbsp;•&nbsp; {pagesText}
        </small>
      </span>
      <button
        type="button"
        aria-label="Remove file"
        className="absolute right-[-9px] top-[-9px] w-[19px] h-[19px] grid place-items-center rounded-full text-white bg-[#646464] shadow-[0_2px_5px_rgba(0,0,0,0.23)] text-[16px] font-[300] leading-[1]"
        onClick={onRemove}
      >
        ×
      </button>
    </span>
  );
}
