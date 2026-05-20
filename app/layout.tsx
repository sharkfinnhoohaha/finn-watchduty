import type { Metadata } from "next";
import { Inter, Libre_Caslon_Text, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const libreCaslon = Libre_Caslon_Text({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-libre-caslon",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Approach to Watch Duty — Finn Bennett",
  description:
    "An approach-plate-styled application to Watch Duty by Finn Bennett: commercial pilot, designer, and operator of Pier and Point — a hyperlocal civic news publication in Ventura County, California.",
  authors: [{ name: "Finn Bennett" }],
  openGraph: {
    title: "Approach to Watch Duty — Finn Bennett",
    description:
      "Commercial pilot, designer, civic news operator. Filed from KOXR.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Approach to Watch Duty — Finn Bennett",
    description:
      "Commercial pilot, designer, civic news operator. Filed from KOXR.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${libreCaslon.variable} ${jetbrainsMono.variable}`}
        style={{
          fontFamily: "var(--font-inter), system-ui, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
