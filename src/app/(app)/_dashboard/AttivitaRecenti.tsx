// Dashboard → «Attività recenti» (solo titolare: il registro delle modifiche lo legge solo lui, 0001).
// Le righe di registro_modifiche diventano frasi semplici («Marco ha accettato il preventivo 23/26»).
// Restano fuori, per non riempire l'elenco: le timbrature normali dal telefono (si vedono in Presenze),
// le righe interne dei salvataggi (fasi, ore, materiali, righe degli ordini, competenze…)
// e le modifiche ripetute alla stessa cosa (resta la più recente).
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { dataIt, oggiIt } from "@/lib/produzione";
import { spostaGiorno } from "@/lib/programma";
import { ETICHETTE_RUOLO, eRuolo } from "@/lib/ruoli";
import { giornoRoma, oraRoma } from "@/lib/timbrature";
import { quantitaConUnita } from "@/lib/magazzino";
import { riquadro } from "../anagrafiche/stile";
import { STATI_COMMESSA } from "../produzione/comuni";
import { periodoTesto } from "../timbrature/RichiesteAssenze";

type Riga = Record<string, unknown>;
type Voce = {
  id: string;
  tabella: string;
  record_id: string;
  azione: "creazione" | "modifica" | "archiviazione";
  quando: string;
  prima: Riga | null;
  dopo: Riga | null;
  autore: { nome_visualizzato: string } | null;
};
type Nomi = { persone: Map<string, string>; articoli: Map<string, { nome: string; unita: string }>; commesse: Map<string, string> };
type Attivita = { id: string; quando: string; chi: string; frase: string; href?: string };

const TABELLE = [
  "preventivi",
  "commesse",
  "lavori",
  "assegnazioni",
  "timbrature",
  "assenze",
  "soggetti",
  "articoli",
  "ordini_acquisto",
  "movimenti_magazzino",
  "profili",
  "dipendenti",
];
const QUANTE = 10;

const s = (x: unknown): string => (typeof x === "string" ? x : x == null ? "" : String(x));
const cambiato = (v: Voce, campo: string) => !!v.prima && !!v.dopo && JSON.stringify(v.prima[campo]) !== JSON.stringify(v.dopo[campo]);

const TIPO_ASSENZA: Record<string, string> = { ferie: "ferie", permesso: "un permesso", malattia: "malattia" };
const STATO_PREVENTIVO: Record<string, string> = {
  bozza: "ha riportato in bozza",
  inviato: "ha segnato come inviato",
  accettato: "ha accettato",
  rifiutato: "ha segnato come rifiutato",
};
const STATO_ORDINE: Record<string, string> = {
  inviato: "ha inviato l'ordine",
  ricevuto_parziale: "ha registrato un arrivo parziale dell'ordine",
  ricevuto: "ha registrato l'arrivo completo dell'ordine",
  annullato: "ha annullato l'ordine",
};
const TIMBRATURA: Record<string, string> = { entrata: "un'entrata", inizio_pausa: "un inizio pausa", fine_pausa: "una fine pausa", uscita: "un'uscita" };

