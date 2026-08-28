"use client";

import { useEffect, useRef, useState } from "react";
import type { Question } from "@/lib/types";

type PaperPreviewProps = {
  selectedQuestion: Question;
  zoom: number;
  currentPage: number;
  totalPages: number;
  answerPageImages?: string[];
  onPageChange?: (page: number) => void;
};

export function PaperPreview({
  selectedQuestion,
  zoom,
  currentPage,
  answerPageImages,
  onPageChange,
}: PaperPreviewProps) {
  const isQuestionAnswered =
    selectedQuestion.answered !== false && selectedQuestion.status !== "missing";

  // A question should highlight on a page if:
  //  - it's the primary answer page, OR
  //  - currentPage is in answerPages (multi-page answer)
  const answerPages = selectedQuestion.answerPages ?? [selectedQuestion.answerPage ?? 1];
  const isSelectedOnCurrentPage = answerPages.includes(currentPage);

  // Build the display label: "11 (a)", "11 (b)", "3", etc.
  const subPart = selectedQuestion.subPart
    ? selectedQuestion.subPart.replace(/\.$/, "")
    : "";
  const questionBadgeLabel = subPart
    ? `${selectedQuestion.number} (${subPart})`
    : selectedQuestion.number;

  const hasRealPageImages = !!(answerPageImages && answerPageImages.length > 0);
  const currentUploadedPageImage = hasRealPageImages
    ? answerPageImages![currentPage - 1] || answerPageImages![0]
    : undefined;

  return (
    <div className="paper-viewport">
      <div
        className="paper"
        style={{
          transform: `scale(${zoom / 100})`,
          transformOrigin: "top center",
          minHeight: currentUploadedPageImage ? undefined : "1100px",
          paddingBottom: currentUploadedPageImage ? undefined : "80px",
        }}
      >
        {currentUploadedPageImage ? (
          <RealImageWithHighlight
            currentPage={currentPage}
            imageUrl={currentUploadedPageImage}
            isAnswered={isQuestionAnswered}
            label={questionBadgeLabel}
            onPageChange={onPageChange}
            question={selectedQuestion}
            showHighlight={isSelectedOnCurrentPage}
            zoom={zoom}
          />
        ) : (
          <>
            <div className="margin-line" />
            <DefaultHandwrittenPage currentPage={currentPage} />
            {isSelectedOnCurrentPage && (
              <DemoHighlightedRegion
                isAnswered={isQuestionAnswered}
                label={questionBadgeLabel}
                onPageChange={onPageChange}
                question={selectedQuestion}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Real image + highlight — positions the highlight relative to the image itself
// ────────────────────────────────────────────────────────────────────────────

function RealImageWithHighlight({
  imageUrl,
  question,
  currentPage,
  showHighlight,
  isAnswered,
  label,
  onPageChange,
  zoom,
}: {
  imageUrl: string;
  question: Question;
  currentPage: number;
  showHighlight: boolean;
  isAnswered: boolean;
  label: string;
  onPageChange?: (page: number) => void;
  zoom: number;
}) {
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Measure the image's layout size (before CSS transforms).
  // IMPORTANT: getBoundingClientRect() is affected by CSS transforms (zoom scale
  // on the parent .paper div), so it returns scaled-down dimensions that would
  // make highlights misaligned. offsetWidth/offsetHeight always return the
  // pre-transform layout size, which is what we need for % → px conversion.
  const measureImage = () => {
    const el = imgRef.current;
    if (!el) return;
    if (el.naturalWidth > 0 && el.offsetWidth > 0 && el.offsetHeight > 0) {
      setImgSize({ width: el.offsetWidth, height: el.offsetHeight });
    }
  };

  // Re-measure on image change, zoom change, or first mount.
  // zoom changes alter the parent transform which doesn't affect offsetWidth/offsetHeight,
  // but we still re-measure to stay in sync with any reflowing.
  useEffect(() => {
    const id = requestAnimationFrame(measureImage);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, zoom]);

  // Also re-measure on window resize so zoom/reflow doesn't desync the overlay
  useEffect(() => {
    const handler = () => {
      requestAnimationFrame(measureImage);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Use the region as-is. Only suppress it when region.page explicitly points to
  // a different page than the one currently displayed. When region.page is not
  // set (undefined / 0), treat it as belonging to answerPage (the primary page).
  const region = question.region;
  const answerPages = question.answerPages ?? [question.answerPage ?? 1];
  const regionBelongsToPage = region
    ? (region.page ?? question.answerPage ?? 1) === currentPage
    : answerPages.includes(currentPage);

  // Continuation pages: next page in answerPages after currentPage
  const currentPageIdx = answerPages.indexOf(currentPage);
  const nextPage =
    currentPageIdx >= 0 && currentPageIdx < answerPages.length - 1
      ? answerPages[currentPageIdx + 1]
      : undefined;
  const isMultiPage = answerPages.length > 1;

  // Pixel-precise highlight style computed from measured image size + region %
  const highlightStyle =
    showHighlight && region && regionBelongsToPage && imgSize
      ? {
          position: "absolute" as const,
          top: Math.round((region.y / 100) * imgSize.height),
          left: Math.round((region.x / 100) * imgSize.width),
          width: Math.round((region.width / 100) * imgSize.width),
          height: Math.round((region.height / 100) * imgSize.height),
        }
      : null;

  return (
    <div style={{ position: "relative", display: "block", width: "100%" }}>
      <img
        ref={imgRef}
        alt="Answer sheet page"
        onLoad={measureImage}
        src={imageUrl}
        style={{ display: "block", width: "100%", height: "auto", borderRadius: "4px" }}
      />

      {showHighlight && highlightStyle && (
        <div
          className={`real-image-highlight ${!isAnswered ? "empty" : ""}`}
          style={highlightStyle}
        >
          <span className="highlight-badge">{label}</span>

          {isMultiPage && nextPage && onPageChange && (
            <button
              className="highlight-continue-btn"
              onClick={(e) => { e.stopPropagation(); onPageChange(nextPage); }}
              type="button"
            >
              Continues on Page {nextPage} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Demo mode highlight — positioned against the .paper div (pixel coords)
// ────────────────────────────────────────────────────────────────────────────

function DemoHighlightedRegion({
  question,
  isAnswered,
  label,
  onPageChange,
}: {
  question: Question;
  isAnswered: boolean;
  label: string;
  onPageChange?: (page: number) => void;
}) {
  const region = question.region;
  const topPos = region?.y !== undefined ? `${region.y}%` : "40%";
  const heightPos = region?.height !== undefined ? `${region.height}%` : "auto";
  const leftPos = region?.x !== undefined ? `${region.x}%` : "12px";
  const widthPos = region?.width !== undefined ? `${region.width}%` : "auto";

  const isMultiPage = question.answerPages && question.answerPages.length > 1;
  const nextPage = question.answerPages?.[1];

  if (!isAnswered) {
    return (
      <div
        className="answer-region empty"
        style={{ top: topPos, left: leftPos, width: widthPos, minHeight: "140px", height: heightPos }}
      >
        <span>{label}</span>
        <div className="p-2">
          <p className="font-semibold text-red-600">No matching answer was found for this question.</p>
          <p className="text-xs text-red-500 mt-1">Student left this question unattempted.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="answer-region"
      style={{ top: topPos, left: leftPos, width: widthPos, minHeight: "180px", height: heightPos }}
    >
      <span>{label}</span>
      <b>Q{label}.</b>
      <p>{question.extractedAnswerText || "Answer content identified from student's handwriting."}</p>

      {isMultiPage && nextPage && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-sans font-medium">
            Answer spans onto Page {nextPage}
          </span>
          {onPageChange && (
            <button
              className="text-xs underline text-green-700 font-sans cursor-pointer hover:text-green-900"
              onClick={(e) => { e.stopPropagation(); onPageChange(nextPage); }}
              type="button"
            >
              View Page {nextPage} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Demo handwritten pages (unchanged — only used when no real image)
// ────────────────────────────────────────────────────────────────────────────

function DefaultHandwrittenPage({ currentPage }: { currentPage: number }) {
  if (currentPage === 1) {
    return (
      <>
        <div className="written first" style={{ top: "25px" }}>
          <b>Q1.</b>
          <p>
            Photosynthesis is the process used by
            <br />
            green plants and some other organisms
            <br />
            to convert light energy into chemical energy.
          </p>
          <div className="formula">
            6CO₂ + 6H₂O &nbsp; —————→ &nbsp; C₆H₁₂O₆ + 6O₂
            <br />
            <small>Light &nbsp;&nbsp; Chlorophyll</small>
          </div>
          <div className="plant">
            ☼<br /><span>⌁ ︿ ⌁</span><br />♧<br />﹁╲╱﹂
          </div>
        </div>
        <div className="written" style={{ top: "420px" }}>
          <b>Q2.</b>
          <p>
            The process mainly occurs in the chloroplast of the plant cell.
            <br />
            It has two main stages:
          </p>
          <ol style={{ marginLeft: "72px", marginTop: "8px" }}>
            <li>Light reaction — captures light energy &amp; splits water.</li>
            <li>Dark reaction (Calvin cycle) — uses ATP to make glucose.</li>
          </ol>
        </div>
        <div className="written second" style={{ top: "760px" }}>
          <b>Q3.</b>
          <p>
            Chloroplasts contain chlorophyll pigments (chlorophyll a &amp; b)
            <br />
            which absorb sunlight (mainly blue and red wavelengths)
            <br />
            to drive the light-dependent stage of photosynthesis.
          </p>
        </div>
      </>
    );
  }

  if (currentPage === 2) {
    return (
      <>
        <div className="written" style={{ top: "25px", opacity: 0.4 }}>
          <span className="text-xs text-gray-500 font-sans">[Q4 skipped by student]</span>
        </div>
        <div className="written" style={{ top: "160px" }}>
          <b>Q5.</b>
          <p>Alveolus &amp; Capillary Gas Exchange:</p>
          <div className="formula" style={{ width: "75%", margin: "14px 0 0 72px" }}>
            [ Alveolar Sac O₂ → ] &nbsp; ⇌ &nbsp; [ Capillary Blood CO₂ → ]
            <br />
            <small>Moist thin squamous epithelium (0.2 µm) for maximum diffusion rate</small>
          </div>
        </div>
        <div className="written second" style={{ top: "540px" }}>
          <b>Q6.</b>
          <p>
            Human Digestive System Diagram:
            <br />
            Oesophagus → Stomach → Small Intestine → Large Intestine → Rectum.
            <br />
            Site of most absorption: <u>Small Intestine (Ileum)</u> via villi.
          </p>
          <div className="formula" style={{ width: "70%", margin: "18px 0 0 72px" }}>
            [Diagram: Stomach, Liver, Pancreas, Small &amp; Large Intestines]
            <br />
            <small>(Answer continued on Page 3...)</small>
          </div>
        </div>
      </>
    );
  }

  if (currentPage === 3) {
    return (
      <>
        <div className="written first" style={{ top: "25px" }}>
          <b>Q6 (contd.).</b>
          <p>
            Villi and microvilli dramatically increase the absorptive surface area.
            <br />
            Lacteals absorb fatty acids, while capillaries absorb glucose and amino acids.
          </p>
        </div>
        <div className="written" style={{ top: "220px" }}>
          <b>Q7.</b>
          <p>
            Structure of a Nephron:
            <br />
            1. Bowman&apos;s Capsule enclosing Glomerulus (Ultrafiltration)
            <br />
            2. Proximal Convoluted Tubule (Selective reabsorption)
            <br />
            3. Loop of Henle &amp; Distal Tubule → Collecting Duct.
          </p>
        </div>
        <div className="written" style={{ top: "520px" }}>
          <b>Q8.</b>
          <p>
            Palisade Mesophyll vs. Spongy Mesophyll:
            <br />
            - Palisade cells: Columnar, closely packed, abundant chloroplasts for light harvesting.
            <br />
            - Spongy cells: Irregular shape, loose arrangement with intercellular air spaces.
          </p>
        </div>
        <div className="written second" style={{ top: "800px" }}>
          <b>Q9.</b>
          <p>
            Transpiration is the evaporative loss of water from aerial parts of plants (stomata).
            <br />
            Factors increasing rate: (1) Higher temperature, (2) Greater wind speed / lower humidity.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="written first" style={{ top: "25px" }}>
        <b>Q10.</b>
        <p>
          Xylem vessels have thick, lignified secondary cell walls that provide tensile strength,
          <br />
          preventing the vessel elements from collapsing under negative pressure.
        </p>
      </div>
      <div className="written" style={{ top: "260px" }}>
        <b>Q11 (a).</b>
        <p>
          Plant B suffers from etiolation — absence of light prevents chlorophyll biosynthesis,
          <br />
          causing yellowing (chlorosis) and weak elongated stems.
        </p>
      </div>
      <div className="written" style={{ top: "530px" }}>
        <b>Q11 (b).</b>
        <p>
          Gradually relocate Plant B to bright indirect sunlight and maintain moderate watering
          <br />
          to allow reactivation of chlorophyll synthesis without sunburn shock.
        </p>
      </div>
      <div className="written second" style={{ top: "740px" }}>
        <b>Q12.</b>
        <p>Minute Ventilation = Tidal Volume × Respiratory Rate = 0.5 L × 12 = 6.0 L/min.</p>
        <div style={{ marginTop: "30px" }}>
          <b>Q13.</b>
          <p>
            Alveolar Ventilation = (Tidal Volume − Dead Space) × Rate
            <br />
            = (0.5 L − 0.15 L) × 12 = 0.35 L × 12 = <u>4.2 L/min</u>.
          </p>
        </div>
      </div>
    </>
  );
}
