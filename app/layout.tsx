import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import FireBackground from "@/components/FireBackground";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });

export const metadata: Metadata = {
  title: "EVX Fire — Dashboard de Tráfego Pago",
  description: "Acompanhe campanhas de Meta Ads e Google Ads em tempo real.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${sora.variable}`}>
      <body className="font-sans antialiased">
        <FireBackground />
        <div className="relative z-10 overflow-x-clip">{children}</div>
      </body>
    </html>
  );
}
