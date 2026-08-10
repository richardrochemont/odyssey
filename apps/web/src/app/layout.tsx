import React from "react";
import "./globals.css";
import Providers from "./providers";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Odyssey Command Center",
  description: "Refined private portfolio operating system for self-managing residential landlords.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-foreground antialiased min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
