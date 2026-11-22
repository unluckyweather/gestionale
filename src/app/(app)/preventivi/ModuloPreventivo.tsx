"use client";
// Pagina del preventivo: dati generali, fasi (ore e materiali) e riepilogo che si aggiorna mentre si scrive.
// Il salvataggio manda tutto insieme a salva_preventivo (tutto o niente). Se non va, la bozza resta qui.
// Sola lettura per la contabilità e per i preventivi accettati, rifiutati o archiviati.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition, type MouseEvent } from "react";
import { useConferma } from "./Conferma";
import { euro } from "@/lib/validazioni";
import { campo, etichetta, pulsante, pulsanteSecondario, riquadro } from "../anagrafiche/stile";
import { archiviaPreventivo, cambiaStato, duplicaPreventivo, leggiModello, salvaComeModello, salvaPreventivo } from "./azioni";
import { inEuro, perCampo, totali as calcolaTotali } from "./calcoli";
import { EtichettaStato, STATI, indirizzo, ore as scriviOre, percento, type Stato } from "./comuni";
import { aggiornaCosti, bozzaFasi, calcolaFasi, copiaFasi, etichetteUniche, s } from "./bozze";
import { ElencoFasi, Voce } from "./ElencoFasi";
import type {
  ArticoloScelto,
  BozzaFase,
  BozzaTestata,
  Cliente,
  CodiceIvaScelto,
  EsitoSalvataggio,
  FaseSalvata,
  PreventivoSalvato,
  TariffaScelta,
} from "./tipi";

type Props = {
  preventivo: PreventivoSalvato | null;
  fasi: FaseSalvata[];
  clienti: Cliente[];
  tariffe: TariffaScelta[];
  articoli: ArticoloScelto[];
  codiciIva: CodiceIvaScelto[];
  modelli: { id: string; nome: string }[]; // per "Parti da un modello"
  oggi: string;
  modificabile: boolean;
  ok?: string;
  errore?: string;
};

// ---------------------------------------------------------------------
// Bozze: dal database al modulo
// ---------------------------------------------------------------------

function bozzaTestata(p: PreventivoSalvato | null, oggi: string): BozzaTestata {
  return {
    soggetto_id: s(p?.soggetto_id),
    oggetto: s(p?.oggetto),
    modello_id: p?.modello_id ?? null,
    data: p?.data ?? oggi,
    valido_fino: s(p?.valido_fino),
    ricarico_percentuale: perCampo(p?.ricarico_percentuale ?? 35, 0, 2),
    prezzo_cliente: p?.prezzo_cliente === null || p?.prezzo_cliente === undefined ? "" : perCampo(p.prezzo_cliente, 2, 2),
    codice_iva_id: s(p?.codice_iva_id),
    cig: s(p?.cig),
    cup: s(p?.cup),
    note: s(p?.note),
    note_cliente: s(p?.note_cliente),
    prezzi_fasi_nel_pdf: p?.prezzi_fasi_nel_pdf ?? false,
  };
}

const etichettaCliente = (c: Cliente) =>
  [c.denominazione, c.nome_breve, c.comune].filter(Boolean).join(" · ") + (c.attivo ? "" : " (archiviato)");

