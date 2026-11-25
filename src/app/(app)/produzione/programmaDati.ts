// Letture del programma di un giorno (solo lato server): usate dalla scheda
// «Programma del giorno» e dalla pagina di stampa.
import type { creaClientServer } from "@/lib/supabase/server";
import type { FasciaOrario } from "@/lib/programma";
import type { StatoLavoro } from "./comuni";

type Client = Awaited<ReturnType<typeof creaClientServer>>;

export type Assegnazione = {
  id: string;
  giorno: string;
  dalle: string;
  alle: string;
  ore: number;
  note: string | null;
  lavoro_id: string;
  titolo: string;
  descrizione: string | null;
  stato_lavoro: StatoLavoro;
  urgente: boolean;
  commessa_id: string | null;
  commessa_numero: string | null;
  commessa_descrizione: string | null;
  cliente: string | null;
  data_consegna: string | null;
  macchina_id: string | null;
  macchina: string | null;
  luogo_posa: string | null;
  dipendente_id: string | null;
  persona: string | null;
  mio: boolean;
  senza_persona: boolean;
  senza_competenza: boolean;
  persona_assente: boolean;
  macchina_ferma: boolean;
  fuori_orario: boolean;
  persona_su_piu_lavori: boolean;
  macchina_su_piu_lavori: boolean;
};
export type Macchina = { id: string; nome: string; tipo: "macchina" | "postazione"; reparto: string | null };
export type Persona = { id: string; nome_completo: string; io: boolean };
export type AssenzaGiorno = { id: string; dipendente_id: string; dal: string; al: string; dalle: string | null; alle: string | null; motivo: string };
export type Fermo = { id: string; macchina_id: string; dal: string; al: string; dalle: string | null; alle: string | null; motivo: string };
export type Competenza = { dipendente_id: string; macchina_id: string; livello: "principale" | "sa_usarla" };

export async function leggiProgramma(supabase: Client, giorno: string) {
  const [ris, macchine, persone, assenze, fermi, orari, competenze] = await Promise.all([
    supabase.from("programma").select("*").eq("giorno", giorno).order("dalle").order("persona"),
    supabase.from("macchine").select("id, nome, tipo, reparto").eq("attivo", true).order("ordine").order("nome"),
    supabase.from("dipendenti_elenco").select("id, nome_completo, io").eq("attivo", true).order("nome").order("cognome"),
    supabase.from("assenze_elenco").select("id, dipendente_id, dal, al, dalle, alle, motivo").lte("dal", giorno).gte("al", giorno),
    supabase
      .from("fermi_macchina")
      .select("id, macchina_id, dal, al, dalle, alle, motivo")
      .eq("attivo", true)
      .lte("dal", giorno)
      .gte("al", giorno),
    supabase.from("orari_lavoro").select("dipendente_id, giorno_settimana, dalle, alle").eq("attivo", true),
    supabase.from("competenze").select("dipendente_id, macchina_id, livello").eq("attivo", true),
  ]);
  const errore = [ris, macchine, persone, assenze, fermi, orari, competenze].find((x) => x.error)?.error;
  if (errore) console.error("Lettura del programma non riuscita:", errore.message);
  return {
    errore: Boolean(errore),
    assegnazioni: ((ris.data ?? []) as Assegnazione[]).map((a) => ({ ...a, ore: Number(a.ore) })),
    macchine: (macchine.data ?? []) as Macchina[],
    persone: (persone.data ?? []) as Persona[],
    assenze: (assenze.data ?? []) as AssenzaGiorno[],
    fermi: (fermi.data ?? []) as Fermo[],
    orari: (orari.data ?? []) as FasciaOrario[],
    competenze: (competenze.data ?? []) as Competenza[],
  };
}

export type DatiProgramma = Awaited<ReturnType<typeof leggiProgramma>>;

/** Gli avvisi di un'assegnazione, in parole (vuoto se va tutto bene). */
export function avvisi(a: Assegnazione): string[] {
  const x: string[] = [];
  if (a.senza_persona) x.push("manca la persona");
  if (a.persona_assente) x.push("la persona è assente");
  if (a.macchina_ferma) x.push("la macchina è ferma");
  if (a.fuori_orario) x.push("fuori dall'orario di lavoro");
  if (a.senza_competenza) x.push("non è tra chi sa usare la macchina");
  return x;
}
