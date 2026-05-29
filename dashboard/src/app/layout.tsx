import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LAPANG // POLRI Emergency Command Dashboard",
  description: "Framework sistem peringatan darurat open-source untuk memotong birokrasi penemuan anak hilang di Indonesia. Mengintegrasikan dashboard penyiaran kepolisian dan mesin interupsi seluler tingkat sistem.",
  openGraph: {
    title: "LAPANG — Localized Emergency Alert Framework",
    description: "Waspada Bersama, Selamatkan Segera. Sistem peringatan darurat anak hilang yang mengirimkan data visual korban langsung ke layar kunci warga dalam radius bahaya.",
    images: [
      {
        url: "/banner.jpg",
        width: 1920,
        height: 1080,
        alt: "LAPANG — LAPoran Anak hilaNG",
      },
    ],
    type: "website",
    locale: "id_ID",
    siteName: "LAPANG",
  },
  twitter: {
    card: "summary_large_image",
    title: "LAPANG — Localized Emergency Alert Framework",
    description: "Waspada Bersama, Selamatkan Segera.",
    images: ["/banner.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${outfit.variable} ${jetbrainsMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-tactical-dark text-slate-100 selection:bg-electric-alert selection:text-white">
        {children}
      </body>
    </html>
  );
}

