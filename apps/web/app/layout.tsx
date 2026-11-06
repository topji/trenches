import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/shell/nav";
import { Footer } from "@/components/shell/footer";
import { copy } from "@/lib/copy";
import { Providers } from "@/components/auth/providers";

const archivo = Archivo({
  subsets: ["latin"],
  weight: "variable",
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: copy.app.name, template: `%s · ${copy.app.name}` },
  description: copy.app.sub,
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = {
  themeColor: "#0E1726",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${mono.variable}`}>
      <body className="min-h-dvh flex flex-col">
        <Providers demoMode={process.env.DEMO_MODE === "true"}>
          <Nav />
          <main className="flex-1 w-full max-w-content px-4 py-8 lg:py-12">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
