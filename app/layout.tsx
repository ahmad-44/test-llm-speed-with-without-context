import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GPT-4o mini Chat",
  description: "Fast AI chat powered by GPT-4o mini",
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
