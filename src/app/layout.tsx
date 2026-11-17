import type { Metadata } from "next";
import BarraLaterale from "@/components/BarraLaterale";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestionale",
  description: "Gestionale aziendale",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body className="flex">
        <BarraLaterale />
        <main className="flex-1 p-8">{children}</main>
      </body>
    </html>
  );
}
