"use client";

import React, { useState, useEffect } from "react";
import { addRing, regenerateRingCode } from "@/actions/rings";
import { approveModeratorRequest, rejectModeratorRequest, revokeActiveModeratorSession } from "@/actions/moderator";
import { createClient } from "@/utils/supabase/client";

type Ring = {
  id: string;
  name: string;
  ring_order: number;
  access_code: string;
};

type ModRequest = {
  id: string;
  ring_id: string;
  moderator_name: string;
  status: string;
  device_info?: any;
  created_at: string;
};

interface Props {
  tournamentId: string;
  initialRings: Ring[];
  initialModRequests?: ModRequest[];
}

export default function RingsClient({ tournamentId, initialRings, initialModRequests = [] }: Props) {
  const [rings, setRings] = useState<Ring[]>(initialRings);
  const [modRequests, setModRequests] = useState<ModRequest[]>(initialModRequests);
  const [isAdding, setIsAdding] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Realtime subscription for moderator requests
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`rings_mod_reqs_${tournamentId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'moderator_requests'
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const req = payload.new as ModRequest;
          setModRequests(prev => [req, ...prev.filter(r => r.id !== req.id)]);
        } else if (payload.eventType === 'UPDATE') {
          const req = payload.new as ModRequest;
          setModRequests(prev => prev.map(r => r.id === req.id ? req : r));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  const handleAddRing = async () => {
    setIsAdding(true);
    try {
      await addRing(tournamentId);
    } catch (err) {
      alert("Failed to add tatami.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRegenerate = async (ringId: string) => {
    setLoadingAction(`${ringId}-regen`);
    try {
      await regenerateRingCode(ringId, tournamentId);
    } catch (err) {
      alert("Failed to regenerate code.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleApprove = async (requestId: string, ringId: string) => {
    setLoadingAction(`approve-${requestId}`);
    try {
      await approveModeratorRequest(requestId, ringId, tournamentId);
    } catch (err) {
      alert("Failed to approve moderator.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setLoadingAction(`reject-${requestId}`);
    try {
      await rejectModeratorRequest(requestId, tournamentId);
    } catch (err) {
      alert("Failed to reject request.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRevokeSession = async (ringId: string) => {
    if (!confirm("Are you sure you want to log out the active moderator on this Tatami? Their session will be revoked immediately.")) {
      return;
    }
    setLoadingAction(`revoke-${ringId}`);
    try {
      await revokeActiveModeratorSession(ringId, tournamentId);
    } catch (err) {
      alert("Failed to revoke moderator session.");
    } finally {
      setLoadingAction(null);
    }
  };

  // Sync state with props
  useEffect(() => {
    setRings(initialRings);
  }, [initialRings]);

  useEffect(() => {
    setModRequests(initialModRequests);
  }, [initialModRequests]);

  return (
    <div className="flex-1 overflow-y-auto p-margin-desktop space-y-8 bg-surface">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-headline-sm text-headline-sm text-primary">Tatami Management & Access Control</h2>
          <p className="text-body-sm text-on-surface-variant">Approve incoming moderator logins, kick active sessions, and manage access codes directly on each Tatami.</p>
        </div>
        <button 
          onClick={handleAddRing} 
          disabled={isAdding}
          className="px-4 py-2 bg-primary text-white font-label-caps text-label-caps rounded flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">add</span> {isAdding ? "ADDING..." : "ADD TATAMI"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
        {rings.map(ring => {
          const ringPendingReqs = modRequests.filter(r => r.ring_id === ring.id && r.status === "pending");
          const activeApprovedReq = modRequests.find(r => r.ring_id === ring.id && r.status === "approved");

          return (
            <div key={ring.id} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col space-y-5 relative">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-headline-sm text-lg text-primary font-bold">{ring.name.replace(/Ring/i, "Tatami")}</h3>
                    <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant rounded text-[10px] font-label-caps">Tatami {ring.ring_order}</span>
                  </div>

                  {/* Active Moderator Status Badge */}
                  {activeApprovedReq ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 border border-green-500/30 rounded-md text-green-700 text-[10px] font-bold">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                      <span>ACTIVE: {activeApprovedReq.moderator_name}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-surface-container text-on-surface-variant opacity-60 rounded text-[10px] font-label-caps">
                      <span>NO MODERATOR</span>
                    </div>
                  )}
                </div>
                
                {/* Access Code Display */}
                <div className="p-4 bg-surface-container-low border border-outline-variant rounded-lg flex flex-col items-center">
                  <span className="text-[10px] font-label-caps text-on-surface-variant mb-1">MODERATOR ACCESS CODE</span>
                  <span className="font-data-mono text-3xl font-black text-secondary tracking-widest">{ring.access_code}</span>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex gap-2 pt-2 border-t border-outline-variant/40">
                <button 
                  onClick={() => handleRegenerate(ring.id)}
                  disabled={loadingAction === `${ring.id}-regen`}
                  className="flex-1 py-1.5 bg-surface-container hover:bg-surface-container-high border border-outline-variant rounded font-label-caps text-[10px] text-primary transition-colors flex justify-center items-center gap-1.5 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[14px]">refresh</span> 
                  {loadingAction === `${ring.id}-regen` ? "..." : "REGEN CODE"}
                </button>

                {activeApprovedReq && (
                  <button
                    onClick={() => handleRevokeSession(ring.id)}
                    disabled={loadingAction === `revoke-${ring.id}`}
                    className="flex-1 py-1.5 bg-error/10 hover:bg-error/20 text-error border border-error/30 rounded font-label-caps text-[10px] font-bold transition-colors flex justify-center items-center gap-1.5 disabled:opacity-50"
                    title="Revoke active moderator session on this Tatami"
                  >
                    <span className="material-symbols-outlined text-[14px]">logout</span>
                    {loadingAction === `revoke-${ring.id}` ? "..." : "LOG OUT MOD"}
                  </button>
                )}
              </div>

              {/* Pending Access Requests BELOW Action Buttons */}
              {ringPendingReqs.length > 0 && (
                <div className="pt-3 border-t border-amber-300/40">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2">
                    <div className="flex justify-between items-center text-amber-900 font-label-caps text-[10px] font-bold">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">lock_open</span>
                        PENDING REQUEST ({ringPendingReqs.length})
                      </span>
                    </div>
                    {ringPendingReqs.map(req => (
                      <div key={req.id} className="bg-white p-2.5 rounded border border-amber-300/50 flex items-center justify-between shadow-xs">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-primary">{req.moderator_name}</span>
                          <span className="text-[9px] font-data-mono text-on-surface-variant opacity-70">
                            {req.device_info?.browser || "Device"} • {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleApprove(req.id, ring.id)}
                            disabled={loadingAction === `approve-${req.id}`}
                            className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-[10px] font-bold disabled:opacity-50"
                          >
                            {loadingAction === `approve-${req.id}` ? "..." : "APPROVE"}
                          </button>
                          <button
                            onClick={() => handleReject(req.id)}
                            disabled={loadingAction === `reject-${req.id}`}
                            className="px-2 py-1 bg-surface-container hover:bg-error/20 text-error rounded text-[10px] font-bold border border-outline-variant disabled:opacity-50"
                          >
                            REJECT
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {rings.length === 0 && (
          <div className="col-span-full p-8 text-center text-on-surface-variant italic border border-dashed border-outline-variant rounded-xl">
            No tatamis found for this tournament.
          </div>
        )}
      </div>
    </div>
  );
}
