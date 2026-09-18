import type { Metadata } from "next";
import { Google_Sans, Manrope, Lora } from "next/font/google";
import { getAppUrl } from "@/app/server-config";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const lora = Lora({ variable: "--font-lora", subsets: ["latin"] });
const googleSans = Google_Sans({
  variable: "--font-google-sans",
  subsets: ["latin"],
  weight: "variable",
  style: ["normal", "italic"],
  display: "swap",
  axes: ["opsz"],
});

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const baseUrl = getAppUrl();
  const description =
    "Informasi Desa Cipeundeuy, termasuk profil desa, kabar, UMKM, dan layanan warga.";

  return {
    metadataBase: baseUrl,
    title: "Portal Desa Cipeundeuy",
    description,
    icons: {
      icon: "/logo-kabupaten-bandung-barat.png",
      shortcut: "/logo-kabupaten-bandung-barat.png",
      apple: "/logo-kabupaten-bandung-barat.png",
    },
    openGraph: {
      title: "Portal Desa Cipeundeuy",
      description,
      type: "website",
      images: [
        {
          url: "/og.png",
          width: 1672,
          height: 941,
          alt: "Portal Desa Cipeundeuy",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Portal Desa Cipeundeuy",
      description,
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.3.0/css/all.min.css"
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
      <body className={`${manrope.variable} ${lora.variable} ${googleSans.variable}`}>
        {children}
      </body>
    </html>
  );
}
