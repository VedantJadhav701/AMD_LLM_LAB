import type { Metadata } from "next";
import "./globals.css";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = {
  title: "AMD LLM Lab",
  description: "LLM inference planning and benchmark laboratory for AMD Instinct MI300X.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <DashboardShell>{children}</DashboardShell>
      </body>
    </html>
  );
}
