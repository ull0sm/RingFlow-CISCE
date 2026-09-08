"use client";

import React, { useState, useEffect } from "react";

function CountUp({ end, duration = 1500 }: { end: number; duration?: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    let animationFrameId: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [end, duration]);

  return <>{count}</>;
}

export default function PublicStats() {
  return (
    <section className="bg-[#1B1815] text-[#F5F3EC] py-8 md:py-10 border-b border-[#E1DDCF]/20 font-['Inter',sans-serif] relative">
      <div className="max-w-7xl 2xl:max-w-[1560px] mx-auto px-6 md:px-8 lg:px-12 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
        <div className="flex items-center justify-center md:justify-start gap-4 lg:gap-5">
          <span className="font-['Bebas_Neue',sans-serif] text-4xl sm:text-5xl lg:text-6xl text-[#F5F3EC] leading-none min-w-[2.5rem] tracking-wider">
            <CountUp end={28} />
          </span>
          <span className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-[#A19C90] uppercase tracking-widest text-xs md:text-sm">
            Upcoming Events
          </span>
        </div>
        <div className="flex items-center justify-center gap-4 lg:gap-5 border-y md:border-y-0 md:border-x border-white/10 py-5 md:py-0">
          <span className="font-['Bebas_Neue',sans-serif] text-4xl sm:text-5xl lg:text-6xl text-[#F5F3EC] leading-none min-w-[2rem] tracking-wider">
            <CountUp end={12} />
          </span>
          <span className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-[#A19C90] uppercase tracking-widest text-xs md:text-sm">
            Active Cities
          </span>
        </div>
        <div className="flex items-center justify-center md:justify-end gap-4 lg:gap-5">
          <span className="font-['Bebas_Neue',sans-serif] text-4xl sm:text-5xl lg:text-6xl text-[#F5F3EC] leading-none min-w-[1.5rem] tracking-wider">
            <CountUp end={4} />
          </span>
          <span className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-[#A19C90] uppercase tracking-widest text-xs md:text-sm">
            Participating Regions
          </span>
        </div>
      </div>
      <div className="max-w-7xl 2xl:max-w-[1560px] mx-auto px-6 md:px-8 lg:px-12 text-right mt-3 -mb-2">
        <p className="text-[10px] md:text-xs text-[#A19C90]/50 tracking-wider">
          * Representative numbers displayed for branding illustration purposes.
        </p>
      </div>
    </section>
  );
}
