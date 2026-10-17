import { ServiceWorker } from "@/components/service-worker";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Sproutly — Plant care, simplified",
  description:
    "A calmer place to care for your plants. Personal care schedules, reminders, calendar and history.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
