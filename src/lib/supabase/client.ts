// Collegamento a Supabase usato dalle pagine che girano nel browser
// (pulsanti, moduli, aggiornamenti in tempo reale).
import { createBrowserClient } from "@supabase/ssr";

export function creaClientBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
