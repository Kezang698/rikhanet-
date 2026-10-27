import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./theme.css";
import "./maps.css";
import "./responsive.css";
import { AppProvider } from "@/components/AppProvider";
export const metadata: Metadata = {
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
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
