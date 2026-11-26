// Il link dell'email «password dimenticata» arriva qui.
// Accetta i due formati di Supabase:
//  - token_hash + type (modello email consigliato: funziona anche se il link
//    si apre su un altro telefono o computer);
//  - code (modello email predefinito: funziona solo nello stesso browser
//    da cui si è chiesto il link).
// Se il link è buono l'utente risulta collegato e va a «nuova password».
import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { creaClientServer } from "@/lib/supabase/server";

// Solo pagine interne, per non mandare nessuno su siti esterni.
function destinazioneSicura(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/nuova-password";
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type") as EmailOtpType | null;
  const codice = url.searchParams.get("code");
  const next = destinazioneSicura(url.searchParams.get("next"));

  const supabase = await creaClientServer();
  let ok = false;

  if (tokenHash && tipo) {
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    ok = !error;
  } else if (codice) {
    const { error } = await supabase.auth.exchangeCodeForSession(codice);
    ok = !error;
  }

  const destinazione = request.nextUrl.clone();
  destinazione.search = "";
  if (ok) {
    destinazione.pathname = next;
  } else {
    destinazione.pathname = "/login";
    destinazione.searchParams.set("errore", "link");
  }
  return NextResponse.redirect(destinazione);
}
