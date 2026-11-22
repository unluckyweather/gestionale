"use client";
// Pagina di un modello di lavorazione: nome, descrizione, ricarico e fasi con ore e materiali.
// I costi mostrati sono quelli di OGGI (tariffe e catalogo): un preventivo creato dal modello
// prende sempre i costi del momento. Salvataggio con salva_modello (tutto o niente).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition, type MouseEvent } from "react";
import { euro } from "@/lib/validazioni";
import { campo, etichetta, pulsante, riquadro } from "../anagrafiche/stile";
import { archiviaModello, salvaModello } from "./azioni";
import { aggiornaCosti, bozzaFasi, calcolaFasi, s } from "./bozze";
import { inEuro, perCampo, totali } from "./calcoli";
import { indirizzo, ore as scriviOre } from "./comuni";
import { useConferma } from "./Conferma";
import { ElencoFasi, Voce } from "./ElencoFasi";
import type { ArticoloScelto, BozzaFase, BozzaModello, EsitoSalvataggio, FaseSalvata, ModelloSalvato, TariffaScelta } from "./tipi";

type Props = {
  modello: ModelloSalvato | null;
  fasi: FaseSalvata[];
  tariffe: TariffaScelta[];
  articoli: ArticoloScelto[];
  modificabile: boolean;
  ok?: string;
  errore?: string;
};

