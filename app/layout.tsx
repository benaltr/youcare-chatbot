import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YouCare AI",
  description: "AI chatbot platform for Israeli wellness clinics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
