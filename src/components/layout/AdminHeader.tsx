export default function AdminHeader({ title, eventName }: { title: string; eventName?: string }) {
  return (
    <header className="flex justify-between items-center w-full px-4 md:px-margin-desktop h-16 bg-surface-container-lowest border-b border-outline-variant shrink-0 sticky top-0 z-10 gap-2">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 pr-2">
        <h2 className="font-headline-sm text-headline-sm text-primary truncate max-w-[140px] sm:max-w-none whitespace-nowrap">{title}</h2>
        {eventName && (
          <div className="flex items-center gap-1.5 sm:gap-2 ml-2 sm:ml-4 pl-2 sm:pl-4 border-l border-outline-variant min-w-0">
            <span className="material-symbols-outlined text-secondary text-sm shrink-0">event</span>
            <span className="font-label-caps text-label-caps text-on-surface-variant tracking-wider truncate max-w-[110px] sm:max-w-[200px] md:max-w-none whitespace-nowrap">{eventName}</span>
          </div>
        )}
      </div>

      <div className="flex items-center shrink-0">
        <a
          href="https://cruxstudios.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-[#1B1815] hover:bg-black text-[#F5F3EC] border border-[#E1DDCF]/40 hover:border-cyan-400/60 shadow-[0_2px_8px_rgba(27,24,21,0.12)] hover:shadow-[0_0_15px_rgba(0,229,255,0.25)] hover:-translate-y-0.5 transition-all duration-300"
        >
          <span className="font-['Inter',sans-serif] font-medium text-[10px] sm:text-[11px] text-[#F5F3EC]/90 group-hover:text-white transition-colors hidden sm:inline whitespace-nowrap">
            Developed by
          </span>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <img
              src="https://cruxstudios.dev/favicon.svg"
              alt="CruxStudios"
              className="h-3.5 sm:h-4 w-3.5 sm:w-4 drop-shadow-[0_0_6px_rgba(0,229,255,0.7)] group-hover:scale-110 group-hover:rotate-6 transition-all duration-300"
            />
            <span className="font-['Plus_Jakarta_Sans',sans-serif] font-black text-[11px] sm:text-[12.5px] text-white tracking-tight group-hover:text-[#00E5FF] transition-colors whitespace-nowrap">
              CruxStudios
            </span>
          </div>
          <svg
            className="w-2.5 sm:w-3 h-2.5 sm:h-3 text-[#F5F3EC]/80 group-hover:text-[#00E5FF] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300 hidden sm:block"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M7 17L17 7M17 7H7M17 7V17" />
          </svg>
        </a>
      </div>
    </header>
  );
}
