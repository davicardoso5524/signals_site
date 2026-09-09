import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signals",
  description:
    "A focused desktop app for voice, screen sharing and persistent rooms.",
  openGraph: {
    title: "Signals — Communication without the clutter",
    description:
      "A focused desktop app for voice, screen sharing and persistent rooms.",
    type: "website",
  },
  icons: {
    icon: "/signals-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