/** Una riga del registro → frase e link (null = da non mostrare) */
function traduci(v: Voce, n: Nomi): { frase: string; href?: string } | null {
  const r = v.dopo ?? v.prima ?? {};
  const persona = n.persone.get(s(r.dipendente_id)) ?? "un collega";
  switch (v.tabella) {
    case "preventivi": {
      const href = `/preventivi?id=${v.record_id}`;
      const nome = `il preventivo ${s(r.numero)}`;
      if (v.azione === "creazione") return { frase: `ha creato ${nome} «${s(r.oggetto)}»`, href };
      if (v.azione === "archiviazione") return { frase: `ha archiviato ${nome}`, href };
      if (cambiato(v, "stato")) return { frase: STATO_PREVENTIVO[s(r.stato)] ? `${STATO_PREVENTIVO[s(r.stato)]} ${nome}` : `ha cambiato lo stato del preventivo ${s(r.numero)}`, href };
      return { frase: `ha modificato ${nome}`, href };
    }
    case "commesse": {
      const href = `/produzione?id=${v.record_id}`;
      const nome = `la commessa ${s(r.numero)}`;
      if (v.azione === "creazione") return { frase: `ha creato ${nome} «${s(r.descrizione)}»`, href };
      if (v.azione === "archiviazione") return { frase: `ha archiviato ${nome}`, href };
      if (cambiato(v, "stato")) {
        if (r.stato === "completata") return { frase: `ha segnato completata ${nome}`, href };
        const etichetta = STATI_COMMESSA.find((x) => x.valore === r.stato)?.etichetta ?? s(r.stato);
        return { frase: `ha portato ${nome} in «${etichetta}»`, href };
      }
      return { frase: `ha modificato ${nome}`, href };
    }
    case "lavori": {
      // solo i cambi di stato (le altre modifiche arrivano dal salvataggio della commessa)
      if (v.azione !== "modifica" || !cambiato(v, "stato")) return null;
      const commessa = n.commesse.get(s(r.commessa_id));
      const href = r.commessa_id ? `/produzione?id=${s(r.commessa_id)}` : undefined;
      const dove = commessa ? ` (commessa ${commessa})` : "";
      const verbo = r.stato === "finito" ? "ha finito" : r.stato === "in_corso" ? "ha iniziato" : "ha rimesso da fare";
      return { frase: `${verbo} il lavoro «${s(r.titolo)}»${dove}`, href };
    }
    case "assegnazioni": {
      const giorno = s(r.giorno);
      return { frase: `ha aggiornato il programma del ${dataIt(giorno)}`, href: `/produzione?scheda=programma&giorno=${giorno}` };
    }
    case "timbrature": {
      const giorno = giornoRoma(s(r.orario));
      const href = `/timbrature?scheda=presenze&giorno=${giorno}`;
      const quando = `del ${dataIt(giorno)} alle ${oraRoma(s(r.orario))}`;
      if (v.azione === "archiviazione") return { frase: `ha annullato ${TIMBRATURA[s(r.tipo)] ?? "una timbratura"} di ${persona} ${quando}`, href };
      if (v.azione === "creazione" && r.origine === "ufficio") return { frase: `ha aggiunto ${TIMBRATURA[s(r.tipo)] ?? "una timbratura"} a ${persona} ${quando}`, href };
      return null;
    }
    case "assenze": {
      const href = "/timbrature?scheda=ferie";
      const cosa = TIPO_ASSENZA[s(r.tipo)] ?? "un'assenza";
      const periodo = periodoTesto({ dal: s(r.dal), al: s(r.al), dalle: (r.dalle as string | null) ?? null, alle: (r.alle as string | null) ?? null });
      if (v.azione === "creazione") {
        if (r.stato === "richiesta") return { frase: `ha chiesto ${cosa} (${periodo})`, href };
        return { frase: `ha registrato ${cosa} per ${persona} (${periodo})`, href };
      }
      if (v.azione === "archiviazione") {
        if (v.prima?.stato === "richiesta") return { frase: `ha ritirato la richiesta di ${cosa} (${periodo})`, href };
        return { frase: `ha tolto ${cosa} di ${persona} (${periodo})`, href };
      }
      if (cambiato(v, "stato") && r.stato === "approvata") return { frase: `ha approvato ${cosa} di ${persona} (${periodo})`, href };
      if (cambiato(v, "stato") && r.stato === "rifiutata") return { frase: `ha rifiutato ${cosa} di ${persona} (${periodo})`, href };
      return null;
    }
    case "soggetti": {
      const scheda = r.tipo === "fornitore" ? "fornitori" : "clienti";
      const href = `/anagrafiche?scheda=${scheda}&id=${v.record_id}`;
      const chi = r.tipo === "fornitore" ? "il fornitore" : r.tipo === "entrambi" ? "il cliente e fornitore" : "il cliente";
      if (v.azione === "creazione") return { frase: `ha aggiunto ${chi} ${s(r.denominazione)}`, href };
      if (v.azione === "archiviazione") return { frase: `ha archiviato ${chi} ${s(r.denominazione)}`, href };
      return { frase: `ha modificato la scheda di ${s(r.denominazione)}`, href };
    }
    case "articoli": {
      const href = `/magazzino?id=${v.record_id}`;
      if (v.azione === "creazione") return { frase: `ha aggiunto l'articolo «${s(r.descrizione)}»`, href };
      if (v.azione === "archiviazione") return { frase: `ha archiviato l'articolo «${s(r.descrizione)}»`, href };
      return { frase: `ha modificato l'articolo «${s(r.descrizione)}»`, href };
    }
    case "ordini_acquisto": {
      const href = `/magazzino?scheda=ordini&id=${v.record_id}`;
      if (v.azione === "creazione") return { frase: `ha preparato l'ordine d'acquisto ${s(r.numero)}`, href };
      if (cambiato(v, "stato") && STATO_ORDINE[s(r.stato)]) return { frase: `${STATO_ORDINE[s(r.stato)]} ${s(r.numero)}`, href };
      return null;
    }
    case "movimenti_magazzino": {
      // i carichi degli ordini si vedono già dall'ordine
      if (r.riga_ordine_id) return null;
      const art = n.articoli.get(s(r.articolo_id));
      const href = `/magazzino?id=${s(r.articolo_id)}`;
      const nome = art ? `«${art.nome}»` : "un articolo";
      const quanto = art ? quantitaConUnita(Math.abs(Number(r.quantita)), art.unita) : "";
      if (v.azione === "archiviazione") return { frase: `ha annullato un movimento di ${nome}`, href };
      if (v.azione !== "creazione") return null;
      const commessa = n.commesse.get(s(r.commessa_id));
      const perCommessa = commessa ? ` per la commessa ${commessa}` : "";
      if (r.tipo === "carico") return { frase: `ha caricato ${quanto} di ${nome}${perCommessa}`, href };
      if (r.tipo === "scarico") return { frase: `ha scaricato ${quanto} di ${nome}${perCommessa}`, href };
      return { frase: `ha fatto l'inventario di ${nome}`, href };
    }
    case "profili": {
      const nome = s(r.nome_visualizzato) || s(r.email);
      if (cambiato(v, "attivo")) return { frase: `ha ${r.attivo ? "attivato" : "disattivato"} l'account di ${nome}`, href: "/impostazioni" };
      if (cambiato(v, "ruolo")) {
        const ruolo = eRuolo(r.ruolo) ? ETICHETTE_RUOLO[r.ruolo] : s(r.ruolo);
        return { frase: `ha cambiato il ruolo di ${nome} in ${ruolo}`, href: "/impostazioni" };
      }
      return null;
    }
    case "dipendenti": {
      const nome = `${s(r.nome)} ${s(r.cognome)}`.trim();
      if (v.azione === "creazione") return { frase: `ha aggiunto il dipendente ${nome}`, href: "/impostazioni" };
      if (v.azione === "archiviazione") return { frase: `ha archiviato il dipendente ${nome}`, href: "/impostazioni" };
      return { frase: `ha modificato il dipendente ${nome}`, href: "/impostazioni" };
    }
  }
  return null;
}

