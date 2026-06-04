import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReelAnalyzer — Social Video RAG",
  description:
    "Ingest YouTube Shorts and Instagram Reels, compare engagement, and chat with an AI analyst.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
