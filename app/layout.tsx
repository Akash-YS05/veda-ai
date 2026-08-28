import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veda | Answer Mapper",
  description: "Map handwritten answers to their questions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="m-0 max-w-full min-w-[320px] text-[#303030] font-[Bricolage_Grotesque,sans-serif] bg-[#ececeb]">
        {children}
      </body>
    </html>
  );
}
