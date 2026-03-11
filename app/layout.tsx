import type { Metadata } from "next";
import "./globals.css";
import { PwaBootstrap } from "@/components/PwaBootstrap";

export const metadata: Metadata = {
  title: "Hide & Seek: Urban Ops",
  description: "Real-world strategy chase game PWA"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><PwaBootstrap />{children}</body>
    </html>
  );
}
