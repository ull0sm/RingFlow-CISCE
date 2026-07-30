"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { adjustMatchCount, finishCategory, setRingStatus, returnCategoryToQueue, logRingEvent, logoutModerator } from "@/actions/moderator";
import MatchTimer from "@/components/moderator/MatchTimer";

export default function ModeratorCurrentClient({ ringId, initialAssignments, allAthletes }: { ringId: string, initialAssignments: any[], allAthletes: any[] }) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAssistanceModal, setShowAssistanceModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnConfirmText, setReturnConfirmText] = useState("");
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [syncErrorModal, setSyncErrorModal] = useState<{ title: string; message: string; isUnauthorized: boolean } | null>(null);
  const [showAdvancedModalOptions, setShowAdvancedModalOptions] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase.channel(`current_${ringId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'category_assignments',
        filter: `ring_id=eq.${ringId}`
      }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setAssignments(prev => {
            const idx = prev.findIndex(a => a.id === payload.new.id);
            if (idx > -1) {
              const copy = [...prev];
              copy[idx] = { ...copy[idx], ...payload.new };
              return copy;
            }
            return prev;
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ringId, supabase]);

  const activeAssignment = assignments.find(a => a.status === 'running' || a.status === 'paused');

  if (!activeAssignment) {
    return (
      <section className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-24 h-24 bg-surface-container rounded-full flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-4xl text-outline" style={{ fontVariationSettings: '"FILL" 1' }}>event_busy</span>
        </div>
        <h2 className="font-headline-sm text-headline-sm mb-2">No category running</h2>
        <p className="text-on-surface-variant mb-8 max-w-sm">Please initialize the next category from the Queue to begin.</p>
        <button
          onClick={() => router.push(`/moderator/ring/${ringId}/queue`)}
          className="bg-primary text-on-primary px-8 py-3 rounded-lg font-bold flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>queue</span>
          Go to Queue
        </button>
      </section>
    );
  }

  const [isUpdatingMatch, setIsUpdatingMatch] = useState(false);
  const [activeDelta, setActiveDelta] = useState<number | null>(null);
  const [clickTimestamps, setClickTimestamps] = useState<number[]>([]);
  const [spamNotice, setSpamNotice] = useState<string | null>(null);

  const handleAdjustMatch = async (delta: number) => {
    if (isUpdatingMatch || loading) return;

    const now = Date.now();
    const windowMs = 2500;
    const recent = clickTimestamps.filter(t => now - t < windowMs);

    // If 3 rapid clicks occur in short duration (2 existing + current 1), reject all!
    if (recent.length >= 2) {
      setClickTimestamps([]);
      setSpamNotice("One click = 😎 | 20 clicks = 🤡");
      setTimeout(() => setSpamNotice(null), 3500);
      return;
    }

    setClickTimestamps([...recent, now]);
    setIsUpdatingMatch(true);
    setActiveDelta(delta);

    try {
      const res = await adjustMatchCount(activeAssignment.id, ringId, delta);
      if (res && typeof res.matches_completed === 'number') {
        setAssignments(prev => {
          const idx = prev.findIndex(a => a.id === activeAssignment.id);
          if (idx > -1) {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], matches_completed: res.matches_completed };
            return copy;
          }
          return prev;
        });
      }
    } catch (e: any) {
      console.error(e);
      if (e?.message?.includes("Too many rapid attempts")) {
        setSpamNotice("Too many rapid clicks. Action rejected.");
        setTimeout(() => setSpamNotice(null), 3500);
      } else if (e?.message?.includes("Unauthorized") || e?.message?.includes("Session")) {
        setSyncErrorModal({
          title: "Session Expired",
          message: "Your moderator session is no longer active. Please re-login with your access code or reload the page.",
          isUnauthorized: true
        });
      } else {
        setSyncErrorModal({
          title: "Failed to Update Score",
          message: "💀 Score update failed. The app and server might be out of sync (or your access changed). Refresh the page, check your match count, and try again.",
          isUnauthorized: false
        });
      }
    } finally {
      setIsUpdatingMatch(false);
      setActiveDelta(null);
    }
  };

  const handleTogglePause = async () => {
    setLoading(true);
    try {
      await setRingStatus(activeAssignment.id, ringId, activeAssignment.status === 'running');
    } catch (e) {
      console.error(e);
      alert("Failed to pause/resume ring");
    } finally {
      setLoading(false);
    }
  };

  const executeCompleteCategory = async (fillExpected: boolean) => {
    setLoading(true);
    try {
      if (fillExpected) {
        const totalMatches = activeAssignment.categories?.expected_matches || 0;
        const diff = totalMatches - activeAssignment.matches_completed;
        if (diff > 0) {
          await adjustMatchCount(activeAssignment.id, ringId, diff);
        }
      }
      await finishCategory(activeAssignment.id, ringId);
      router.push(`/moderator/ring/${ringId}/queue`);
    } catch (e) {
      console.error(e);
      alert("Failed to complete category");
    } finally {
      setLoading(false);
      setShowCompleteModal(false);
      setShowSettings(false);
    }
  };

  const executeReturnToQueue = async () => {
    if (returnConfirmText !== "CONFIRM") {
      alert("Must type CONFIRM exactly to return.");
      return;
    }
    setLoading(true);
    try {
      await returnCategoryToQueue(activeAssignment.id, ringId);
      router.push(`/moderator/ring/${ringId}/queue`);
    } catch (e) {
      console.error(e);
      alert("Failed to return to queue");
    } finally {
      setLoading(false);
      setShowReturnModal(false);
      setShowSettings(false);
    }
  };

  const handleRequestAssistance = async (type: string) => {
    setShowAssistanceModal(false);
    try {
      if (type === 'Doctor / Medical') {
        setLoading(true);
        try {
          await setRingStatus(activeAssignment.id, ringId, true); // true = isPaused
        } catch (e) {
          console.error("Failed to auto-pause for doctor", e);
        } finally {
          setLoading(false);
        }
      }
      await logRingEvent(ringId, "REQUEST_ASSISTANCE", { message: `Requested: ${type}`, type });
      alert(`Assistance requested: ${type}`);
    } catch (e) {
      console.error(e);
      alert("Failed to request assistance");
    }
  };

  const handleEmergency = async () => {
    try {
      await logRingEvent(ringId, "EMERGENCY_ALERT", { message: "Critical Emergency Triggered from UI" });
      alert("Emergency alert sent to admin.");
    } catch (e) {
      console.error(e);
      alert("Failed to send emergency alert");
    }
  };

  const totalMatches = activeAssignment.categories?.expected_matches || 0;
  const currentCompleted = activeAssignment.matches_completed;
  const percentage = totalMatches > 0 ? (currentCompleted / totalMatches) * 100 : 0;
  const isPaused = activeAssignment.status === 'paused';

  return (
    <div className="space-y-0">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">Tatami Controls</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Moderator Dashboard</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-sm ${isPaused ? 'bg-error-container text-on-error-container border-error/20 border' : 'bg-success/10 text-emerald-700 border border-emerald-500/20'}`}>
          {!isPaused && (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          )}
          {isPaused && (
            <span className="flex h-2 w-2 relative">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-error"></span>
            </span>
          )}
          <span className="font-label-caps text-label-caps">{isPaused ? 'PAUSED' : 'LIVE'}</span>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-card-padding shadow-sm relative overflow-hidden mb-10">
        <div className={`absolute top-0 left-0 w-1 h-full ${isPaused ? 'bg-error' : 'bg-secondary'}`}></div>
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="font-label-caps text-label-caps text-on-surface-variant block mb-1">CURRENT CATEGORY</span>
            <h2 className="font-headline-sm text-headline-sm text-primary">{activeAssignment.categories?.name}</h2>
          </div>
          <div className="relative">
            <button onClick={() => setShowSettings(!showSettings)} className="w-10 h-10 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface transition-colors">
              <span className="material-symbols-outlined">settings</span>
            </button>
            {showSettings && (
              <div className="absolute top-12 right-0 bg-surface-container-lowest border border-outline-variant shadow-lg rounded-xl w-48 z-10 overflow-hidden">
                <button disabled={loading} onClick={() => setShowCompleteModal(true)} className="w-full text-left px-4 py-3 text-body-sm font-semibold hover:bg-surface-container flex items-center gap-2 disabled:opacity-50 text-secondary">
                  <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: '"FILL" 1' }}>check_circle</span>
                  Complete Category
                </button>
                <button disabled={loading} onClick={() => setShowReturnModal(true)} className="w-full text-left px-4 py-3 text-body-sm font-semibold hover:bg-surface-container flex items-center gap-2 disabled:opacity-50 border-t border-outline-variant text-error">
                  <span className="material-symbols-outlined text-xl">undo</span>
                  Return to Queue
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 mt-6">
          <div className="flex justify-between items-center font-body-sm text-body-sm">
            <span className="font-semibold text-primary inline-flex items-center gap-1.5">
              {currentCompleted} / {totalMatches} <span className="font-normal text-on-surface-variant">Completed</span>
              {isUpdatingMatch && (
                <span className="inline-block w-3.5 h-3.5 border-2 border-secondary border-t-transparent rounded-full animate-spin ml-1"></span>
              )}
            </span>
            <span className="text-secondary font-bold">{percentage.toFixed(0)}% Complete</span>
          </div>
          <div className={`w-full bg-surface-container-high h-2.5 rounded-full overflow-hidden ${isUpdatingMatch ? 'animate-pulse' : ''}`}>
            <div className={`${isPaused ? 'bg-error/40' : 'bg-secondary'} h-full transition-all duration-500 ease-out`} style={{ width: `${Math.min(100, percentage)}%` }}></div>
          </div>
          <div className="flex justify-between text-on-surface-variant font-label-caps text-label-caps pt-1">
            <span>{percentage > 100 ? 0 : Math.max(0, totalMatches - currentCompleted)} REMAINING</span>
          </div>
        </div>
      </div>

      {/* Persistent Match Timer */}
      <MatchTimer ringId={ringId} isPaused={isPaused} />

      <section className="space-y-4 mb-10">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant">MATCH ADJUSTMENT</h3>
          {isUpdatingMatch && (
            <span className="text-xs text-secondary font-medium animate-pulse flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-secondary animate-ping"></span> Updating...
            </span>
          )}
        </div>

        {spamNotice && (
          <div className="bg-error-container/90 text-on-error-container border border-error/20 p-3 rounded-xl text-sm font-semibold flex items-center gap-2 animate-fadeIn">
            <span className="material-symbols-outlined text-base">block</span>
            <span>{spamNotice}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {[
            { delta: -1, label: "-1", colorClass: "text-primary" },
            { delta: 1, label: "+1", colorClass: "text-primary" },
            { delta: -5, label: "-5", colorClass: "text-on-surface-variant" },
            { delta: 5, label: "+5", colorClass: "text-on-surface-variant" },
          ].map(({ delta, label, colorClass }) => {
            const isThisUpdating = activeDelta === delta && isUpdatingMatch;
            const isDisabled = isPaused || loading || isUpdatingMatch;
            return (
              <button
                key={delta}
                onClick={() => handleAdjustMatch(delta)}
                disabled={isDisabled}
                className="bg-surface-container-lowest border border-outline-variant h-16 rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-surface-container shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 relative"
              >
                {isThisUpdating ? (
                  <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <span className={`font-headline-sm text-headline-sm ${colorClass}`}>{label}</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 pt-4 mb-10">
        <button
          disabled={loading}
          onClick={handleTogglePause}
          className={`w-full bg-surface-container-lowest border h-14 rounded-xl font-bold font-body-md flex items-center justify-center gap-2 transition-colors ${isPaused ? 'border-emerald-500 text-emerald-700 active:bg-emerald-50' : 'border-amber-500 text-amber-700 active:bg-amber-50'
            }`}
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>{isPaused ? 'play_circle' : 'pause_circle'}</span>
          {isPaused ? 'Resume Tatami' : 'Pause Tatami'}
        </button>
      </div>

      <div className="mt-8 bg-surface-container-low p-4 rounded-xl border border-outline-variant flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-secondary opacity-50">visibility</span>
          <div className="flex-1">
            <h4 className="font-label-caps text-label-caps text-on-surface-variant opacity-70">CURRENTLY LIVE TO PUBLIC</h4>
            <p className="font-body-sm text-body-sm text-on-surface">
              Tatami Status: <span className={`${isPaused ? 'text-error' : 'text-emerald-600'} font-semibold uppercase`}>{isPaused ? 'Paused' : 'Active'} - {activeAssignment.categories?.name}</span>
            </p>
          </div>
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-outline-variant">
          <button
            onClick={() => setShowAssistanceModal(true)}
            className="flex items-center gap-2 text-primary font-bold font-label-caps text-xs hover:bg-primary/10 px-3 py-2 rounded transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">support_agent</span> Request Assistance
          </button>

          <button
            onClick={handleEmergency}
            className="flex items-center gap-1 text-error font-bold font-label-caps text-[10px] opacity-60 hover:opacity-100 hover:bg-error/10 px-2 py-1 rounded transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">warning</span> EMERGENCY
          </button>
        </div>
      </div>

      {/* Modals */}
      {showAssistanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-surface-container-lowest p-6 rounded-xl max-w-sm w-full space-y-4">
            <h3 className="font-headline-sm text-primary font-bold">Request Assistance</h3>
            <p className="text-body-sm text-on-surface-variant">Select the type of assistance needed for this tatami. Admin will be notified softly.</p>
            <div className="grid grid-cols-1 gap-2">
              {['Doctor / Medical', 'Technical Support', 'Security', 'General Assistance'].map(type => (
                <button
                  key={type}
                  onClick={() => handleRequestAssistance(type)}
                  className="bg-surface-container hover:bg-surface-container-high py-3 rounded font-bold text-sm border border-outline-variant"
                >
                  {type}
                </button>
              ))}
            </div>
            <button onClick={() => setShowAssistanceModal(false)} className="w-full mt-2 py-2 text-on-surface-variant font-bold text-sm">Cancel</button>
          </div>
        </div>
      )}

      {showReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-surface-container-lowest p-6 rounded-xl max-w-sm w-full space-y-4">
            <h3 className="font-headline-sm text-error font-bold">Return to Queue</h3>
            <p className="text-body-sm text-on-surface-variant">Are you sure? This will remove the category from the live tatami.</p>
            <div>
              <label className="text-[10px] font-bold text-on-surface-variant mb-1 block uppercase tracking-wider">Type CONFIRM to proceed</label>
              <input
                type="text"
                value={returnConfirmText}
                onChange={(e) => setReturnConfirmText(e.target.value)}
                className="w-full bg-surface-container border border-outline-variant p-3 rounded text-on-surface font-bold"
                placeholder="CONFIRM"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowReturnModal(false)} className="flex-1 py-3 bg-surface-container hover:bg-surface-container-high rounded font-bold text-sm text-on-surface">Cancel</button>
              <button
                onClick={executeReturnToQueue}
                disabled={returnConfirmText !== "CONFIRM" || loading}
                className="flex-1 py-3 bg-error text-white rounded font-bold text-sm disabled:opacity-50"
              >
                Return
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-surface-container-lowest p-6 rounded-xl max-w-sm w-full space-y-4">
            <h3 className="font-headline-sm text-secondary font-bold">Complete Category</h3>
            <p className="text-body-sm text-on-surface-variant">How would you like to record this category's completion?</p>
            <div className="space-y-3">
              <button
                onClick={() => executeCompleteCategory(false)}
                disabled={loading}
                className="w-full text-left p-4 bg-surface-container hover:bg-surface-container-high border border-outline-variant rounded-xl flex flex-col gap-1"
              >
                <span className="font-bold text-primary">Complete at Current State</span>
                <span className="text-xs text-on-surface-variant">Mark as finished with {currentCompleted} matches recorded.</span>
              </button>
              <button
                onClick={() => executeCompleteCategory(true)}
                disabled={loading}
                className="w-full text-left p-4 bg-surface-container hover:bg-surface-container-high border border-outline-variant rounded-xl flex flex-col gap-1"
              >
                <span className="font-bold text-secondary">Mark All Completed</span>
                <span className="text-xs text-on-surface-variant">Set matches to {totalMatches} expected matches and finish.</span>
              </button>
            </div>
            <button onClick={() => setShowCompleteModal(false)} className="w-full mt-2 py-2 text-on-surface-variant font-bold text-sm">Cancel</button>
          </div>
        </div>
      )}

      {syncErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-surface-container-lowest p-6 rounded-xl max-w-sm w-full space-y-4 shadow-xl border border-outline-variant">
            <div className="flex items-center gap-3 text-error">
              <span className="material-symbols-outlined text-3xl">warning</span>
              <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">{syncErrorModal.title}</h3>
            </div>
            <p className="text-body-sm text-on-surface-variant leading-relaxed">
              {syncErrorModal.message}
            </p>
            <div className="flex flex-col gap-3 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-primary text-on-primary font-bold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-sm"
              >
                <span className="material-symbols-outlined text-lg">refresh</span>
                Reload Page
              </button>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => setShowAdvancedModalOptions(!showAdvancedModalOptions)}
                  className="text-xs text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-1 mx-auto transition-colors font-medium py-1"
                >
                  <span>More Options</span>
                  <span className="material-symbols-outlined text-base">
                    {showAdvancedModalOptions ? 'expand_less' : 'expand_more'}
                  </span>
                </button>

                {showAdvancedModalOptions && (
                  <div className="mt-3 pt-3 border-t border-outline-variant animate-fadeIn">
                    <button
                      onClick={async () => {
                        try {
                          await logoutModerator();
                        } catch (err) {
                          console.error(err);
                        }
                        router.push("/moderator/login");
                      }}
                      className="w-full py-2.5 bg-error/10 hover:bg-error/20 text-error font-semibold rounded-xl flex items-center justify-center gap-2 text-xs transition-colors border border-error/20"
                    >
                      <span className="material-symbols-outlined text-base">logout</span>
                      Logout & Re-login
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
