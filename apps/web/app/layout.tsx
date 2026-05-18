import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "@/components/providers";
import { GlobalKeyboardHandler } from "@/components/app/global-keyboard-handler";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lore",
  description: "Institutional memory layer for BMAD-driven development",
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('lore-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <Providers>
          {children}
          <GlobalKeyboardHandler />
        </Providers>
      </body>
    </html>
  );
};

export default RootLayout;
