import { LeftArrow } from "../ui/LeftArrow";
import { ExamIcon } from "../ui/ExamIcon";
import { Question } from "../ui/Question";
import { Bell } from "../ui/Bell";
import { HeaderSparkle } from "../ui/HeaderSparkle";
import { ArrowDown } from "../ui/ArrowDown";
import { HamburgerIcon } from "../ui/HamburgerIcon";

type HeaderProps = {
  onBack?: () => void;
  isLanding?: boolean;
};

export function Header({ onBack, isLanding }: HeaderProps) {
  const barClass = isLanding
    ? "h-[41px] px-[18px] flex items-center justify-between rounded-[11px] bg-white"
    : "h-[54px] px-[26px] flex items-center justify-between rounded-[17px] bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)]";

  return (
    <header className={barClass}>
      {/* Breadcrumb */}
      <div className={`flex items-center font-semibold text-[#9a9a9a] ${isLanding ? "gap-[7px] text-[12px]" : "gap-[11px]"}`}>
        <button
          aria-label="Go back"
          onClick={onBack}
          type="button"
          className={`grid place-items-center bg-transparent text-[#454545] ${
            isLanding
              ? "w-[27px] h-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.03)]"
              : ""
          }`}
        >
          <LeftArrow />
        </button>
        <div className="lg:flex lg:items-center lg:gap-2 hidden lg:block">
          <ExamIcon />
          <span>Exams</span>
        </div>
        
      </div>

      {/* Profile */}
      <div className={`flex items-center text-[#343434] ${isLanding ? "gap-[9px]" : "gap-[14px]"}`}>
        <button aria-label="Help" type="button" className="hidden lg:block relative bg-transparent text-[#3b3b3b] p-0">
          <Question />
        </button>
        <button aria-label="Notifications" type="button" className="relative bg-transparent text-[#3b3b3b] p-0">
          <Bell />
          {/* <i className="absolute -top-[4px] -right-[4px] w-2 h-2 rounded-full bg-[#ff5623]" /> */}
        </button>
        <button
          aria-label="AI tools"
          type="button"
          className="hidden lg:block w-[38px] h-[38px] rounded-full bg-transparent text-[21px] grid place-items-center"
        >
          <HeaderSparkle />
        </button>
        <img alt="User profile" height="30" src="/image.png" width="30" className="rounded-full" />
        <strong className={isLanding ? "text-[10px] hidden lg:block" : "text-[16px] hidden lg:block"}>Madhur Rastogi</strong>
        <div className="lg:hidden">
          <HamburgerIcon/>
        </div>
        <div className="hidden lg:block">
          <ArrowDown/>
        </div>
        {/* <ArrowDown /> */}
      </div>
    </header>
  );
}
