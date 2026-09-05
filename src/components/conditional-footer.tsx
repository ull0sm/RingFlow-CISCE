"use client";

import { usePathname } from "next/navigation";
import { FooterDemo } from "@/components/footer-demo";

export function ConditionalFooter() {
  const pathname = usePathname();
  // Don't render footer on admin, moderator, or organiser dashboards to preserve full screen height
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/moderator") ||
    pathname.startsWith("/organiser")
  ) {
    return null;
  }

  return <FooterDemo />;
}
