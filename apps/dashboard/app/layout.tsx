import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/Toast";
import { display, mono, sans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Gaitway", template: "%s · Gaitway" },
  description: "A payment gateway for AI agents.",
};

export const viewport: Viewport = {
  themeColor: "#0b1f24",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="bg-paper text-ink antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
