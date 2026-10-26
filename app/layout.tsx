import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./theme.css";
import "./maps.css";
import "./responsive.css";
export const metadata: Metadata = {
  title: "RiKhaNET | Wildlife monitoring",
  description:
    "RiKhaNET frontend demonstration for the wildlife detection and prediction proposal.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
