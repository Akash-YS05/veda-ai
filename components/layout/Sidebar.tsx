import { BrandLogo } from "@/components/ui/BrandLogo";
import { SidebarIcon } from "@/components/ui/SidebarIcon";
import { Sparkle } from "../ui/Sparkle";
import { ExpandIcon } from "../ui/ExpandIcon";
import { SettingsIcon } from "../ui/SettingsIcon";

const navigation = [
  { icon: "home" as const, label: "Home" },
  { icon: "classroom" as const, label: "My Classroom" },
  { icon: "assignments" as const, label: "Assignments" },
  { icon: "exams" as const, label: "Exams" },
  { icon: "library" as const, label: "My Library" },
];

type SidebarProps = {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
};

export function Sidebar({ expanded, setExpanded }: SidebarProps) {
  return expanded ? <ExpandedSidebar setExpanded={setExpanded}/> : <CompactSidebar setExpanded={setExpanded}/>;
}

function CompactSidebar({
  setExpanded,
}: {
  setExpanded: (expanded: boolean) => void;
}) {
  return (
    <aside className="w-[65px] py-3 px-[12px] flex flex-col items-center gap-10 rounded-[14px] bg-white shadow-[0_1px_40px_rgba(35,35,35,0.18)] z-10 max-[1050px]:hidden">
      {/* Brand */}
      <div className="w-[42px] h-[42px] rounded-[11px] text-white grid place-items-center bg-[#333] text-[27px] font-extrabold italic shadow-[0_3px_10px_#bbb]">
        <BrandLogo />
      </div>

      {/* Active item */}
      <div className="grid place-items-center w-[52px] h-[52px] rounded-full text-white bg-[#393939] border-[5px] border-[#ff7c57] text-[21px] shadow-[0_4px_9px_#bbb]">
        <Sparkle />
      </div>

      {/* Nav icons */}
      <div className="text-[#7c7c7c] grid gap-5 text-[25px] text-center">
        {navigation.map((item, i) => (
          <span
            key={item.label}
            className={i === 0 ? "bg-[#efefed] p-[9px] rounded-[9px] text-[#5f5f5f]" : "px-[9px]"}
          >
            <SidebarIcon name={item.icon} />
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-auto grid gap-[19px] text-[#5e5e5e] text-center text-[23px]">
        <img alt="Delhi Public School crest" height="40" src="/assets/school-crest.svg" width="40" />
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="bg-transparent p-0 text-[#5e5e5e] hover:text-[#333]"
        >
          <SettingsIcon />
        </button>
      </div>
    </aside>
  );
}

function ExpandedSidebar({
  setExpanded,
}: {
  setExpanded: (expanded: boolean) => void;
}) {
  return (
    <aside className="hidden lg:flex w-[240px] min-w-[240px] py-[18px] px-[17px] flex flex-col items-stretch rounded-[12px] bg-white/96 shadow-[0_9px_18px_rgba(35,35,35,0.18)]">
      {/* Brand row */}
      <div className="flex items-center gap-[7px] text-[#282828] justify-between">
        <div className="flex items-center gap-4">
          <div className="w-[30px] rounded-[7px] text-white grid place-items-center bg-[#333] text-[20px] font-extrabold italic flex-none">
            <BrandLogo />
          </div>
          <strong className="text-[21px] tracking-[-1.2px]">VedaAI</strong>
        </div>
        <div className="text-[#777]">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-[#777]"
          >
            <ExpandIcon />
          </button>
        </div>
      </div>

      {/* AI toolkit badge */}
      <div className="h-[38px] mt-[37px] flex items-center justify-center gap-[7px] border-2 border-[#ff7a56] rounded-[19px] text-white bg-gradient-to-br from-[#262626] to-[#444] shadow-[inset_0_1px_rgba(255,255,255,0.35),0_2px_3px_rgba(0,0,0,0.1)] text-[11px]">
        <Sparkle />
        <span className="text-[11px]">AI Teacher's Toolkit</span>
      </div>

      {/* Nav */}
      <nav className="grid gap-[5px] mt-[39px]">
        {navigation.map((item) => (
          <button
            key={item.label}
            className={`h-[29px] flex items-center gap-4 px-[9px] rounded-[6px] text-left text-[12px] bg-transparent ${
              item.label === "Exams"
                ? "text-[#252525] bg-[#f0f0ef] font-bold"
                : "text-[#858585]"
            }`}
          >
            <i className="w-[11px] not-italic text-[13px] text-[#848484]">
              <SidebarIcon name={item.icon} />
            </i>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="mt-auto">
        <button className="h-[29px] flex items-center gap-2 px-[9px] text-[#858585] bg-transparent rounded-[6px] text-[12px] w-full">
          <SidebarIcon name="settings" />
          <span>Settings</span>
        </button>
        {/* School badge */}
        <div className="h-[60px] mt-2 px-[10px] py-[10px] flex items-center gap-2 rounded-[11px] bg-[#f0f0ef]">
          <img alt="Delhi Public School crest" height="34" src="/assets/school-crest.svg" width="34" className="object-contain" />
          <div className="grid gap-[3px]">
            <strong className="text-[13px] tracking-[-0.4px]">Delhi Public School</strong>
            <span className="text-[#777] text-[10px]">Bokaro Steel City</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
