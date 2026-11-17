// Collegamento a Supabase usato dal server di Next.js
// (pagine caricate già con i dati, controlli dei permessi).
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function creaClientServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chiamato da una pagina: i cookie li aggiornerà il login (passo successivo).
          }
        },
      },
    }
  );
}
