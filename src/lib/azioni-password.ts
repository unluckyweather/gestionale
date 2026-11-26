"use server";
// «Password dimenticata»: chiedere il link via email e scegliere la nuova password.
// Girano sul server e usano solo la chiave pubblica di Supabase (mai la secret).
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { creaClientServer } from "@/lib/supabase/server";

export type StatoRichiesta = { inviata?: boolean; errore?: string };
export type StatoNuovaPassword = { errore?: string };

const LUNGHEZZA_MINIMA = 8;

/** Manda l'email con il link. La risposta è sempre la stessa, che l'email esista o no. */
export async function chiediLink(_precedente: StatoRichiesta, dati: FormData): Promise<StatoRichiesta> {
  const email = String(dati.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { errore: "Scrivi la tua email." };

  // Indirizzo del sito da cui arriva la richiesta (localhost o Vercel):
  // il link dell'email riporta qui.
  const h = await headers();
  const origine = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  const supabase = await creaClientServer();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origine}/auth/conferma?next=/nuova-password`,
  });

  if (error) {
    // Troppe richieste: lo diciamo (non rivela se l'email esiste).
    if (error.status === 429) {
      return { errore: "Troppe richieste in poco tempo. Riprova tra qualche minuto." };
    }
    // Ogni altro errore resta nei log del server; all'utente la risposta di sempre.
    console.error("Password dimenticata:", error.message);
  }
  return { inviata: true };
}

/** Salva la nuova password per l'utente collegato con il link dell'email. */
export async function salvaNuovaPassword(
  _precedente: StatoNuovaPassword,
  dati: FormData
): Promise<StatoNuovaPassword> {
  const password = String(dati.get("password") ?? "");
  const conferma = String(dati.get("conferma") ?? "");

  if (password.length < LUNGHEZZA_MINIMA) {
    return { errore: `La password deve avere almeno ${LUNGHEZZA_MINIMA} caratteri.` };
  }
  if (password !== conferma) return { errore: "Le due password non sono uguali." };

  const supabase = await creaClientServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?errore=link");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { errore: "È uguale a quella di prima: scegline una diversa." };
    if (error.code === "weak_password") return { errore: "Password troppo semplice: allungala o aggiungi numeri e simboli." };
    console.error("Nuova password:", error.message);
    return { errore: "Non è stato possibile salvare la password. Riprova o chiedi al titolare." };
  }

  redirect("/");
}
