import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Semi_Condensed } from "next/font/google";
import "./globals.css";
import { DashboardShell } from "@/components/dashboard-shell";

// Closest open fonts to AMD's Univers-based brand type.
const sans = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
const display = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AMD LLM Lab | Benchmark. Predict. Optimize.",
  description:
    "Independent open-source research on LLM inference performance, real MI300X benchmark measurements, predictive modeling and hardware planning.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>
        <DashboardShell>{children}</DashboardShell>
      </body>
    </html>
  );
}
