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

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login/organiser");
  };

  return (
    <aside
      className={`hidden md:flex flex-col sticky top-0 h-screen py-6 space-y-2 bg-surface-container-low border-r border-outline-variant shrink-0 z-20 transition-[width] duration-300 relative ${
        isCollapsed ? "w-20 px-2" : "w-64 px-4"
      }`}
    >
      {/* Smoothened < or > Arrow Toggle Button in the Middle of the Sidebar */}
      <button
        onClick={toggleCollapse}
        type="button"
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute top-1/2 -right-3.5 -translate-y-1/2 w-7 h-7 bg-white border border-outline-variant rounded-full shadow-md hover:shadow-lg flex items-center justify-center text-on-surface-variant hover:text-primary hover:scale-110 active:scale-95 transition-all cursor-pointer z-30"
      >
        <span className="material-symbols-outlined text-[18px] select-none leading-none">
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
  );
}
