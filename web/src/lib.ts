import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
 
const MESSAGES: Record<string, string> = {
  BED_UNAVAILABLE: "This bed was just booked by another student. Refresh availability and choose another bed.",
  ALREADY_HAS_ACTIVE_BOOKING: "You already have an active booking. Cancel it before booking another bed.",
  CANCELLATION_CUTOFF_PASSED: "The cancellation cutoff has passed, so this booking can no longer be cancelled.",
  CAPACITY_BELOW_OCCUPIED: "Capacity cannot be lower than the number of occupied beds.",
  FORBIDDEN: "You do not have permission to do that.",
  UNAUTHENTICATED: "Your session expired. Please sign in again.",
  INVITEE_DETAILS_REQUIRED: "Enter the invited student's student number and email.",
  INVITEE_NOT_FOUND: "No student matched that student number and email.",
  INVITEE_ALREADY_BOOKED: "That student already has an active booking.",
  GROUP_INVITE_LIMIT: "The maximum group size has been reached for this room's available beds.",
  INVITE_ALREADY_SENT: "An invitation for this student and bed is already pending.",
  CANNOT_INVITE_SELF: "You cannot send a group invitation to yourself.",
  INVITE_EXPIRED: "This group booking invitation has expired or the bed is no longer available.",
  INVITE_NOT_FOUND: "This group booking invitation is no longer available.",
};
export function friendly(err: { message?: string } | null): string {
  if (err) console.error("Supabase error:", err); // real cause is visible in the browser console (F12)
  const m = err?.message ?? "";
  const hit = Object.keys(MESSAGES).find((k) => m.includes(k));
  return hit ? MESSAGES[hit] : "Something went wrong. Please try again.";
}
 