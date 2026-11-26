import { ServiceWorker } from "@/components/service-worker";
import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Self-hosted at build time, so the strict font-src 'self' policy still applies.
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sproutly",
  description:
    "A calmer place to care for your plants. Care schedules, reminders, weather, a 3D home and an AI plant assistant.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#f7f8f3" };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