// ---------------------------------------------------------------------
// Il modulo
// ---------------------------------------------------------------------
export default function ModuloPreventivo(props: Props) {
  const { preventivo, clienti, tariffe, articoli, codiciIva, modificabile } = props;
  const nuovo = !preventivo;
  const stato: Stato = preventivo?.stato ?? "bozza";
  const bloccato = stato === "accettato" || stato === "rifiutato";
  const archiviato = preventivo ? !preventivo.attivo : false;
  const solaLettura = !modificabile || bloccato || archiviato;

  const [esito, azione, inCorso] = useActionState<EsitoSalvataggio, FormData>(salvaPreventivo, {});

  const iniziale = useMemo(
    () => ({ testata: bozzaTestata(preventivo, props.oggi), fasi: bozzaFasi(props.fasi) }),
    [preventivo, props.oggi, props.fasi]
  );
  const [testata, setTestata] = useState<BozzaTestata>(iniziale.testata);
  const [fasi, setFasi] = useState<BozzaFase[]>(iniziale.fasi);

  // --- suggerimenti per cliente e materiali ---
  const mappaClienti = useMemo(() => etichetteUniche(clienti, etichettaCliente), [clienti]);
  const cliente = clienti.find((c) => c.id === testata.soggetto_id) ?? null;
  const [testoCliente, setTestoCliente] = useState(() =>
    cliente ? ([...mappaClienti].find(([, c]) => c.id === cliente.id)?.[0] ?? "") : ""
  );
  const pa = cliente?.forma === "pubblica_amministrazione";

  // --- modifiche non salvate: avviso se si chiude o si ricarica la pagina ---
  const modificato =
    JSON.stringify({ testata, fasi }) !== JSON.stringify({ testata: iniziale.testata, fasi: iniziale.fasi });
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
  // conferme dentro la pagina (window.confirm non funziona in tutti i browser)
  const { chiedi, chiediScelta, chiediTesto, finestra } = useConferma();
  const [avviso, setAvviso] = useState<string | null>(null); // errori di Duplica, modelli…
  const [occupato, avvia] = useTransition();

  // --- "Parti da un modello": aggiunge (o sostituisce) le fasi, con i costi di OGGI ---
  async function partiDaModello(modelloId: string) {
    if (!modelloId) return;
    setAvviso(null);
    const letto = await leggiModello(modelloId);
    if (letto.errore || !letto.fasi) return setAvviso(letto.errore ?? "Modello non leggibile.");
    const nuove = aggiornaCosti(copiaFasi(bozzaFasi(letto.fasi)), tariffe, articoli);
    let sostituisci = false;
    if (fasi.length) {
      const scelta = await chiediScelta(`Il preventivo ha già ${fasi.length} ${fasi.length === 1 ? "fase" : "fasi"}. Cosa faccio con quelle del modello?`, [
        { valore: "aggiungi", etichetta: "Aggiungile in fondo" },
        { valore: "sostituisci", etichetta: "Sostituisci le fasi attuali" },
      ]);
      if (!scelta) return;
      sostituisci = scelta === "sostituisci";
    }
    setFasi((x) => (sostituisci ? nuove : [...x, ...nuove]));
    cambiaTestata({ modello_id: modelloId, ricarico_percentuale: perCampo(letto.ricarico_percentuale ?? 35, 0, 2) });
  }

  // --- "Salva come modello": nuovo modello con le fasi come sono adesso ---
  async function salvaModelloDa() {
    const nome = await chiediTesto("Crea un modello di lavorazione con le fasi di questo preventivo.", {
      etichetta: "Nome del modello (es. Insegna luminosa)",
      iniziale: testata.oggetto,
      conferma: "Crea il modello",
    });
    if (!nome) return;
    setAvviso(null);
    avvia(async () => {
      const esito = await salvaComeModello({ nome, ricarico_percentuale: testata.ricarico_percentuale, fasi });
      if (esito?.errore) setAvviso(esito.errore);
    });
  }

  // --- "Duplica": nuova bozza; si sceglie se tenere i costi o aggiornarli a oggi ---
  async function duplica() {
    if (!preventivo) return;
    const costi = await chiediScelta(`Creo una nuova bozza copiando il preventivo ${preventivo.numero}. Il prezzo corretto a mano non si copia. Con quali costi?`, [
      { valore: "attuali", etichetta: "Aggiorna ai costi di oggi", descrizione: "Tariffe orarie e catalogo materiali attuali" },
      { valore: "originali", etichetta: "Tieni i costi di questo preventivo", descrizione: "Copia esatta di ore e materiali" },
    ]);
    if (costi !== "attuali" && costi !== "originali") return;
    setAvviso(null);
    avvia(async () => {
      const esito = await duplicaPreventivo(preventivo.id, costi);
      if (esito?.errore) setAvviso(esito.errore);
    });
  }
  const router = useRouter();
  async function lasciaPagina(e: MouseEvent<HTMLAnchorElement>) {
    if (!modificato) return;
    e.preventDefault();
    const destinazione = e.currentTarget.href;
    if (await chiedi("Ci sono modifiche non salvate. Uscire lo stesso?", "Esci senza salvare")) router.push(destinazione);
  }

  // --- calcoli dal vivo ---
  const aliquota = useMemo(() => {
    const scelto = codiciIva.find((c) => c.id === testata.codice_iva_id);
    const abituale = codiciIva.find((c) => c.id === cliente?.codice_iva_abituale_id);
    const ventidue = codiciIva.find((c) => c.codice === "22" && c.attivo);
    return Number((scelto ?? abituale ?? ventidue)?.aliquota ?? 22);
  }, [codiciIva, testata.codice_iva_id, cliente]);

  const { perFase: calcoloFasi, totale: costiTotali } = calcolaFasi(fasi);
  const t = calcolaTotali(costiTotali, testata.ricarico_percentuale, testata.prezzo_cliente, aliquota);

  // --- modifiche alla bozza ---
  const cambiaTestata = (campi: Partial<BozzaTestata>) => setTestata((x) => ({ ...x, ...campi }));

  function scegliCliente(testo: string) {
    setTestoCliente(testo);
    cambiaTestata({ soggetto_id: mappaClienti.get(testo)?.id ?? "" });
  }

  const titolo = preventivo ? `${preventivo.numero} · ${preventivo.oggetto}` : "Nuovo preventivo";
  const messaggioErrore = avviso ?? esito.errore ?? props.errore;

  return (
    <div className="flex flex-col gap-5">
      {finestra}
      {/* ---------------- Intestazione ---------------- */}
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-[1_1_320px]">
          <nav aria-label="Percorso" className="text-sm">
            <Link href={indirizzo(preventivo ? { sel: preventivo.id } : {})} onClick={lasciaPagina} className="text-blue-700 hover:underline">
              Preventivi
            </Link>
            <span className="text-slate-500"> › {preventivo?.numero ?? "nuovo"}</span>
          </nav>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold">{titolo}</h1>
            {preventivo && <EtichettaStato stato={stato} />}
            {archiviato && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">Archiviato</span>}
          </div>
        </div>
        {preventivo &&
          (modificato ? (
            <button type="button" disabled title="Salva prima le modifiche" className={`${pulsanteSecondario} cursor-not-allowed opacity-50`}>
              Anteprima PDF cliente
            </button>
          ) : (
            <Link href={`/stampa/preventivi/${preventivo.id}`} className={pulsanteSecondario}>
              Anteprima PDF cliente
            </Link>
          ))}
        {preventivo && modificabile && (
          <>
            <button
              type="button"
              onClick={salvaModelloDa}
              disabled={occupato || modificato || fasi.length === 0}
              title={modificato ? "Salva prima le modifiche" : fasi.length === 0 ? "Il preventivo non ha fasi" : undefined}
              className={`${pulsanteSecondario} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Salva come modello
            </button>
            <button
              type="button"
              onClick={duplica}
              disabled={occupato || modificato}
              title={modificato ? "Salva prima le modifiche" : undefined}
              className={`${pulsanteSecondario} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {occupato ? "Un momento…" : "Duplica"}
            </button>
          </>
        )}
        {!solaLettura && (
          <button
            type="submit"
            form="modulo-preventivo"
            disabled={inCorso}
            className={pulsante}
            onClick={() => (salvando.current = true)}
          >
            {inCorso ? "Salvataggio…" : nuovo ? "Crea preventivo" : "Salva preventivo"}
          </button>
        )}
      </header>

      {props.ok && !modificato && (
        <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{props.ok}</p>
      )}
      {messaggioErrore && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{messaggioErrore}</p>
      )}
      {preventivo && (bloccato || archiviato) && (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
          {archiviato
            ? "Questo preventivo è archiviato: si può solo ripristinare."
            : `Questo preventivo è ${stato}: non si modifica più. Per rifarlo usa «Duplica», oppure riportalo a «bozza».`}
        </p>
      )}

      {/* ---------------- Stato e archiviazione ---------------- */}
      {preventivo && modificabile && (
        <BarraStato
          id={preventivo.id}
          stato={stato}
          archiviato={archiviato}
          modificato={modificato}
          chiedi={chiedi}
        />
      )}

      <form id="modulo-preventivo" action={azione} className="flex flex-col gap-5">
        <input type="hidden" name="dati" value={JSON.stringify({ id: preventivo?.id ?? null, testata, fasi })} />
        <fieldset disabled={solaLettura} className="flex min-w-0 flex-col gap-5">
          <legend className="sr-only">Dati del preventivo</legend>

          {/* ---------------- Dati generali ---------------- */}
          <section aria-label="Dati generali" className={`${riquadro} grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 p-4`}>
            <label className={`${etichetta} col-span-full sm:col-span-2`}>
              Cliente
              <input
                list="elenco-clienti"
                value={testoCliente}
                onChange={(e) => scegliCliente(e.target.value)}
                placeholder="Scrivi per cercare…"
                required
                aria-invalid={testoCliente !== "" && !cliente}
                className={campo}
              />
              {testoCliente !== "" && !cliente && (
                <span className="font-normal text-amber-700">Scegli un cliente dai suggerimenti.</span>
              )}
              <datalist id="elenco-clienti">
                {[...mappaClienti.keys()].map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </label>
            <label className={`${etichetta} col-span-full sm:col-span-2`}>
              Oggetto del lavoro
              <input value={testata.oggetto} onChange={(e) => cambiaTestata({ oggetto: e.target.value })} required className={campo} />
            </label>
            <label className={etichetta}>
              Data
              <input type="date" value={testata.data} onChange={(e) => cambiaTestata({ data: e.target.value })} required className={campo} />
            </label>
            <label className={etichetta}>
              Valido fino al
              <input
                type="date"
                value={testata.valido_fino}
                min={testata.data}
                onChange={(e) => cambiaTestata({ valido_fino: e.target.value })}
                className={campo}
              />
              {!testata.valido_fino && <span className="font-normal">Vuoto: un mese dalla data</span>}
            </label>
            <label className={etichetta}>
              Codice IVA
              <select value={testata.codice_iva_id} onChange={(e) => cambiaTestata({ codice_iva_id: e.target.value })} className={campo}>
                <option value="">Automatico ({aliquota}%: quello del cliente o 22)</option>
                {codiciIva
                  .filter((c) => c.attivo || c.id === testata.codice_iva_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codice} · {c.descrizione}
                    </option>
                  ))}
              </select>
            </label>
            {pa && (
              <>
                <label className={etichetta}>
                  CIG
                  <input value={testata.cig} onChange={(e) => cambiaTestata({ cig: e.target.value })} className={campo} />
                </label>
                <label className={etichetta}>
                  CUP
                  <input value={testata.cup} onChange={(e) => cambiaTestata({ cup: e.target.value })} className={campo} />
                </label>
              </>
            )}
            {!solaLettura && props.modelli.length > 0 && (
              <label className={etichetta}>
                Parti da un modello
                <select
                  value=""
                  onChange={(e) => partiDaModello(e.target.value)}
                  className={campo}
                >
                  <option value="">{testata.modello_id ? "Aggiungi un altro modello…" : "Scegli…"}</option>
                  {props.modelli.map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
                {testata.modello_id && (
                  <span className="font-normal">
                    Partito da «{props.modelli.find((m) => m.id === testata.modello_id)?.nome ?? "un modello archiviato"}»
                  </span>
                )}
              </label>
            )}
            <label className={`${etichetta} col-span-full sm:col-span-2`}>
              Note per il cliente (vanno nel PDF)
              <textarea
                rows={3}
                value={testata.note_cliente}
                onChange={(e) => cambiaTestata({ note_cliente: e.target.value })}
                placeholder="es. Consegna in 10 giorni lavorativi dall'ordine. Esclusi permessi comunali."
                className={campo}
              />
            </label>
            <label className={`${etichetta} col-span-full sm:col-span-2`}>
              Note interne (non vanno al cliente)
              <textarea rows={3} value={testata.note} onChange={(e) => cambiaTestata({ note: e.target.value })} className={campo} />
            </label>
            <label className="col-span-full flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={testata.prezzi_fasi_nel_pdf}
                onChange={(e) => cambiaTestata({ prezzi_fasi_nel_pdf: e.target.checked })}
                className="h-4 w-4"
              />
              Mostra il prezzo di ogni fase nel PDF (altrimenti solo il totale)
            </label>
          </section>

          <div className="flex flex-wrap items-start gap-5">
            {/* ---------------- Fasi ---------------- */}
            <ElencoFasi
              fasi={fasi}
              setFasi={setFasi}
              costi={calcoloFasi.map((f) => f.costoOre + f.costoMateriali)}
              tariffe={tariffe}
              articoli={articoli}
              solaLettura={solaLettura}
              chiedi={chiedi}
              vuoto="Nessuna fase. Un preventivo è fatto di fasi (es. Grafica, Stampa, Posa), ognuna con ore di lavoro e materiali."
            />

            {/* ---------------- Riepilogo ---------------- */}
            <aside aria-label="Riepilogo" className={`${riquadro} flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 p-5 text-sm lg:sticky lg:top-4`}>
              <h2 className="mb-1 text-base font-semibold">Riepilogo</h2>
              <Voce testo={`Ore di lavoro (${scriviOre(t.ore)} h)`} valore={euro(inEuro(t.costoOre))} />
              <Voce testo="Materiali" valore={euro(inEuro(t.costoMateriali))} />
              <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 font-semibold">
                <span>Costo totale</span>
                <span className="tabular-nums">{euro(inEuro(t.costo))}</span>
              </div>
              <label className="flex items-center justify-between gap-3 whitespace-nowrap text-slate-500">
                Ricarico %
                <input
                  inputMode="decimal"
                  value={testata.ricarico_percentuale}
                  onChange={(e) => cambiaTestata({ ricarico_percentuale: e.target.value })}
                  className={`${campo} w-24 text-right`}
                />
              </label>
              <Voce testo="Prezzo calcolato" valore={euro(inEuro(t.prezzoCalcolato))} />
              <label className={etichetta}>
                Prezzo al cliente (vuoto = calcolato)
                <input
                  inputMode="decimal"
                  value={testata.prezzo_cliente}
                  placeholder={perCampo(inEuro(t.prezzoCalcolato), 2, 2)}
                  onChange={(e) => cambiaTestata({ prezzo_cliente: e.target.value })}
                  className={`${campo} text-right text-lg font-bold`}
                />
              </label>
              {testata.prezzo_cliente && !solaLettura && (
                <button type="button" onClick={() => cambiaTestata({ prezzo_cliente: "" })} className="self-end text-xs text-blue-700 hover:underline">
                  Usa il prezzo calcolato
                </button>
              )}
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Margine</span>
                <span className={`font-semibold tabular-nums ${t.margine < 0 ? "text-red-700" : "text-green-800"}`}>
                  {euro(inEuro(t.margine))} · {percento(t.marginePercentuale)}
                </span>
              </div>
              <div className="border-t border-slate-200 pt-2">
                <Voce testo={`IVA ${perCampo(aliquota, 0, 2)}%`} valore={euro(inEuro(t.iva))} />
              </div>
              <div className="flex justify-between gap-3 text-lg font-bold">
                <span>Totale</span>
                <span className="tabular-nums">{euro(inEuro(t.totale))}</span>
              </div>
              <p className="mt-1.5 rounded-lg bg-blue-50 p-3 text-[13px] leading-snug text-blue-950">
                Il cliente vede solo le <strong>descrizioni delle fasi</strong> e il prezzo. Ore, costi e ricarico restano interni.
              </p>
              {modificato && !solaLettura && (
                <p className="rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900">Ci sono modifiche non salvate.</p>
              )}
            </aside>
          </div>
        </fieldset>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------
// Stato e archiviazione (titolare e ufficio). Moduli a parte: non toccano la bozza.
// ---------------------------------------------------------------------
type PropsBarra = {
  id: string;
  stato: Stato;
  archiviato: boolean;
  modificato: boolean;
  chiedi: (domanda: string, conferma?: string) => Promise<boolean>;
};

function BarraStato({ id, stato, archiviato, modificato, chiedi }: PropsBarra) {
  const bloccato = stato === "accettato" || stato === "rifiutato";
  const [inCorso, avvia] = useTransition();
  const fermo = modificato || archiviato || inCorso;

  const dati = (campi: Record<string, string>) => {
    const d = new FormData();
    for (const [k, v] of Object.entries(campi)) d.set(k, v);
    return d;
  };

  async function scegliStato(nuovo: Stato) {
    const etichetta = STATI.find((x) => x.valore === nuovo)?.etichetta ?? nuovo;
    const domanda = bloccato
      ? `Riportare il preventivo a «${etichetta.toLowerCase()}»? Tornerà modificabile.`
      : nuovo === "accettato" || nuovo === "rifiutato"
        ? `Segnare il preventivo come «${etichetta.toLowerCase()}»? Da quel momento non si potrà più modificare.`
        : null;
    if (domanda && !(await chiedi(domanda, `Sì, ${etichetta.toLowerCase()}`))) return;
    avvia(() => cambiaStato(dati({ id, stato: nuovo })));
  }

  async function archivia() {
    if (!archiviato && !(await chiedi("Archiviare il preventivo? Non comparirà più nell'elenco (si può ripristinare).", "Archivia"))) return;
    avvia(() => archiviaPreventivo(dati({ id, attivo: archiviato ? "true" : "false" })));
  }

  return (
    <div className={`${riquadro} flex flex-wrap items-center gap-2 px-4 py-3 text-sm`}>
      <span className="font-semibold text-slate-600">Stato:</span>
      {STATI.map((x) =>
        x.valore === stato ? (
          <span key={x.valore} aria-current="true" className="rounded-full border border-slate-900 bg-slate-900 px-3.5 py-1.5 font-semibold text-white">
            {x.etichetta}
          </span>
        ) : (
          <button
            key={x.valore}
            type="button"
            disabled={fermo}
            onClick={() => scegliStato(x.valore)}
            className="min-h-9 rounded-full border border-slate-300 bg-white px-3.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {x.etichetta}
          </button>
        )
      )}
      {modificato && <span className="text-xs text-amber-800">Salva prima le modifiche</span>}
      {inCorso && <span className="text-xs text-slate-500">Un momento…</span>}
      <button
        type="button"
        disabled={modificato || inCorso}
        onClick={archivia}
        className="ml-auto min-h-9 text-sm text-slate-600 hover:text-slate-900 hover:underline disabled:opacity-50"
      >
        {archiviato ? "Ripristina" : "Archivia"}
      </button>
    </div>
  );
}
