// Ore reali sulle commesse, calcolate (piano A, scelto il 26/11/2026; nessun dato salvato):
// per ogni lavoro iniziato o finito si prendono le sue righe del programma (chi, giorno, dalle–alle)
// e si contano solo i minuti in cui quella persona era timbrata dentro (entrata/fine pausa → pausa/uscita).
// Esempio: in programma 8:00–12:00, entrata alle 9:00 → 3 ore.
// Limiti: il tempo fuori programma non si vede; chi segue due lavori insieme conta per entrambi.
// Alternativa (piano B, se i numeri non tornano): ore scritte dall'operaio quando preme «Finito».
import { minuti } from "./produzione";
import type { Intervallo } from "./programma";
import { giornoRoma, type TipoTimbratura } from "./timbrature";

export type RigaProgramma = { dipendente_id: string | null; giorno: string; dalle: string; alle: string };
export type TimbraturaPersona = { dipendente_id: string; tipo: TipoTimbratura; orario: string };

const formatoOra = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Rome" });

/** Minuti dalla mezzanotte (ora italiana) di un momento */
function minutoRoma(d: Date): number {
  const [h, m] = formatoOra.format(d).split(":").map(Number);
  return (h % 24) * 60 + m;
}

/**
 * Tratti «dentro» di ogni persona per giorno: chiave `${dipendente}|${giorno}`.
 * Le timbrature devono essere in ordine di orario. Un tratto aperto conta fino ad adesso solo oggi.
 */
export function trattiDentro(timbrature: TimbraturaPersona[], adesso: Date, oggi: string): Map<string, Intervallo[]> {
  const perGiorno = new Map<string, TimbraturaPersona[]>();
  for (const t of timbrature) {
    const chiave = `${t.dipendente_id}|${giornoRoma(t.orario)}`;
    const elenco = perGiorno.get(chiave) ?? [];
    elenco.push(t);
    perGiorno.set(chiave, elenco);
  }
  const tratti = new Map<string, Intervallo[]>();
  for (const [chiave, elenco] of perGiorno) {
    const giorno = chiave.split("|")[1];
    const out: Intervallo[] = [];
    elenco.forEach((t, i) => {
      if (t.tipo !== "entrata" && t.tipo !== "fine_pausa") return;
      const dopo = elenco[i + 1];
      if (dopo && dopo.tipo !== "inizio_pausa" && dopo.tipo !== "uscita") return; // sequenza sbagliata: non si conta
      if (!dopo && giorno !== oggi) return; // manca l'uscita in un giorno passato: non si conta
      const da = minutoRoma(new Date(t.orario));
      const a = dopo ? minutoRoma(new Date(dopo.orario)) : minutoRoma(adesso);
      if (a > da) out.push({ da, a });
    });
    tratti.set(chiave, out);
  }
  return tratti;
}

/** Minuti di una riga del programma in cui la persona era timbrata dentro */
export function minutiReali(riga: RigaProgramma, tratti: Map<string, Intervallo[]>): number {
  if (!riga.dipendente_id) return 0;
  const da = minuti(riga.dalle);
  const a = minuti(riga.alle);
  let totale = 0;
  for (const t of tratti.get(`${riga.dipendente_id}|${riga.giorno}`) ?? []) {
    totale += Math.max(0, Math.min(a, t.a) - Math.max(da, t.da));
  }
  return totale;
}
