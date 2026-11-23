// Letture dal database condivise dalle schede Anagrafiche (solo lato server).
import type { creaClientServer } from "@/lib/supabase/server";
import type { BancaAziendale, Categoria, CodiceIva, CondizionePagamento, Tabelle } from "./tipi";

type Client = Awaited<ReturnType<typeof creaClientServer>>;

/** Codici IVA, condizioni di pagamento, banche aziendali e categorie (anche archiviati, attivi per primi). */
export async function leggiTabelle(supabase: Client): Promise<Tabelle> {
  const [iva, condizioni, banche, categorie] = await Promise.all([
    supabase
      .from("codici_iva")
      .select("id, codice, descrizione, aliquota, natura, attivo")
      .order("attivo", { ascending: false })
      .order("aliquota", { ascending: false })
      .order("codice"),
    supabase
      .from("condizioni_pagamento")
      .select("id, descrizione, giorni, attivo")
      .order("attivo", { ascending: false })
      .order("giorni")
      .order("descrizione"),
    supabase
      .from("banche_aziendali")
      .select("id, nome, iban, abi, cab, note, attivo")
      .order("attivo", { ascending: false })
      .order("nome"),
    supabase
      .from("categorie_merceologiche")
      .select("id, descrizione, attivo")
      .order("attivo", { ascending: false })
      .order("descrizione"),
  ]);
  return {
    codiciIva: (iva.data ?? []) as CodiceIva[],
    condizioni: (condizioni.data ?? []) as CondizionePagamento[],
    banche: (banche.data ?? []) as BancaAziendale[],
    categorie: (categorie.data ?? []) as Categoria[],
  };
}

const formatoDataOra = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});

/** "2026-11-19T13:02:00Z" → "19/11/26, 14:02" (ora italiana, anche se il server è altrove). */
export function dataOra(valore: string): string {
  return formatoDataOra.format(new Date(valore));
}