/** "adesso", "12 minuti fa", "oggi, 14:32", "ieri, 17:40", "23/11, 09:05" */
function quandoTesto(iso: string): string {
  const minuti = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minuti < 1) return "adesso";
  if (minuti < 60) return `${minuti} ${minuti === 1 ? "minuto" : "minuti"} fa`;
  const giorno = giornoRoma(iso);
  const oggi = oggiIt();
  if (giorno === oggi) return `oggi, ${oraRoma(iso)}`;
  if (giorno === spostaGiorno(oggi, -1)) return `ieri, ${oraRoma(iso)}`;
  return `${dataIt(giorno).slice(0, 5)}, ${oraRoma(iso)}`;
}

function iniziali(nome: string): string {
  const parti = nome.replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/);
  return ((parti[0]?.[0] ?? "?") + (parti[1]?.[0] ?? "")).toUpperCase();
}

const COLORI = ["bg-blue-100 text-blue-900", "bg-green-100 text-green-900", "bg-amber-100 text-amber-900", "bg-purple-100 text-purple-900", "bg-slate-100 text-slate-700"];
function colore(nome: string): string {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORI[h % COLORI.length];
}

export default async function AttivitaRecenti() {
  const supabase = await creaClientServer();
  const [risRegistro, risPersone, risArticoli, risCommesse] = await Promise.all([
    supabase
      .from("registro_modifiche")
      .select("id, tabella, record_id, azione, quando, prima, dopo, autore:profili(nome_visualizzato)")
      .in("tabella", TABELLE)
      // le timbrature dal telefono restano fuori già qui (sono tante)
      .or("tabella.neq.timbrature,azione.eq.archiviazione,dopo->>origine.eq.ufficio")
      .order("quando", { ascending: false })
      .limit(150),
    supabase.from("dipendenti_elenco").select("id, nome_completo"),
    supabase.from("magazzino").select("articolo_id, descrizione, unita"),
    supabase.from("commesse_elenco").select("id, numero"),
  ]);

  if (risRegistro.error) {
    return (
      <section className={`${riquadro} min-w-0 flex-[1_1_300px] p-4`}>
        <h2 className="mb-2 text-base font-semibold">Attività recenti</h2>
        <p className="text-sm text-red-800">Non riesco a leggere il registro delle modifiche.</p>
      </section>
    );
  }

  const nomi: Nomi = {
    persone: new Map((risPersone.data ?? []).map((p) => [p.id as string, p.nome_completo as string])),
    articoli: new Map((risArticoli.data ?? []).map((a) => [a.articolo_id as string, { nome: a.descrizione as string, unita: a.unita as string }])),
    commesse: new Map((risCommesse.data ?? []).map((c) => [c.id as string, c.numero as string])),
  };

  const attivita: Attivita[] = [];
  const viste = new Set<string>();
  for (const v of (risRegistro.data ?? []) as unknown as Voce[]) {
    const t = traduci(v, nomi);
    if (!t) continue;
    const chi = v.autore?.nome_visualizzato ?? "Il sistema";
    // la stessa frase della stessa persona compare una volta sola (la più recente)
    const chiave = `${chi}|${t.frase}`;
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    attivita.push({ id: v.id, quando: v.quando, chi, ...t });
    if (attivita.length === QUANTE) break;
  }

  return (
    <section className={`${riquadro} min-w-0 flex-[1_1_300px] p-4`}>
      <h2 className="mb-3 text-base font-semibold">Attività recenti</h2>
      {attivita.length === 0 ? (
        <p className="text-sm text-slate-500">Nessuna attività registrata.</p>
      ) : (
        <ul className="flex flex-col gap-3.5 text-sm">
          {attivita.map((a) => (
            <li key={a.id} className="flex gap-2.5">
              <span aria-hidden className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-bold ${colore(a.chi)}`}>
                {iniziali(a.chi)}
              </span>
              <span className="min-w-0">
                <strong>{a.chi}</strong>{" "}
                {a.href ? (
                  <Link href={a.href} className="hover:text-blue-700 hover:underline">
                    {a.frase}
                  </Link>
                ) : (
                  a.frase
                )}
                <span className="block text-xs text-slate-500">{quandoTesto(a.quando)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
