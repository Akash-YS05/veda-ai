"use client";

import type { FileSlot, Phase } from "@/lib/types";
import { FilePicker } from "./FilePicker";
import { RightArrow } from "../ui/RightArrow";
import { Loader } from "../ui/Loader";

type UploadViewProps = {
  files: Partial<Record<FileSlot, File>>;
  phase: Phase;
  onFileChange: (slot: FileSlot, file: File) => void;
  onFileRemove?: (slot: FileSlot) => void;
  onStartMapping: () => void;
};

export function UploadView({ files, phase, onFileChange, onFileRemove, onStartMapping }: UploadViewProps) {
  const ready = Boolean(files.question && files.answer);
  return (
    /* upload-stage: full-height centred grid */
    <section className="min-h-[calc(100dvh-56px)] grid place-items-center">
      {/* upload-card */}
      <div className="w-[min(563px,75vw)] flex flex-col items-center justify-start pt-5">
        {phase === "processing" ? (
          <ProcessingState />
        ) : (
          <UploadState
            files={files}
            onFileChange={onFileChange}
            onFileRemove={onFileRemove}
            onStartMapping={onStartMapping}
            ready={ready}
          />
        )}
      </div>
    </section>
  );
}

function ProcessingState() {
  return (
    <>
      {/* processor / orbit rings */}
      <div className="w-[170px] h-[170px] mx-auto mb-5 relative grid place-items-center">
        <span className="absolute w-[155px] h-[155px] rounded-full border-2 border-[rgba(255,86,35,0.18)] animate-[pulse_1.2s_infinite]" />
        <span className="absolute w-[115px] h-[115px] rounded-full border-2 border-[rgba(255,86,35,0.34)] animate-[pulse_1.2s_0.3s_infinite]" />
        <Loader />
      </div>
      <h1 className="m-0 text-[26px] tracking-[-1.6px] font-[750] text-center">Extracting...</h1>
      <p className="mt-[9px] text-[14px] tracking-[-0.6px] text-[#383838] text-center">This may take a while</p>
      {/* progress bar */}
      <div className="w-[220px] h-[7px] mt-7 overflow-hidden rounded-full bg-[#eee]">
        <i className="block w-[45%] h-full rounded-[inherit] bg-[#ff5623] animate-[loading_2.3s_ease-in-out_forwards] not-italic" />
      </div>
    </>
  );
}

type UploadStateProps = {
  files: Partial<Record<FileSlot, File>>;
  ready: boolean;
  onFileChange: (slot: FileSlot, file: File) => void;
  onFileRemove?: (slot: FileSlot) => void;
  onStartMapping: () => void;
};

function UploadState({ files, ready, onFileChange, onFileRemove, onStartMapping }: UploadStateProps) {
  return (
    <>
      {/* heading */}
      <div className="text-center">
        <h1 className="m-0 text-[26px] leading-[1.15] tracking-[-1.6px] font-[750]">
          Upload{" "}
          <em className="not-italic text-[#ff5623] bg-[rgba(255,147,80,0.15)] px-[7px] py-[4px] pb-[5px] rounded-[7px]">
            Question Paper &amp; Answer Sheets
          </em>
        </h1>
        <p className="mt-[9px] text-[14px] tracking-[-0.6px] text-[#383838]">
          Upload both files to get started
        </p>
      </div>

      {/* upload-art */}
      <div className="w-[98px] h-[98px] mx-auto mt-[15px] mb-[10px] relative grid place-items-center">
        <span className="absolute w-[98px] h-[98px] rounded-full bg-[rgba(255,86,35,0.1)] backdrop-blur-[4px]" />
        <span className="absolute w-[77px] h-[77px] rounded-full bg-[rgba(255,86,35,0.25)]" />
        <span className="relative w-[56px] h-[56px] grid place-items-center rounded-full bg-gradient-to-b from-[#fe9c5d] to-[#f65d24] text-white shadow-[0_7px_21px_rgba(237,94,31,0.28)]">
          <span className="absolute inset-[10px] rounded-full bg-white" />
          <img
            alt="Upload"
            className="relative z-10 w-[77px] h-[77px] object-contain"
            src="/assets/upload-illustration.svg"
          />
        </span>
      </div>

      {/* file-grid */}
      <div className="w-full p-[9px] grid grid-cols-1 md:grid-cols-2 gap-[11px] mt-1 rounded-[17px] bg-[rgba(255,255,255,0.62)] shadow-[0_9px_18px_rgba(100,100,100,0.05),inset_0_1px_rgba(255,255,255,0.85)]">
  <FilePicker
    file={files.question}
    onChange={onFileChange}
    onRemove={onFileRemove}
    type="question"
  />
  <FilePicker
    file={files.answer}
    onChange={onFileChange}
    onRemove={onFileRemove}
    type="answer"
  />
</div>

      {/* CTA button */}
      <button
        className={`mt-[26px] flex items-center gap-[11px] px-[15px] h-[32px] rounded-[17px] text-white text-[10px] font-bold border border-[rgba(255,255,255,0.2)] shadow-[0_2px_4px_rgba(0,0,0,0.28)] transition-transform duration-200
          ${ready
            ? "bg-[#323232] hover:-translate-y-0.5 hover:bg-[#171717]"
            : "bg-[#b6b6b6] text-[#eee] cursor-not-allowed"
          }`}
        disabled={!ready}
        onClick={onStartMapping}
        type="button"
      >
        Start Mapping
        <RightArrow />
      </button>

      <p className="mt-3 text-[11px] text-[#777] text-center">
        Once both files are uploaded, you&apos;ll be able to map answers with questions
      </p>
    </>
  );
}
