import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Archivo, Martian_Mono } from "next/font/google";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { ThemeProvider } from "@/components/app/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

// Brand faces per kinolab.ai: Archivo (display + UI, variable width) and
// Martian Mono (codes, labels, filenames).
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  axes: ["wdth"],
});
const martianMono = Martian_Mono({
  subsets: ["latin"],
  variable: "--font-martian-mono",
});

export const metadata: Metadata = {
  title: "Kinolab",
  description: "Film production, built for the age of AI",
};

// Browser chrome colour per scheme (Next 15 keeps themeColor under `viewport`,
// not `metadata`). The values are the two page backgrounds in globals.css.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d11" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ConvexAuthNextjsServerProvider>
      {/* suppressHydrationWarning: next-themes sets the theme class and
          color-scheme on <html> before React hydrates (no flash of the wrong
          theme), which is a deliberate server/client attribute difference. */}
      <html
        lang="en"
        suppressHydrationWarning
        className={cn("font-sans", archivo.variable, martianMono.variable)}
      >
        <body>
          <ThemeProvider>
            <ConvexClientProvider>{children}</ConvexClientProvider>
            <Toaster position="bottom-right" />
          </ThemeProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
