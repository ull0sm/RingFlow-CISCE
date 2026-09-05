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

  return (
    <footer className="w-full mt-12 pt-8 border-t border-outline-variant/60">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-outline-variant/40">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 shrink-0">
              <span className="material-symbols-outlined text-2xl">support_agent</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-base md:text-lg font-bold text-on-surface flex items-center gap-2">
                Notice an issue or need immediate assistance?
              </h3>
              <p className="text-xs md:text-sm text-on-surface-variant mt-0.5 max-w-2xl">
                If you see anything wrong in this tournament (schedule delays, tatami assignment conflicts, score disputes) or want to contact anyone, reach out to the operations team:
              </p>
            </div>
          </div>

          {(!revealed.ullas || !revealed.prateek || !revealed.mail) && (
            <button
              type="button"
              onClick={revealAll}
              className="inline-flex items-center gap-1.5 self-start md:self-center px-3.5 py-1.5 bg-secondary text-on-secondary rounded-lg text-xs font-bold shadow-xs hover:opacity-95 active:scale-95 transition-all cursor-pointer shrink-0"
              title="Reveal all contact numbers and email"
            >
              <span className="material-symbols-outlined text-[16px]">visibility</span>
              Reveal All Contacts
            </button>
          )}
        </div>

        {/* Contact Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
          {/* Ullas Card */}
          <div className="p-4 bg-surface-container-low border border-outline-variant/60 rounded-xl flex flex-col justify-between gap-3 hover:border-secondary/40 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                  U
                </div>
                <div>
                  <h4 className="font-bold text-sm text-primary">Ullas</h4>
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
                    Ops & Support
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-outline text-[18px]">call</span>
            </div>

            <div className="mt-1">
              {revealed.ullas && ullasPhone ? (
                <div className="flex items-center justify-between bg-white border border-outline-variant/80 rounded-lg p-2">
                  <a
                    href={`tel:${ullasPhone.replace(/\s+/g, "")}`}
                    className="font-data-mono text-xs font-bold text-primary hover:text-secondary flex items-center gap-1.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px] text-green-600">phone_in_talk</span>
                    {ullasPhone}
                  </a>
                  <button
                    type="button"
                    onClick={() => handleCopy(ullasPhone, "ullas")}
                    className="p-1 text-outline hover:text-primary hover:bg-surface-container-highest rounded transition-colors cursor-pointer"
                    title="Copy phone number"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {copiedKey === "ullas" ? "check" : "content_copy"}
                    </span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => reveal("ullas")}
                  className="w-full py-2 px-3 bg-surface-container-highest hover:bg-surface-container-high border border-outline-variant/60 rounded-lg text-xs font-semibold text-on-surface flex items-center justify-between group transition-all cursor-pointer"
                >
                  <span className="font-data-mono text-outline">+91 ••••• 8404</span>
                  <span className="text-[11px] font-bold text-secondary flex items-center gap-1 group-hover:underline">
                    <span className="material-symbols-outlined text-[13px]">visibility</span>
                    Show Number
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Prateek Card */}
          <div className="p-4 bg-surface-container-low border border-outline-variant/60 rounded-xl flex flex-col justify-between gap-3 hover:border-secondary/40 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                  P
                </div>
                <div>
                  <h4 className="font-bold text-sm text-primary">Prateek</h4>
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
                    Ops & Support
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-outline text-[18px]">call</span>
            </div>

            <div className="mt-1">
              {revealed.prateek && prateekPhone ? (
                <div className="flex items-center justify-between bg-white border border-outline-variant/80 rounded-lg p-2">
                  <a
                    href={`tel:${prateekPhone.replace(/\s+/g, "")}`}
                    className="font-data-mono text-xs font-bold text-primary hover:text-secondary flex items-center gap-1.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px] text-green-600">phone_in_talk</span>
                    {prateekPhone}
                  </a>
                  <button
                    type="button"
                    onClick={() => handleCopy(prateekPhone, "prateek")}
                    className="p-1 text-outline hover:text-primary hover:bg-surface-container-highest rounded transition-colors cursor-pointer"
                    title="Copy phone number"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {copiedKey === "prateek" ? "check" : "content_copy"}
                    </span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => reveal("prateek")}
                  className="w-full py-2 px-3 bg-surface-container-highest hover:bg-surface-container-high border border-outline-variant/60 rounded-lg text-xs font-semibold text-on-surface flex items-center justify-between group transition-all cursor-pointer"
                >
                  <span className="font-data-mono text-outline">+91 ••••• 6242</span>
                  <span className="text-[11px] font-bold text-secondary flex items-center gap-1 group-hover:underline">
                    <span className="material-symbols-outlined text-[13px]">visibility</span>
                    Show Number
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Email Card */}
          <div className="p-4 bg-surface-container-low border border-outline-variant/60 rounded-xl flex flex-col justify-between gap-3 hover:border-secondary/40 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-secondary/10 text-secondary font-bold text-xs flex items-center justify-center">
                  @
                </div>
                <div>
                  <h4 className="font-bold text-sm text-primary">CruxStudios</h4>
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
                    Official Support Desk
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-outline text-[18px]">mail</span>
            </div>

            <div className="mt-1">
              {revealed.mail && supportMail ? (
                <div className="flex items-center justify-between bg-white border border-outline-variant/80 rounded-lg p-2 gap-2">
                  <a
                    href={`mailto:${supportMail}`}
                    className="font-data-mono text-xs font-bold text-primary hover:text-secondary flex items-center gap-1.5 transition-colors min-w-0"
                    title={supportMail}
                  >
                    <span className="material-symbols-outlined text-[14px] text-blue-600 shrink-0">outgoing_mail</span>
                    <span className="whitespace-nowrap select-all">{supportMail}</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => handleCopy(supportMail, "mail")}
                    className="p-1 text-outline hover:text-primary hover:bg-surface-container-highest rounded transition-colors shrink-0 cursor-pointer"
                    title="Copy email"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {copiedKey === "mail" ? "check" : "content_copy"}
                    </span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => reveal("mail")}
                  className="w-full py-2 px-3 bg-surface-container-highest hover:bg-surface-container-high border border-outline-variant/60 rounded-lg text-xs font-semibold text-on-surface flex items-center justify-between group transition-all cursor-pointer"
                >
                  <span className="font-data-mono text-outline">c•••••@cruxstudios.dev</span>
                  <span className="text-[11px] font-bold text-secondary flex items-center gap-1 group-hover:underline">
                    <span className="material-symbols-outlined text-[13px]">visibility</span>
                    Show Email
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-outline-variant/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-on-surface-variant">
          <span className="text-[11px]">
            Protected with anti-scraping obfuscation to prevent bot harvesting.
          </span>
          <a
            href="https://cruxstudios.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant hover:text-primary transition-colors"
          >
            <span>Powered by</span>
            <span className="font-bold group-hover:underline text-primary">CruxStudios</span>
            <span className="material-symbols-outlined text-[12px]">open_in_new</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
