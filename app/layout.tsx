import type { Metadata } from "next";
import {Bricolage_Grotesque} from "next/font/google";
import { Analytics } from "@vercel/analytics/next"
import "./globals.css";

const bricolage_grotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-dm-sans",
})

export const metadata: Metadata = {
  title: "Veda | Answer Mapper",
  description: "Map handwritten answers to their questions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="m-0 max-w-full min-w-[320px] text-[#303030] font-[Bricolage_Grotesque,sans-serif] bg-[#ececeb]">
        {children}
        <Analytics/>
      </body>
    </html>
  );
}
