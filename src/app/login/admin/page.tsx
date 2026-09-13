"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Turnstile } from "@marsidev/react-turnstile";
import { signInWithGoogleAdmin } from "@/actions/auth";

function AdminLoginContent() {
  const searchParams = useSearchParams();
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const turnstileRef = useRef<any>(null);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err) {
      if (err.includes("PKCE") || err === "AuthFailed") {
        setError("Sign-in verification expired or failed. Please click below to try again.");
      } else {
        try {
          setError(decodeURIComponent(err));
        } catch {
          setError(err);
        }
      }
    }
  }, [searchParams]);

  const handleGoogleLogin = async () => {
    if (!turnstileToken) {
      setError("Please complete the security check.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const result = await signInWithGoogleAdmin(turnstileToken);

      if (result.success && result.url) {
        window.location.href = result.url;
      } else {
        setError(result.error || "Security check failed. Please try again.");
        turnstileRef.current?.reset();
        setTurnstileToken("");
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
      turnstileRef.current?.reset();
      setTurnstileToken("");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="w-full max-w-sm bg-surface-container-lowest p-card-padding border border-outline-variant rounded-lg shadow-sm text-center">
        <h1 className="font-headline-lg text-headline-lg font-bold text-primary mb-2">Ring Flow Admin</h1>
        <p className="font-body-sm text-on-surface-variant mb-6">
          Authorized personnel only.
        </p>

        {error && <div className="mb-4 text-error text-label-sm font-label-sm">{error}</div>}

        <div className="flex justify-center mb-6 min-h-[65px]">
          <Turnstile 
            ref={turnstileRef}
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""} 
            onSuccess={(token) => {
              setTurnstileToken(token);
              setError("");
            }}
            onExpire={() => {
              setTurnstileToken("");
            }}
            onError={() => {
              setTurnstileToken("");
            }}
            options={{
              theme: "light",
            }}
          />
        </div>

        <button 
          onClick={handleGoogleLogin}
          disabled={!turnstileToken || isLoading}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border border-outline-variant rounded-lg text-primary font-bold hover:bg-surface-container-lowest transition-all hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none cursor-pointer"
        >
          {isLoading ? (
            <span className="w-5 h-5 border-2 border-[#0F172A]/20 border-t-[#0F172A] rounded-full animate-spin shrink-0" />
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          {isLoading ? "Signing in..." : "Sign in with Google"}
        </button>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center bg-background">Loading...</div>}>
      <AdminLoginContent />
    </Suspense>
  );
}
