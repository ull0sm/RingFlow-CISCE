"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { RingFlowLogo } from "@/components/ui/ringflow-logo";

export default function AdminSidebar() {
  const pathname = usePathname();
  const params = useParams();
  const id = params.id as string || "123";
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
    { name: "Dashboard", href: `/admin/event/${id}/dashboard`, icon: "dashboard" },
    { name: "Tatami Balancing", href: `/admin/event/${id}/rings/balance`, icon: "balance" },
    { name: "Categories", href: `/admin/event/${id}/categories`, icon: "category" },
    { name: "Athletes", href: `/admin/event/${id}/athletes`, icon: "groups" },
    { name: "Tatamis", href: `/admin/event/${id}/rings`, icon: "grid_view" },
    { name: "Settings", href: `/admin/event/${id}/settings`, icon: "settings" },
  ];

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
          <Link href="/admin" title="RingFlow - Admin Terminal" className="flex items-center justify-center">
            <RingFlowLogo className="h-8 w-8 text-primary shrink-0" />
          </Link>
        </div>
      ) : (
        <div className="px-2 mb-8">
          <Link href="/admin" className="flex items-center gap-2.5 group">
            <RingFlowLogo className="h-8 w-8 text-primary group-hover:scale-105 transition-transform shrink-0" />
            <span className="font-headline-sm text-headline-sm font-black text-primary tracking-tight">RingFlow</span>
          </Link>
          <p className="text-[10px] font-label-caps text-on-surface-variant uppercase tracking-widest mt-1">Admin Terminal</p>
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
              title="Team Crux (Tech Ops Lead)"
              className="h-10 w-10 mx-auto rounded-full bg-white border border-outline-variant flex items-center justify-center overflow-hidden shrink-0 p-1.5 shadow-sm"
            >
              <RingFlowLogo className="w-full h-full text-primary" />
            </div>
            <Link
              href="/login/admin"
              title="Logout"
              className="w-full h-10 flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container/10 transition-all rounded-lg"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </Link>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 px-2">
              <div className="h-10 w-10 rounded-full bg-white border border-outline-variant flex items-center justify-center overflow-hidden shrink-0 p-1.5 shadow-sm">
                <RingFlowLogo className="w-full h-full text-primary" />
              </div>
              <div className="overflow-hidden min-w-0">
                <p className="font-body-md font-bold text-sm text-on-surface truncate">Team Crux</p>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider truncate">Tech Ops Lead</p>
              </div>
            </div>
            <Link
              href="/login/admin"
              className="flex items-center gap-3 px-4 py-2 text-on-surface-variant hover:text-error hover:bg-error-container/10 transition-all rounded-lg"
            >
              <span className="material-symbols-outlined">logout</span>
              <span className="font-label-caps text-label-caps">Logout</span>
            </Link>
          </>
        )}
      </div>
    </aside>
  );
}
