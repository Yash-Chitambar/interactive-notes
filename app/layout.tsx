import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Study Buddy — AI Tutor",
  description: "An interactive AI tutor that watches you work and helps when you get stuck.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden bg-gray-50">{children}</body>
    </html>
  );
}
