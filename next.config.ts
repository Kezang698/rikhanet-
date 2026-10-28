import type { NextConfig } from "next";
const config: NextConfig = {
  images: { unoptimized: true },
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/inference": ["./inference/*.py", "./final.pt"],
  },
  outputFileTracingExcludes: {
    "/*": ["./backend/**/*", "./elephant_gps_in_gewogs.*", "./*.xlsx", "./*.zip", "./*.ckpt"],
  },
};
export default config;
