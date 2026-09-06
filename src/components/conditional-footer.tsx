"use client";

import { usePathname } from "next/navigation";
import { FooterDemo } from "@/components/footer-demo";

export function ConditionalFooter() {
  const pathname = usePathname();
  // Render full horizontal footer at the end of everything for organiser tatami balancing
  if (pathname.startsWith("/organiser") && pathname.includes("/rings/balance")) {
    return <FooterDemo />;
  }

  // Don't render footer on admin, moderator, or other organiser dashboards to preserve full screen height
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/moderator") ||
    pathname.startsWith("/organiser")
  ) {
    return null;
  }

  return <FooterDemo />;
}
