"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useParams, useRouter } from "next/navigation";
import { RingFlowLogo } from "@/components/ui/ringflow-logo";
import { createClient } from "@/utils/supabase/client";

export default function OrganiserSidebar() {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string || "";
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("ringflow_sidebar_collapsed");
    if (saved !== null) {
      setIsCollapsed(saved === "true");
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("ringflow_sidebar_collapsed", String(next));
      return next;
    });
  };

  const navItems = [
    { name: "Dashboard", href: `/organiser/event/${id}/dashboard`, icon: "dashboard" },
    { name: "Tatami Balancing", href: `/organiser/event/${id}/rings/balance`, icon: "balance" },
    { name: "Categories", href: `/organiser/event/${id}/categories`, icon: "category" },
    { name: "Students", href: `/organiser/event/${id}/athletes`, icon: "groups" },
  ];

  // Active session watcher: kicks out the organiser if an admin revokes their session
  useEffect(() => {
    let isCleanedUp = false;
    const supabase = createClient();

    const handleRevoked = () => {
      document.cookie = "org_token=; path=/; max-age=0; SameSite=Strict";
      router.push("/login/organiser?reason=revoked");
    };

    const checkSession = async (token: string) => {
      const { data: request, error } = await supabase
        .from("organiser_requests")
        .select("status, expires_at")
        .eq("session_token", token)
        .maybeSingle();

      if (isCleanedUp) return;

      if (error || !request || request.status !== "approved" || (request.expires_at && new Date(request.expires_at).getTime() < Date.now())) {
        handleRevoked();
      }
    };

    let interval: NodeJS.Timeout | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const init = async () => {
      // If user is an authenticated admin, do not kick out or poll
      const { data: { user } } = await supabase.auth.getUser();
      if (user || isCleanedUp) return;

      const match = typeof document !== "undefined" ? document.cookie.match(/(?:^|; )org_token=([^;]*)/) : null;
      const token = match ? decodeURIComponent(match[1]) : null;

      if (!token) {
        router.push("/login/organiser");
        return;
      }

      // Check immediately on mount
      await checkSession(token);
      if (isCleanedUp) return;

      // Realtime listener: instant kick-out when admin updates the request status
      channel = supabase
        .channel(`org_session_${token.slice(0, 8)}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "organiser_requests",
            filter: `session_token=eq.${token}`,
          },
          (payload: { new: Record<string, unknown> }) => {
            if (payload?.new?.status !== "approved") {
              handleRevoked();
            }
          }
        )
        .subscribe();

      // Relaxed fallback poll every 30s (down from 4s) in case WebSocket disconnected
      interval = setInterval(() => checkSession(token), 30000);
    };

    init();

    return () => {
      isCleanedUp = true;
      if (interval) clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [router]);

  const handleLogout = async () => {
    document.cookie = "org_token=; path=/; max-age=0; SameSite=Strict";
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login/organiser");
  };

  return (
    <>
      <aside
      className={`hidden md:flex flex-col sticky top-0 h-screen py-6 space-y-2 bg-surface-container-low border-r border-outline-variant shrink-0 z-40 transition-[width] duration-300 relative ${
        isCollapsed ? "w-20 px-2" : "w-64 px-4"
      }`}
    >
      {/* Pop-out black button with white arrow centered on sidebar border */}
      <button
        onClick={toggleCollapse}
        type="button"
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute top-1/2 -right-4 -translate-y-1/2 w-8 h-8 bg-black border-2 border-white/90 rounded-full shadow-xl flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all cursor-pointer z-50"
      >
        <span className="material-symbols-outlined text-[20px] select-none leading-none text-white">
          {isCollapsed ? "chevron_right" : "chevron_left"}
        </span>
      </button>

      {/* Brand Header */}
      {isCollapsed ? (
        <div className="flex flex-col items-center mb-8">
          <Link href="/organiser" title="RingFlow - Organiser Portal" className="flex items-center justify-center">
            <RingFlowLogo className="h-8 w-8 text-primary shrink-0" />
          </Link>
        </div>
      ) : (
        <div className="px-2 mb-8">
          <Link href="/organiser" className="flex items-center gap-2.5 group">
            <RingFlowLogo className="h-8 w-8 text-primary group-hover:scale-105 transition-transform shrink-0" />
            <span className="font-headline-sm text-headline-sm font-black text-primary tracking-tight">RingFlow</span>
          </Link>
          <p className="text-[10px] font-label-caps text-on-surface-variant uppercase tracking-widest mt-1">Organiser Portal</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              title={item.name}
              className={`flex items-center rounded-lg font-bold transition-all ${
                isCollapsed ? "justify-center h-12 w-full" : "gap-3 px-4 py-3"
              } ${
                isActive
                  ? "bg-secondary-container text-on-secondary-container scale-95 duration-200"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest"
              }`}
            >
              <span className="material-symbols-outlined shrink-0 text-[22px]">{item.icon}</span>
              {!isCollapsed && (
                <span className="font-label-caps text-label-caps truncate">{item.name}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mt-auto pt-4 border-t border-outline-variant space-y-3">
        {isCollapsed ? (
          <>
            <div
              title="Tournament Organiser (Organiser Terminal)"
              className="h-10 w-10 mx-auto rounded-full bg-white border border-outline-variant flex items-center justify-center overflow-hidden shrink-0 p-1.5 shadow-sm"
            >
              <RingFlowLogo className="w-full h-full text-primary" />
            </div>
            <button
              onClick={handleLogout}
              type="button"
              title="Logout"
              className="w-full h-10 flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container/10 transition-all rounded-lg cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 px-2">
              <div className="h-10 w-10 rounded-full bg-white border border-outline-variant flex items-center justify-center overflow-hidden shrink-0 p-1.5 shadow-sm">
                <RingFlowLogo className="w-full h-full text-primary" />
              </div>
              <div className="overflow-hidden min-w-0">
                <p className="font-body-md font-bold text-sm text-on-surface truncate">Tournament Organiser</p>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider truncate">Organiser Terminal</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              type="button"
              className="w-full flex items-center gap-3 px-4 py-2 text-on-surface-variant hover:text-error hover:bg-error-container/10 transition-all rounded-lg cursor-pointer text-left"
            >
              <span className="material-symbols-outlined">logout</span>
              <span className="font-label-caps text-label-caps">Logout</span>
            </button>
          </>
        )}
      </div>
    </aside>

    {/* Mobile Bottom Navigation Bar (md:hidden) */}
    <nav className="md:hidden fixed bottom-0 left-0 w-full bg-surface-container-lowest border-t border-outline-variant z-50 flex items-center justify-around px-2 py-1.5 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.name}
            href={item.href}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-lg transition-colors ${
              isActive
                ? "text-secondary font-bold"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
            <span className="text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap">{item.name}</span>
          </Link>
        );
      })}
    </nav>
  </>
  );
}