export default function ModuloModello(props: Props) {
  const { modello, tariffe, articoli, modificabile } = props;
  const archiviato = modello ? !modello.attivo : false;
  const solaLettura = !modificabile || archiviato;

  const [esito, azione, inCorso] = useActionState<EsitoSalvataggio, FormData>(salvaModello, {});
  const iniziale = useMemo(
    () => ({
      testata: {
        nome: s(modello?.nome),
        descrizione: s(modello?.descrizione),
        ricarico_percentuale: perCampo(modello?.ricarico_percentuale ?? 35, 0, 2),
        note: s(modello?.note),
      } as BozzaModello,
      // costi aggiornati a oggi già all'apertura
      fasi: aggiornaCosti(bozzaFasi(props.fasi), tariffe, articoli),
    }),
    [modello, props.fasi, tariffe, articoli]
  );
  const [testata, setTestata] = useState<BozzaModello>(iniziale.testata);
  const [fasi, setFasi] = useState<BozzaFase[]>(iniziale.fasi);
  const cambiaTestata = (campi: Partial<BozzaModello>) => setTestata((x) => ({ ...x, ...campi }));

  // modifiche non salvate (come nel preventivo)
  const modificato = JSON.stringify({ testata, fasi }) !== JSON.stringify(iniziale);
  const salvando = useRef(false);
  useEffect(() => {
    if (!modificato) return;
    const avvisa = (e: BeforeUnloadEvent) => {
      if (!salvando.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", avvisa);
    return () => window.removeEventListener("beforeunload", avvisa);
  }, [modificato]);
  useEffect(() => {
    if (!inCorso) salvando.current = false;
  }, [inCorso]);

  const { chiedi, finestra } = useConferma();
  const router = useRouter();
  async function lasciaPagina(e: MouseEvent<HTMLAnchorElement>) {
    if (!modificato) return;
    e.preventDefault();
    const destinazione = e.currentTarget.href;
    if (await chiedi("Ci sono modifiche non salvate. Uscire lo stesso?", "Esci senza salvare")) router.push(destinazione);
  }

  const [occupato, avvia] = useTransition();
  async function archivia() {
    if (!modello) return;
    if (!archiviato && !(await chiedi(`Archiviare il modello «${modello.nome}»? Non comparirà più tra i modelli da usare (si può ripristinare).`, "Archivia"))) return;
    const d = new FormData();
    d.set("id", modello.id);
    d.set("attivo", archiviato ? "true" : "false");
    avvia(() => archiviaModello(d));
  }

  const { perFase, totale } = calcolaFasi(fasi);
  const t = totali(totale, testata.ricarico_percentuale, "", 0);
  const messaggioErrore = esito.errore ?? props.errore;

  return (
    <div className="flex flex-col gap-5">
      {finestra}
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-[1_1_320px]">
          <nav aria-label="Percorso" className="text-sm">
            <Link href={indirizzo({})} onClick={lasciaPagina} className="text-blue-700 hover:underline">Preventivi</Link>
            <span className="text-slate-500"> › </span>
            <Link href={indirizzo({ scheda: "modelli" })} onClick={lasciaPagina} className="text-blue-700 hover:underline">Modelli</Link>
          </nav>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold">{modello ? modello.nome : "Nuovo modello"}</h1>
            {archiviato && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">Archiviato</span>}
          </div>
        </div>
        {modello && modificabile && (
          <button
            type="button"
            onClick={archivia}
            disabled={modificato || occupato}
            title={modificato ? "Salva prima le modifiche" : undefined}
            className="min-h-11 px-2 text-sm text-slate-600 hover:text-slate-900 hover:underline disabled:opacity-50"
          >
            {archiviato ? "Ripristina" : "Archivia"}
          </button>
        )}
        {!solaLettura && (
          <button type="submit" form="modulo-modello" disabled={inCorso} className={pulsante} onClick={() => (salvando.current = true)}>
            {inCorso ? "Salvataggio…" : modello ? "Salva modello" : "Crea modello"}
          </button>
        )}
      </header>

      {props.ok && !modificato && <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{props.ok}</p>}
      {messaggioErrore && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{messaggioErrore}</p>}
      {archiviato && (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">Questo modello è archiviato: non compare tra quelli da usare. Si può ripristinare.</p>
      )}

      <form id="modulo-modello" action={azione} className="flex flex-col gap-5">
        <input type="hidden" name="dati" value={JSON.stringify({ id: modello?.id ?? null, testata, fasi })} />
        <fieldset disabled={solaLettura} className="flex min-w-0 flex-col gap-5">
          <legend className="sr-only">Dati del modello</legend>
          <section aria-label="Dati del modello" className={`${riquadro} grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3 p-4`}>
            <label className={etichetta}>
              Nome del modello
              <input value={testata.nome} onChange={(e) => cambiaTestata({ nome: e.target.value })} required placeholder="es. Insegna luminosa" className={campo} />
            </label>
            <label className={etichetta}>
              Descrizione (facoltativa)
              <input value={testata.descrizione} onChange={(e) => cambiaTestata({ descrizione: e.target.value })} placeholder="quando usarlo" className={campo} />
            </label>
            <label className={`${etichetta} col-span-full`}>
              Note interne
              <textarea rows={2} value={testata.note} onChange={(e) => cambiaTestata({ note: e.target.value })} className={campo} />
            </label>
          </section>

          <div className="flex flex-wrap items-start gap-5">
            <ElencoFasi
              fasi={fasi}
              setFasi={setFasi}
              costi={perFase.map((f) => f.costoOre + f.costoMateriali)}
              tariffe={tariffe}
              articoli={articoli}
              solaLettura={solaLettura}
              chiedi={chiedi}
              vuoto="Nessuna fase. Aggiungi le fasi tipiche di questo lavoro (es. Grafica, Stampa, Posa) con ore e materiali: nei preventivi si potranno poi correggere."
            />
            <aside aria-label="Riepilogo" className={`${riquadro} flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 p-5 text-sm lg:sticky lg:top-4`}>
              <h2 className="mb-1 text-base font-semibold">Riepilogo indicativo</h2>
              <Voce testo={`Ore di lavoro (${scriviOre(t.ore)} h)`} valore={euro(inEuro(t.costoOre))} />
              <Voce testo="Materiali" valore={euro(inEuro(t.costoMateriali))} />
              <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 font-semibold">
                <span>Costo di oggi</span>
                <span className="tabular-nums">{euro(inEuro(t.costo))}</span>
              </div>
              <label className="flex items-center justify-between gap-3 whitespace-nowrap text-slate-500">
                Ricarico proposto %
                <input
                  inputMode="decimal"
                  value={testata.ricarico_percentuale}
                  onChange={(e) => cambiaTestata({ ricarico_percentuale: e.target.value })}
                  className={`${campo} w-24 text-right`}
                />
              </label>
              <div className="flex justify-between gap-3 text-lg font-bold">
                <span>Prezzo indicativo</span>
                <span className="tabular-nums">{euro(inEuro(t.prezzoCalcolato))}</span>
              </div>
              <p className="mt-1.5 rounded-lg bg-blue-50 p-3 text-[13px] leading-snug text-blue-950">
                I costi sono quelli di <strong>oggi</strong>. Usando il modello in un preventivo, ore e materiali prendono le tariffe
                e il catalogo del momento; poi si correggono quantità e misure del lavoro vero.
              </p>
              {modificato && !solaLettura && <p className="rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900">Ci sono modifiche non salvate.</p>}
            </aside>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
