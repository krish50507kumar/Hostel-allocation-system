import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
 
const MESSAGES: Record<string, string> = {
  BED_UNAVAILABLE: "This bed was just booked by another student. Refresh availability and choose another bed.",
  ALREADY_HAS_ACTIVE_BOOKING: "You already have an active booking. Cancel it before booking another bed.",
  CANCELLATION_CUTOFF_PASSED: "The cancellation cutoff has passed, so this booking can no longer be cancelled.",
  CAPACITY_BELOW_OCCUPIED: "Capacity cannot be lower than the number of occupied beds.",
  FORBIDDEN: "You do not have permission to do that.",
  UNAUTHENTICATED: "Your session expired. Please sign in again.",
};
export function friendly(err: { message?: string } | null): string {
  if (err) console.error("Supabase error:", err); // real cause is visible in the browser console (F12)
  const m = err?.message ?? "";
  const hit = Object.keys(MESSAGES).find((k) => m.includes(k));
  return hit ? MESSAGES[hit] : "Something went wrong. Please try again.";
}
 