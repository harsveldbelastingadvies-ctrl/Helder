import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Helder — Administratie zonder omwegen",
  description: "Facturen, kosten, btw en klanten in één rustig overzicht.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
