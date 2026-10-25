import type { Metadata } from "next";
import { Alexandria, IBM_Plex_Mono } from "next/font/google";
import "./emr.css";

const alexandria = Alexandria({
  variable: "--font-alexandria",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "V-Clinic EMR",
  description: "سجل طبي لفريق رعاية V-Clinic",
};

export default function EmrLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      dir="rtl"
      lang="ar"
      className={`${alexandria.variable} ${plexMono.variable} font-emr min-h-screen bg-page text-ink`}
    >
      {children}
    </div>
  );
}
