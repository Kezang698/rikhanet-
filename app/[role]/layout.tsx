import { notFound } from "next/navigation";
import Shell from "@/components/Shell";

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ role: "admin" }, { role: "ranger" }];
}

export default async function RoleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  if (role !== "admin" && role !== "ranger") notFound();
  return <Shell role={role}>{children}</Shell>;
}
