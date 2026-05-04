import type { Metadata } from "next";
import { Public_Sans, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  variable: "--font-barlow",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Logic Model Wizard",
  description: "AI-powered Logic Model Architect",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${publicSans.variable} ${barlowCondensed.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
