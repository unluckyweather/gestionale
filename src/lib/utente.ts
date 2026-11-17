// Chi è l'utente collegato, e controlli di accesso per le pagine (lato server).
// Solo lato server (usa i cookie): non importarlo nei componenti "use client".
import { cache } from "react";
import { redirect } from "next/navigation";
import { creaClientServer } from "@/lib/supabase/server";
import { SEZIONI, eRuolo, type Ruolo } from "@/lib/ruoli";

export type UtenteCorrente = {
  id: string;
  email: string;
  nome: string;
  ruolo: Ruolo;
  attivo: boolean;
};

// "cache" = nella stessa richiesta il database si interroga una volta sola,
// anche se layout e pagina chiedono entrambi l'utente.
export const leggiUtente = cache(async (): Promise<UtenteCorrente | null> => {
  const supabase = await creaClientServer();
  const { data: auth } = await supabase.auth.getUser();
  const utente = auth.user;
  if (!utente) return null;

  const { data: profilo } = await supabase
    .from("profili")
    .select("email, nome_visualizzato, ruolo, attivo")
    .eq("id", utente.id)
    .maybeSingle();

  // Account senza profilo (non dovrebbe succedere): lo trattiamo come non attivo.
  if (!profilo || !eRuolo(profilo.ruolo)) {
    return { id: utente.id, email: utente.email ?? "", nome: "", ruolo: "operaio", attivo: false };
  }

  return {
    id: utente.id,
    email: profilo.email,
    nome: profilo.nome_visualizzato || profilo.email,
    ruolo: profilo.ruolo,
    attivo: profilo.attivo,
  };
});

/** Per le pagine riservate: senza login → /login, account disattivato → avviso. */
export async function richiediUtente(): Promise<UtenteCorrente> {
  const utente = await leggiUtente();
  if (!utente) redirect("/login");
  if (!utente.attivo) redirect("/account-non-attivo");
  return utente;
}

/** Come richiediUtente, ma serve anche uno dei ruoli indicati (altrimenti torna alla Dashboard). */
export async function richiediRuolo(...ruoli: Ruolo[]): Promise<UtenteCorrente> {
  const utente = await richiediUtente();
  if (!ruoli.includes(utente.ruolo)) redirect("/");
  return utente;
}

/** Controllo per una scheda, usando l'elenco SEZIONI di lib/ruoli.ts. */
export async function richiediSezione(href: string): Promise<UtenteCorrente> {
  const sezione = SEZIONI.find((s) => s.href === href);
  if (!sezione) throw new Error(`Sezione sconosciuta: ${href}`);
  return richiediRuolo(...sezione.ruoli);
}
