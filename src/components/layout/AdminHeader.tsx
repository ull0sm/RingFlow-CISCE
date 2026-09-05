export default function AdminHeader({ title, eventName }: { title: string; eventName?: string }) {
  return (
    <header className="flex justify-between items-center w-full px-margin-desktop h-16 bg-surface-container-lowest border-b border-outline-variant shrink-0 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <h2 className="font-headline-sm text-headline-sm text-primary">{title}</h2>
        {eventName && (
          <div className="flex items-center gap-2 ml-4 pl-4 border-l border-outline-variant">
            <span className="material-symbols-outlined text-secondary text-sm">event</span>
            <span className="font-label-caps text-label-caps text-on-surface-variant tracking-wider">{eventName}</span>
          </div>
        )}
      </div>

      <div className="flex items-center">
        <a
          href="https://cruxstudios.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1B1815] hover:bg-black text-[#F5F3EC] border border-[#E1DDCF]/40 hover:border-cyan-400/60 shadow-[0_2px_8px_rgba(27,24,21,0.12)] hover:shadow-[0_0_15px_rgba(0,229,255,0.25)] hover:-translate-y-0.5 transition-all duration-300"
        >
          <span className="font-['Inter',sans-serif] font-medium text-[11px] text-[#F5F3EC]/90 group-hover:text-white transition-colors">
            Developed by
          </span>
          <div className="flex items-center gap-1.5">
            <img
              src="https://cruxstudios.dev/favicon.svg"
              alt="CruxStudios"
              className="h-4 w-4 drop-shadow-[0_0_6px_rgba(0,229,255,0.7)] group-hover:scale-110 group-hover:rotate-6 transition-all duration-300"
            />
            <span className="font-['Plus_Jakarta_Sans',sans-serif] font-black text-[12.5px] text-white tracking-tight group-hover:text-[#00E5FF] transition-colors">
              CruxStudios
            </span>
          </div>
          <svg
            className="w-3 h-3 text-[#F5F3EC]/80 group-hover:text-[#00E5FF] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300"
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
