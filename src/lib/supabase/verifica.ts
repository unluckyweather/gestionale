// Controlla se l'app riesce a parlare con Supabase.
// Serve solo nella fase iniziale, per verificare che le chiavi siano giuste.
export type StatoSupabase =
  | { ok: true }
  | { ok: false; motivo: string };

export async function verificaSupabase(): Promise<StatoSupabase> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chiave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !chiave) {
    return { ok: false, motivo: "Mancano URL o chiave nel file .env.local" };
  }

  try {
    const risposta = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: chiave },
      cache: "no-store",
    });
    if (risposta.ok) return { ok: true };
    if (risposta.status === 401 || risposta.status === 403) {
      return { ok: false, motivo: "Supabase risponde, ma la chiave non è valida" };
    }
    return { ok: false, motivo: `Supabase ha risposto con errore ${risposta.status}` };
  } catch {
    return { ok: false, motivo: "Impossibile raggiungere Supabase: controlla l'URL" };
  }
}
