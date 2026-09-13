"use client";

import React, { useState } from "react";

// Obfuscated contact payloads (reversed base64 to prevent static bot scraping & crawler regex)
const ENCODED_CONTACTS = {
  ullas: "0ADN4EDIyQjNzYDIxkzK",
  prateek: "yQjM2cDIxADOzkDIxkzK",
  mail: "=YXZk5ycvlGZ1R3c4VncjBEdjFGdu92Y",
};

function decodePayload(encoded: string): string {
  if (typeof window === "undefined") return "";
  try {
    return atob(encoded.split("").reverse().join(""));
  } catch {
    return "";
  }
}

export default function OverviewSupportFooter() {
  const [revealed, setRevealed] = useState<{ ullas: boolean; prateek: boolean; mail: boolean }>({
    ullas: false,
    prateek: false,
    mail: false,
  });

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const reveal = (key: "ullas" | "prateek" | "mail") => {
    setRevealed(prev => ({ ...prev, [key]: true }));
  };

  const revealAll = () => {
    setRevealed({ ullas: true, prateek: true, mail: true });
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const ullasPhone = revealed.ullas ? decodePayload(ENCODED_CONTACTS.ullas) : null;
  const prateekPhone = revealed.prateek ? decodePayload(ENCODED_CONTACTS.prateek) : null;
  const supportMail = revealed.mail ? decodePayload(ENCODED_CONTACTS.mail) : null;

  const allRevealed = revealed.ullas && revealed.prateek && revealed.mail;

  return (
    <footer className="w-full mt-8 pt-2 pb-6">
      <div className="bg-white border border-[#E7EAEF] rounded-xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3.5 border-b border-[#E7EAEF]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#F1F3F5] text-[#475569] flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <div>
              <h4 className="text-[13px] font-semibold text-[#0F172A] leading-tight">
                Operations &amp; Tournament Support
              </h4>
              <p className="text-[11.5px] text-[#64748B] mt-0.5 leading-none">
                For schedule delays, tatami conflicts, or match scoring disputes
              </p>
            </div>
          </div>

          <div className="shrink-0 self-start sm:self-auto">
            {!allRevealed ? (
              <button
                type="button"
                onClick={revealAll}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#D8DCE3] bg-white hover:bg-[#F8FAFC] text-[#0F172A] text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 text-[#64748B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span>Reveal all</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#16A34A]">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Contacts revealed
              </span>
            )}
          </div>
        </div>

        {/* 3 Contact Items */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3.5">
          {/* Ullas */}
          <div className="flex items-center justify-between p-2.5 px-3 rounded-lg border border-[#E7EAEF] hover:border-[#D8DCE3] bg-[#FAFAFB] transition-colors">
            <div className="min-w-0 mr-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[#0F172A]">Ullas</span>
                <span className="text-[11px] text-[#94A3B8]">· Operations</span>
              </div>
              <div className="mt-0.5">
                {revealed.ullas && ullasPhone ? (
                  <a
                    href={`tel:${ullasPhone.replace(/\s+/g, "")}`}
                    className="font-mono text-xs font-medium text-[#0F172A] hover:text-[#0284C7] transition-colors"
                  >
                    {ullasPhone}
                  </a>
                ) : (
                  <span className="font-mono text-xs text-[#94A3B8]">+91 ••••• 8404</span>
                )}
              </div>
            </div>

            <div className="shrink-0">
              {revealed.ullas && ullasPhone ? (
                <button
                  type="button"
                  onClick={() => handleCopy(ullasPhone, "ullas")}
                  className="p-1 rounded text-[#94A3B8] hover:text-[#0F172A] hover:bg-white transition-colors cursor-pointer"
                  title="Copy phone number"
                >
                  {copiedKey === "ullas" ? (
                    <span className="text-[11px] font-semibold text-[#16A34A]">Copied</span>
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => reveal("ullas")}
                  className="text-[11.5px] font-semibold text-[#0F172A] hover:underline px-2 py-0.5 rounded hover:bg-white border border-transparent hover:border-[#D8DCE3] transition-colors cursor-pointer"
                >
                  Show
                </button>
              )}
            </div>
          </div>

          {/* Prateek */}
          <div className="flex items-center justify-between p-2.5 px-3 rounded-lg border border-[#E7EAEF] hover:border-[#D8DCE3] bg-[#FAFAFB] transition-colors">
            <div className="min-w-0 mr-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[#0F172A]">Prateek</span>
                <span className="text-[11px] text-[#94A3B8]">· Operations</span>
              </div>
              <div className="mt-0.5">
                {revealed.prateek && prateekPhone ? (
                  <a
                    href={`tel:${prateekPhone.replace(/\s+/g, "")}`}
                    className="font-mono text-xs font-medium text-[#0F172A] hover:text-[#0284C7] transition-colors"
                  >
                    {prateekPhone}
                  </a>
                ) : (
                  <span className="font-mono text-xs text-[#94A3B8]">+91 ••••• 6242</span>
                )}
              </div>
            </div>

            <div className="shrink-0">
              {revealed.prateek && prateekPhone ? (
                <button
                  type="button"
                  onClick={() => handleCopy(prateekPhone, "prateek")}
                  className="p-1 rounded text-[#94A3B8] hover:text-[#0F172A] hover:bg-white transition-colors cursor-pointer"
                  title="Copy phone number"
                >
                  {copiedKey === "prateek" ? (
                    <span className="text-[11px] font-semibold text-[#16A34A]">Copied</span>
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => reveal("prateek")}
                  className="text-[11.5px] font-semibold text-[#0F172A] hover:underline px-2 py-0.5 rounded hover:bg-white border border-transparent hover:border-[#D8DCE3] transition-colors cursor-pointer"
                >
                  Show
                </button>
              )}
            </div>
          </div>

          {/* CruxStudios */}
          <div className="flex items-center justify-between p-2.5 px-3 rounded-lg border border-[#E7EAEF] hover:border-[#D8DCE3] bg-[#FAFAFB] transition-colors">
            <div className="min-w-0 mr-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[#0F172A]">CruxStudios</span>
                <span className="text-[11px] text-[#94A3B8]">· Support Desk</span>
              </div>
              <div className="mt-0.5">
                {revealed.mail && supportMail ? (
                  <a
                    href={`mailto:${supportMail}`}
                    className="font-mono text-xs font-medium text-[#0F172A] hover:text-[#0284C7] transition-colors truncate block"
                    title={supportMail}
                  >
                    {supportMail}
                  </a>
                ) : (
                  <span className="font-mono text-xs text-[#94A3B8] truncate block">c•••••@cruxstudios.dev</span>
                )}
              </div>
            </div>

            <div className="shrink-0">
              {revealed.mail && supportMail ? (
                <button
                  type="button"
                  onClick={() => handleCopy(supportMail, "mail")}
                  className="p-1 rounded text-[#94A3B8] hover:text-[#0F172A] hover:bg-white transition-colors cursor-pointer"
                  title="Copy email"
                >
                  {copiedKey === "mail" ? (
                    <span className="text-[11px] font-semibold text-[#16A34A]">Copied</span>
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => reveal("mail")}
                  className="text-[11.5px] font-semibold text-[#0F172A] hover:underline px-2 py-0.5 rounded hover:bg-white border border-transparent hover:border-[#D8DCE3] transition-colors cursor-pointer"
                >
                  Show
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer info line */}
        <div className="mt-3.5 pt-3 border-t border-[#E7EAEF] flex items-center justify-between text-[11px] text-[#94A3B8]">
          <span>Protected with anti-scraping obfuscation to prevent bot harvesting.</span>
          <a
            href="https://cruxstudios.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#0F172A] transition-colors inline-flex items-center gap-1 font-medium"
          >
            <span>Powered by CruxStudios</span>
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
