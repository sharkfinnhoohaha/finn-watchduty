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
  title: "Finn Bennett — for Watch Duty",
  description:
    "Three signals from one operator. Web. Flight. Public information.",
  authors: [{ name: "Finn Bennett" }],
  openGraph: {
    title: "Finn Bennett — for Watch Duty",
    description: "Three signals from one operator. Web. Flight. Public information.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Finn Bennett — for Watch Duty",
    description: "Three signals from one operator. Web. Flight. Public information.",
  },
  robots: { index: true, follow: true },
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
