"use server";

import { createClient } from "@/utils/supabase/server";
import { verifyTurnstileToken } from "@/actions/turnstile";
import { headers } from "next/headers";

export async function signInWithGoogleAdmin(turnstileToken: string) {
  if (!turnstileToken) {
    return { success: false, error: "Please complete the security check." };
  }

  const verification = await verifyTurnstileToken(turnstileToken);
  if (!verification.success) {
    return { success: false, error: verification.error || "Security check failed." };
  }

  const supabase = await createClient();
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") || headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");
  const origin = `${protocol}://${host}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=/admin`,
    },
  });

  if (error) {
    return { success: false, error: error.message || "Failed to initiate Google sign-in." };
  }

  if (!data?.url) {
    return { success: false, error: "No redirect URL returned by auth provider." };
  }

  return { success: true, url: data.url };
}
