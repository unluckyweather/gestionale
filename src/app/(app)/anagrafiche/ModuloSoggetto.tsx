"use client";
// Scheda completa di un cliente o fornitore (nuovo o esistente), come nel mockup confermato del 19/11.
// Contatti, sedi e dichiarazioni d'intento sono righe che si aggiungono e tolgono: arrivano al server
// come elenchi (JSON) e il database salva tutto insieme ("tutto o niente", funzione salva_soggetto).
// Se il salvataggio non va, il server restituisce l'errore e i valori scritti: il modulo resta compilato.
import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { salvaSoggetto, type StatoModulo } from "./azioni";
import { campo, etichetta, pulsante, pulsanteSecondario, riquadro } from "./stile";
import { indirizzo } from "./indirizzo";
import { abiCabDaIban } from "@/lib/validazioni";
import {
  DOCUMENTI_REVERSE_CHARGE,
  ETICHETTE_FORMA,
  ETICHETTE_TIPO_SOGGETTO,
  MESI,
  NAZIONI,
  RIFERIMENTI_CONTATTO,
  type Contatto,
  type Dichiarazione,
  type FormaSoggetto,
  type Sede,
  type Soggetto,
  type Tabelle,
  type TipoSoggetto,
} from "./tipi";

type Props = {
  soggetto: Soggetto | null; // null = nuovo
  contatti: Contatto[];
  sedi: Sede[];
  dichiarazioni: Dichiarazione[];
  tabelle: Tabelle;
  scheda: "clienti" | "fornitori";
  modificabile: boolean;
  ultimaModifica: string | null; // es. "19/11/2026 14:02 di Mario"
  linkStorico: string | null; // solo per chi può leggere il registro modifiche
};

// Righe in modifica: "chiave" serve solo a React per riconoscerle, "id" è quello del database (vuoto = nuova).
type Riga<T> = Omit<{ [K in keyof T]: T[K] extends boolean ? boolean : string }, "id"> & { id: string; chiave: number };
type BozzaContatto = Riga<Contatto>;
type BozzaSede = Riga<Sede>;
type BozzaDichiarazione = Riga<Dichiarazione>;

let prossimaChiave = 1;
const nuovaChiave = () => prossimaChiave++;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

const contattoVuoto = (): BozzaContatto => ({
  id: "", chiave: nuovaChiave(), riferimento: "", persona: "", email: "", telefono: "", cellulare: "",
  riceve_preventivi: false, riceve_fatture: false,
});
const sedeVuota = (tipo: "operativa" | "altra"): BozzaSede => ({
  id: "", chiave: nuovaChiave(), tipo, nome: "", indirizzo: "", civico: "", cap: "", comune: "", provincia: "",
  nazione: "IT", telefono: "", annotazioni: "", consegna: tipo === "operativa",
});
const dichiarazioneVuota = (): BozzaDichiarazione => ({
  id: "", chiave: nuovaChiave(), protocollo: "", data: "", anno: String(new Date().getFullYear()), importo: "",
});
const inBozza = <T extends { id: string }>(riga: T) => {
  const bozza: Record<string, unknown> = { chiave: nuovaChiave() };
  for (const [k, v] of Object.entries(riga)) bozza[k] = typeof v === "boolean" ? v : s(v);
  return bozza as Riga<T>;
};
const senzaChiave = <T extends { chiave: number }>(righe: T[]) => righe.map(({ chiave: _, ...resto }) => resto);

/** Nelle tendine: le voci attive, più quella già scelta anche se archiviata. */
function voci<T extends { id: string; attivo: boolean }>(elenco: T[], scelta: string | null | undefined) {
  return elenco.filter((x) => x.attivo || x.id === scelta);
}

export default function ModuloSoggetto(props: Props) {
  const { soggetto, tabelle, scheda, modificabile } = props;
  const [stato, azione, inCorso] = useActionState<StatoModulo, FormData>(salvaSoggetto, {});

  // valore da mostrare nei campi semplici: quello appena scritto (se c'è stato un errore) o quello salvato
  const v = (nome: keyof Soggetto): string => (stato.valori ? (stato.valori[nome] ?? "") : s(soggetto?.[nome]));

  // campi che cambiano altre parti della scheda: li tiene il componente
  const [tipo, setTipo] = useState<TipoSoggetto>(soggetto?.tipo ?? (scheda === "fornitori" ? "fornitore" : "cliente"));
  const [forma, setForma] = useState<FormaSoggetto>(soggetto?.forma ?? "azienda");
  const [nazione, setNazione] = useState(soggetto?.nazione ?? "IT");
  const [paeseIva, setPaeseIva] = useState(soggetto?.paese_iva ?? "IT");
  const [iban, setIban] = useState(s(soggetto?.iban));
  const [abi, setAbi] = useState(s(soggetto?.abi));
  const [cab, setCab] = useState(s(soggetto?.cab));
  const [reverse, setReverse] = useState(soggetto?.reverse_charge ?? false);

  const operativaSalvata = props.sedi.find((x) => x.tipo === "operativa");
  const [operativaUguale, setOperativaUguale] = useState(!operativaSalvata);
  const [operativa, setOperativa] = useState<BozzaSede>(operativaSalvata ? inBozza(operativaSalvata) : sedeVuota("operativa"));
  const [altreSedi, setAltreSedi] = useState<BozzaSede[]>(props.sedi.filter((x) => x.tipo === "altra").map(inBozza));
  const [contatti, setContatti] = useState<BozzaContatto[]>(
    props.contatti.length ? props.contatti.map(inBozza) : [contattoVuoto()]
  );
  const [dichiarazioni, setDichiarazioni] = useState<BozzaDichiarazione[]>(props.dichiarazioni.map(inBozza));

  const persona = forma === "persona_fisica";
  const pa = forma === "pubblica_amministrazione";
  const perClienti = tipo !== "fornitore";
  const perFornitori = tipo !== "cliente";
  const attivo = stato.valori ? stato.valori.attivo === "on" : (soggetto?.attivo ?? true);

  const parola = scheda === "fornitori" ? "fornitore" : "cliente";
  const titolo = soggetto?.denominazione ?? `Nuovo ${parola}`;

  // la sigla della P.IVA segue la nazione della sede legale, finché non la si cambia a mano
  function cambiaNazione(nuova: string) {
    if (paeseIva === nazione) setPaeseIva(nuova);
    setNazione(nuova);
  }
  // con un IBAN italiano, ABI e CAB si compilano da soli
  function compilaDaIban() {
    const trovati = abiCabDaIban(iban);
    if (trovati) {
      setAbi(trovati.abi);
      setCab(trovati.cab);
    }
  }

  const sediDaSalvare = [...(operativaUguale ? [] : [operativa]), ...altreSedi];

  return (
    // noValidate: i controlli li fa il server, che mostra un messaggio chiaro in alto
    // (i fumetti del browser, soprattutto in Safari, si vedono poco e sembrava che "non salvasse")
    <form action={azione} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="id" value={soggetto?.id ?? ""} />
      <input type="hidden" name="scheda" value={scheda} />
      <input type="hidden" name="forma" value={forma} />
      <input type="hidden" name="contatti" value={JSON.stringify(senzaChiave(contatti))} />
      <input type="hidden" name="sedi" value={JSON.stringify(senzaChiave(sediDaSalvare))} />
      <input type="hidden" name="dichiarazioni" value={JSON.stringify(perClienti ? senzaChiave(dichiarazioni) : [])} />

      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-[1_1_320px]">
          <Link href={indirizzo({ scheda })} className="text-sm text-blue-700 hover:underline">
            ← Elenco {scheda}
          </Link>
          <h2 className="mt-1 text-2xl font-semibold">{titolo}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {ETICHETTE_TIPO_SOGGETTO[tipo] === "Entrambi" ? "Cliente e fornitore" : ETICHETTE_TIPO_SOGGETTO[tipo]}
            {props.ultimaModifica && ` · ultima modifica ${props.ultimaModifica}`}
            {soggetto && !soggetto.attivo && " · archiviato"}
          </p>
        </div>
        {props.linkStorico && (
          <Link href={props.linkStorico} className={pulsanteSecondario}>Storico modifiche</Link>
        )}
        {modificabile && (
          <button className={pulsante} disabled={inCorso}>
            {inCorso ? "Salvataggio…" : soggetto ? "Salva modifiche" : `Aggiungi ${parola}`}
          </button>
        )}
      </header>

      {stato.errore && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{stato.errore}</p>
      )}
      {!modificabile && (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">Sola lettura per il tuo ruolo.</p>
      )}

      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <Xml /> = il dato finisce nella fattura elettronica. <DaConfermare /> = da verificare con il commercialista.
      </p>

      <fieldset disabled={!modificabile || inCorso} className="grid min-w-0 items-start gap-5 lg:grid-cols-2">
        {/* ---------------- Dati principali ---------------- */}
        <Riquadro titolo="Dati principali" largo>
          <div className="flex flex-wrap items-end gap-4">
            <Scelte
              legenda="È un"
              nome="tipo"
              valore={tipo}
              opzioni={(Object.keys(ETICHETTE_TIPO_SOGGETTO) as TipoSoggetto[]).map((t) => [t, ETICHETTE_TIPO_SOGGETTO[t]])}
              onCambia={(t) => setTipo(t as TipoSoggetto)}
            />
            <Scelte
              legenda="Forma"
              nome="forma_scelta"
              valore={forma}
              opzioni={(Object.keys(ETICHETTE_FORMA) as FormaSoggetto[]).map((f) => [f, ETICHETTE_FORMA[f]])}
              onCambia={(f) => setForma(f as FormaSoggetto)}
            />
            {soggetto && (
              <label className="ml-auto flex items-center gap-2 pb-2 text-sm text-slate-700">
                <input type="checkbox" name="attivo" defaultChecked={attivo} className="h-4 w-4" />
                Attivo
              </label>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {persona ? (
              <>
                <Campo testo={<>Cognome * <Xml /></>}>
                  <input name="cognome" defaultValue={v("cognome")} required className={campo} />
                </Campo>
                <Campo testo={<>Nome * <Xml /></>}>
                  <input name="nome" defaultValue={v("nome")} required className={campo} />
                </Campo>
              </>
            ) : (
              <Campo testo={<>{pa ? "Denominazione ente" : "Ragione sociale"} * <Xml /></>} classe="sm:col-span-2">
                <input name="ragione_sociale" defaultValue={v("ragione_sociale")} required className={campo} />
              </Campo>
            )}
            <Campo testo="Nome breve (per la ricerca)">
              <input name="nome_breve" defaultValue={v("nome_breve")} placeholder="es. FES" className={campo} />
            </Campo>
            <Campo testo="Categoria merceologica">
              <select name="categoria_id" defaultValue={v("categoria_id")} className={campo}>
                <option value="">— nessuna —</option>
                {voci(tabelle.categorie, soggetto?.categoria_id).map((c) => (
                  <option key={c.id} value={c.id}>{c.descrizione}</option>
                ))}
              </select>
            </Campo>
            <Campo testo="Sito web" classe="sm:col-span-2">
              <input name="sito_web" inputMode="url" defaultValue={v("sito_web")} placeholder="www.…" className={campo} />
            </Campo>
          </div>
        </Riquadro>

        {/* ---------------- Dati fiscali ---------------- */}
        <Riquadro titolo={<>Dati fiscali e fattura elettronica <Xml /></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={`${etichetta} sm:col-span-2`}>
              <span>Partita IVA (sigla paese + numero)</span>
              <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
                <select
                  name="paese_iva"
                  value={paeseIva}
                  onChange={(e) => setPaeseIva(e.target.value)}
                  aria-label="Sigla paese della partita IVA"
                  className={campo}
                >
                  {opzioniNazione(paeseIva, true)}
                </select>
                <input
                  name="partita_iva"
                  defaultValue={v("partita_iva")}
                  aria-label="Numero partita IVA"
                  placeholder={paeseIva === "IT" ? "11 cifre" : "numero"}
                  className={campo}
                />
              </div>
            </div>
            <Campo testo="Codice fiscale">
              <input
                name="codice_fiscale"
                defaultValue={v("codice_fiscale")}
                maxLength={16}
                placeholder="16 caratteri o 11 cifre"
                className={`${campo} uppercase`}
              />
            </Campo>
            {pa ? (
              <Campo testo="Codice univoco ufficio">
                <input
                  name="codice_ufficio_pa"
                  defaultValue={v("codice_ufficio_pa")}
                  maxLength={6}
                  placeholder="6 caratteri (da IPA)"
                  className={`${campo} uppercase`}
                />
              </Campo>
            ) : (
              <Campo testo="Codice SDI">
                <input
                  name="codice_sdi"
                  defaultValue={v("codice_sdi")}
                  maxLength={7}
                  placeholder={persona ? "0000000" : nazione !== "IT" ? "XXXXXXX" : "7 caratteri"}
                  className={`${campo} uppercase`}
                />
              </Campo>
            )}
            <Campo testo="PEC">
              <input name="pec" type="email" defaultValue={v("pec")} placeholder="pec@…" className={campo} />
            </Campo>
            <Campo testo="Codice IVA abituale">
              <select name="codice_iva_abituale_id" defaultValue={v("codice_iva_abituale_id")} className={campo}>
                <option value="">— quello dell&apos;articolo —</option>
                {voci(tabelle.codiciIva, soggetto?.codice_iva_abituale_id).map((c) => (
                  <option key={c.id} value={c.id}>{c.codice} – {c.descrizione}</option>
                ))}
              </select>
            </Campo>
            {pa && (
              <>
                <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                  <input type="checkbox" name="split_payment" defaultChecked={v("split_payment") === "true" || v("split_payment") === "on"} className="h-4 w-4" />
                  Scissione dei pagamenti (split payment): l&apos;IVA la versa l&apos;ente
                </label>
                <Nota classe="sm:col-span-2">
                  Per la PA la fattura usa il formato FPA12. CIG e CUP cambiano da un lavoro all&apos;altro: si scrivono su
                  ogni preventivo/fattura, non qui.
                </Nota>
              </>
            )}
          </div>
          <Nota>
            La sigla si propone da sola dalla nazione della sede legale, ma resta modificabile. Estero: partita IVA del
            loro paese e codice SDI XXXXXXX. Il «Codice IVA abituale» si propone sulle righe dei documenti (modificabile
            riga per riga): serve per esportatori, clienti in reverse charge, esenti.
          </Nota>
        </Riquadro>

        {/* ---------------- Sede legale ---------------- */}
        <Riquadro titolo={<>Sede legale <Xml /></>} sottotitolo="L'indirizzo che va in fattura.">
          <div className="grid grid-cols-6 gap-3">
            <Campo testo="Indirizzo" classe="col-span-6 sm:col-span-5">
              <input name="indirizzo" defaultValue={v("indirizzo")} placeholder="Via / Piazza…" className={campo} />
            </Campo>
            <Campo testo="Civico" classe="col-span-2 sm:col-span-1">
              <input name="civico" defaultValue={v("civico")} className={campo} />
            </Campo>
            <Campo testo="CAP" classe="col-span-4 sm:col-span-1">
              <input name="cap" defaultValue={v("cap")} inputMode={nazione === "IT" ? "numeric" : undefined} className={campo} />
            </Campo>
            <Campo testo="Comune" classe="col-span-4">
              <input name="comune" defaultValue={v("comune")} className={campo} />
            </Campo>
            <Campo testo="Prov." classe="col-span-2 sm:col-span-1">
              <input name="provincia" defaultValue={v("provincia")} maxLength={nazione === "IT" ? 2 : 40} placeholder={nazione === "IT" ? "TV" : ""} className={`${campo} uppercase`} />
            </Campo>
            <Campo testo="Nazione" classe="col-span-6 sm:col-span-3">
              <select name="nazione" value={nazione} onChange={(e) => cambiaNazione(e.target.value)} className={campo}>
                {opzioniNazione(nazione)}
              </select>
            </Campo>
          </div>
        </Riquadro>

        {/* ---------------- Sede operativa ---------------- */}
        <Riquadro titolo="Sede operativa principale">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={operativaUguale}
              onChange={(e) => setOperativaUguale(e.target.checked)}
              className="h-4 w-4"
            />
            Uguale alla sede legale
          </label>
          {!operativaUguale && (
            <div className="grid grid-cols-6 gap-3">
              <Campo testo="Indirizzo" classe="col-span-6 sm:col-span-5">
                <input value={operativa.indirizzo} onChange={(e) => setOperativa({ ...operativa, indirizzo: e.target.value })} placeholder="Via / Piazza…" className={campo} />
              </Campo>
              <Campo testo="Civico" classe="col-span-2 sm:col-span-1">
                <input value={operativa.civico} onChange={(e) => setOperativa({ ...operativa, civico: e.target.value })} className={campo} />
              </Campo>
              <Campo testo="CAP" classe="col-span-4 sm:col-span-1">
                <input value={operativa.cap} onChange={(e) => setOperativa({ ...operativa, cap: e.target.value })} inputMode="numeric" className={campo} />
              </Campo>
              <Campo testo="Comune" classe="col-span-4">
                <input value={operativa.comune} onChange={(e) => setOperativa({ ...operativa, comune: e.target.value })} className={campo} />
              </Campo>
              <Campo testo="Prov." classe="col-span-2 sm:col-span-1">
                <input value={operativa.provincia} onChange={(e) => setOperativa({ ...operativa, provincia: e.target.value })} maxLength={operativa.nazione === "IT" ? 2 : 40} className={`${campo} uppercase`} />
              </Campo>
              <Campo testo="Nazione" classe="col-span-6 sm:col-span-3">
                <select value={operativa.nazione} onChange={(e) => setOperativa({ ...operativa, nazione: e.target.value })} className={campo}>
                  {opzioniNazione(operativa.nazione)}
                </select>
              </Campo>
              <Campo testo="Telefono" classe="col-span-6 sm:col-span-3">
                <input type="tel" value={operativa.telefono} onChange={(e) => setOperativa({ ...operativa, telefono: e.target.value })} className={campo} />
              </Campo>
              <Campo testo="Annotazioni" classe="col-span-6">
                <input value={operativa.annotazioni} onChange={(e) => setOperativa({ ...operativa, annotazioni: e.target.value })} placeholder="es. orari di consegna" className={campo} />
              </Campo>
            </div>
          )}
          <Nota>Dove si lavora davvero con loro: indirizzo di consegna proposto nei DDT.</Nota>
        </Riquadro>

        {/* ---------------- Banca ---------------- */}
        <Riquadro titolo="Banca">
          <div className="grid grid-cols-4 gap-3">
            <Campo testo={<>IBAN <Xml /></>} classe="col-span-4">
              <input
                name="iban"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                onBlur={compilaDaIban}
                className={`${campo} uppercase`}
              />
            </Campo>
            <Campo testo="ABI" classe="col-span-2 sm:col-span-1">
              <input name="abi" value={abi} onChange={(e) => setAbi(e.target.value)} inputMode="numeric" maxLength={5} className={campo} />
            </Campo>
            <Campo testo="CAB" classe="col-span-2 sm:col-span-1">
              <input name="cab" value={cab} onChange={(e) => setCab(e.target.value)} inputMode="numeric" maxLength={5} className={campo} />
            </Campo>
            <Campo testo="Banca e agenzia" classe="col-span-4 sm:col-span-2">
              <input name="banca_agenzia" defaultValue={v("banca_agenzia")} placeholder="Nome banca, filiale" className={campo} />
            </Campo>
            <Campo testo="Nostra banca d'appoggio (Ri.Ba. e bonifici)" classe="col-span-4">
              <select name="banca_aziendale_id" defaultValue={v("banca_aziendale_id")} className={campo}>
                <option value="">— nessuna —</option>
                {voci(tabelle.banche, soggetto?.banca_aziendale_id).map((b) => (
                  <option key={b.id} value={b.id}>{b.nome}</option>
                ))}
              </select>
            </Campo>
            <Campo testo="Note Ri.Ba." classe="col-span-4">
              <input name="note_riba" defaultValue={v("note_riba")} className={campo} />
            </Campo>
          </div>
          <Nota>
            Con un IBAN italiano, ABI e CAB si compilano da soli; se un cliente dà solo ABI e CAB (Ri.Ba.), si scrivono a
            mano. Le banche aziendali si gestiscono nella scheda «Codici IVA, pagamenti e banche».
          </Nota>
        </Riquadro>

        {/* ---------------- Pagamento e scadenze ---------------- */}
        <Riquadro titolo="Pagamento e scadenze">
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo testo={<>Condizione di pagamento <Xml /></>} classe="sm:col-span-2">
              <select name="condizione_pagamento_id" defaultValue={v("condizione_pagamento_id")} className={campo}>
                <option value="">— non indicata —</option>
                {voci(tabelle.condizioni, soggetto?.condizione_pagamento_id).map((c) => (
                  <option key={c.id} value={c.id}>{c.descrizione}{c.attivo ? "" : " (archiviata)"}</option>
                ))}
              </select>
            </Campo>
            <Campo testo="Listino (clienti)">
              <select disabled className={campo}>
                <option>Nessun listino</option>
              </select>
            </Campo>
            <Campo testo="Mese escluso 1">
              <SceltaMese nome="mese_escluso_1" valore={v("mese_escluso_1")} />
            </Campo>
            <Campo testo="Mese escluso 2">
              <SceltaMese nome="mese_escluso_2" valore={v("mese_escluso_2")} />
            </Campo>
            <Campo testo="Giorno fisso">
              <input name="giorno_fisso" type="number" min={1} max={31} defaultValue={v("giorno_fisso")} className={campo} />
            </Campo>
          </div>
          <Nota>
            Esempio: con giorno fisso 10 e mesi esclusi agosto e dicembre, le scadenze cadono il giorno 10; una scadenza
            che cade ad agosto o dicembre slitta all&apos;ultimo giorno dello stesso mese. Il listino non si usa: si lavora
            su misura con i preventivi a fasi.
          </Nota>
        </Riquadro>

        {/* ---------------- Reverse charge (solo fornitori) ---------------- */}
        {perFornitori && (
          <Riquadro titolo={<>Reverse charge <Etichetta>solo fornitori</Etichetta> <DaConfermare /></>}>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="reverse_charge"
                checked={reverse}
                onChange={(e) => setReverse(e.target.checked)}
                className="h-4 w-4"
              />
              Le fatture di questo fornitore sono in reverse charge
            </label>
            {reverse && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo testo={<>Documento da generare <Xml /></>} classe="sm:col-span-2">
                  <select name="rc_tipo_documento" defaultValue={v("rc_tipo_documento") || "TD17"} className={campo}>
                    {DOCUMENTI_REVERSE_CHARGE.map((d) => (
                      <option key={d.codice} value={d.codice}>{d.descrizione}</option>
                    ))}
                  </select>
                </Campo>
                <Campo testo="Natura abituale">
                  <input name="rc_natura" defaultValue={v("rc_natura")} placeholder="es. N6.9" className={`${campo} uppercase`} />
                </Campo>
                <Campo testo="Codice IVA dell'integrazione">
                  <select name="rc_codice_iva_id" defaultValue={v("rc_codice_iva_id")} className={campo}>
                    <option value="">— da scegliere —</option>
                    {voci(tabelle.codiciIva, soggetto?.rc_codice_iva_id).map((c) => (
                      <option key={c.id} value={c.id}>{c.codice} – {c.descrizione}</option>
                    ))}
                  </select>
                </Campo>
              </div>
            )}
            <Nota>
              Nel vecchio gestionale serviva un «cliente fittizio» per l&apos;autofattura. Qui l&apos;autofattura prenderà i
              dati da questa scheda: niente cliente fittizio.
            </Nota>
          </Riquadro>
        )}

        {/* ---------------- Dichiarazioni d'intento (solo clienti) ---------------- */}
        {perClienti ? (
          <Riquadro
            largo
            titolo={<>Esportatore abituale: dichiarazioni d&apos;intento <Etichetta>solo clienti</Etichetta> <Xml /> <DaConfermare /></>}
            sottotitolo="Il cliente vi manda la dichiarazione ricevuta dall'Agenzia delle Entrate. Finché è valida e c'è importo residuo, le fatture si fanno senza IVA (natura N3.5) e riportano il protocollo nell'XML."
            pulsante={
              <button type="button" className={pulsantePiccolo} onClick={() => setDichiarazioni([...dichiarazioni, dichiarazioneVuota()])}>
                + Aggiungi dichiarazione
              </button>
            }
          >
            {dichiarazioni.length === 0 ? (
              <p className="text-sm text-slate-500">Nessuna dichiarazione d&apos;intento.</p>
            ) : (
              <Tabella colonne={["Protocollo di ricezione", "Data", "Anno", "Importo dichiarato (€)", "Già fatturato", ""]} griglia="grid-cols-[2fr_1fr_0.7fr_1fr_1fr_2.25rem]">
                {dichiarazioni.map((d) => {
                  const cambia = (dati: Partial<BozzaDichiarazione>) =>
                    setDichiarazioni(dichiarazioni.map((x) => (x.chiave === d.chiave ? { ...x, ...dati } : x)));
                  return (
                    <div key={d.chiave} className="grid grid-cols-[2fr_1fr_0.7fr_1fr_1fr_2.25rem] items-center gap-2">
                      <input value={d.protocollo} onChange={(e) => cambia({ protocollo: e.target.value })} placeholder="17 cifre-6 cifre" aria-label="Protocollo" className={campo} />
                      <input type="date" value={d.data} onChange={(e) => cambia({ data: e.target.value })} aria-label="Data protocollo" className={campo} />
                      <input type="number" value={d.anno} onChange={(e) => cambia({ anno: e.target.value })} aria-label="Anno" className={campo} />
                      <input value={d.importo} onChange={(e) => cambia({ importo: e.target.value })} inputMode="decimal" aria-label="Importo dichiarato" className={campo} />
                      <input value="si calcolerà dalle fatture" readOnly tabIndex={-1} aria-label="Già fatturato" className={`${campo} bg-slate-100 text-slate-500`} />
                      <TogliRiga etichetta="Togli dichiarazione" onClick={() => setDichiarazioni(dichiarazioni.filter((x) => x.chiave !== d.chiave))} />
                    </div>
                  );
                })}
              </Tabella>
            )}
            <Nota>«Già fatturato», residuo e stato (valida, scaduta, esaurita) si calcoleranno dalle fatture emesse, quando ci sarà la fatturazione.</Nota>
          </Riquadro>
        ) : (
          props.dichiarazioni.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 lg:col-span-2">
              Questo soggetto ha dichiarazioni d&apos;intento registrate: salvandolo come solo fornitore verranno archiviate.
            </p>
          )
        )}

        {/* ---------------- Contatti ---------------- */}
        <Riquadro
          largo
          titolo="Contatti"
          sottotitolo="Un contatto per ogni ufficio o persona. «Riferimento» si sceglie dall'elenco o si scrive a mano. Le spunte dicono a chi proporre l'invio di preventivi e fatture."
          pulsante={
            <button type="button" className={pulsantePiccolo} onClick={() => setContatti([...contatti, contattoVuoto()])}>
              + Aggiungi contatto
            </button>
          }
        >
          {contatti.length === 0 ? (
            <p className="text-sm text-slate-500">Nessun contatto.</p>
          ) : (
            <Tabella
              colonne={["Riferimento", "Persona", "Email", "Telefono", "Cellulare", "Preventivi", "Fatture", ""]}
              griglia="grid-cols-[1.1fr_1.2fr_1.6fr_1fr_1fr_0.7fr_0.6fr_2.25rem]"
            >
              {contatti.map((c) => {
                const cambia = (dati: Partial<BozzaContatto>) =>
                  setContatti(contatti.map((x) => (x.chiave === c.chiave ? { ...x, ...dati } : x)));
                return (
                  <div key={c.chiave} className="grid grid-cols-[1.1fr_1.2fr_1.6fr_1fr_1fr_0.7fr_0.6fr_2.25rem] items-center gap-2">
                    <input list="riferimenti-contatto" value={c.riferimento} onChange={(e) => cambia({ riferimento: e.target.value })} placeholder="es. Commerciale" aria-label="Riferimento" className={campo} />
                    <input value={c.persona} onChange={(e) => cambia({ persona: e.target.value })} placeholder="Nome e cognome" aria-label="Persona" className={campo} />
                    <input type="email" value={c.email} onChange={(e) => cambia({ email: e.target.value })} placeholder="email@…" aria-label="Email" className={campo} />
                    <input type="tel" value={c.telefono} onChange={(e) => cambia({ telefono: e.target.value })} aria-label="Telefono" className={campo} />
                    <input type="tel" value={c.cellulare} onChange={(e) => cambia({ cellulare: e.target.value })} aria-label="Cellulare" className={campo} />
                    <label className="flex items-center gap-1.5 text-sm text-slate-700">
                      <input type="checkbox" checked={c.riceve_preventivi} onChange={(e) => cambia({ riceve_preventivi: e.target.checked })} aria-label="Riceve i preventivi" className="h-4 w-4" />
                      sì
                    </label>
                    <label className="flex items-center gap-1.5 text-sm text-slate-700">
                      <input type="checkbox" checked={c.riceve_fatture} onChange={(e) => cambia({ riceve_fatture: e.target.checked })} aria-label="Riceve le fatture" className="h-4 w-4" />
                      sì
                    </label>
                    <TogliRiga etichetta="Togli contatto" onClick={() => setContatti(contatti.filter((x) => x.chiave !== c.chiave))} />
                  </div>
                );
              })}
            </Tabella>
          )}
          <datalist id="riferimenti-contatto">
            {RIFERIMENTI_CONTATTO.map((r) => <option key={r} value={r} />)}
          </datalist>
        </Riquadro>

        {/* ---------------- Altre sedi ---------------- */}
        <Riquadro
          largo
          titolo="Altre sedi e filiali"
          sottotitolo="Magazzini, cantieri, filiali… Quelle con «Consegna» si potranno scegliere nei DDT."
          pulsante={
            <button type="button" className={pulsantePiccolo} onClick={() => setAltreSedi([...altreSedi, sedeVuota("altra")])}>
              + Aggiungi sede
            </button>
          }
        >
          {altreSedi.length === 0 ? (
            <p className="text-sm text-slate-500">Nessuna altra sede.</p>
          ) : (
            <Tabella
              colonne={["Nome", "Indirizzo", "Civico", "CAP", "Comune", "Prov.", "Nazione", "Telefono", "Annotazioni", "Consegna", ""]}
              griglia="grid-cols-[1fr_1.6fr_0.5fr_0.6fr_1.2fr_0.5fr_0.9fr_1fr_1.2fr_0.8fr_2.25rem]"
              larghezza="min-w-[1180px]"
            >
              {altreSedi.map((x) => {
                const cambia = (dati: Partial<BozzaSede>) =>
                  setAltreSedi(altreSedi.map((y) => (y.chiave === x.chiave ? { ...y, ...dati } : y)));
                return (
                  <div key={x.chiave} className="grid grid-cols-[1fr_1.6fr_0.5fr_0.6fr_1.2fr_0.5fr_0.9fr_1fr_1.2fr_0.8fr_2.25rem] items-center gap-2">
                    <input value={x.nome} onChange={(e) => cambia({ nome: e.target.value })} placeholder="es. Magazzino" aria-label="Nome sede" className={campo} />
                    <input value={x.indirizzo} onChange={(e) => cambia({ indirizzo: e.target.value })} placeholder="Via / Piazza…" aria-label="Indirizzo" className={campo} />
                    <input value={x.civico} onChange={(e) => cambia({ civico: e.target.value })} aria-label="Civico" className={campo} />
                    <input value={x.cap} onChange={(e) => cambia({ cap: e.target.value })} inputMode="numeric" aria-label="CAP" className={campo} />
                    <input value={x.comune} onChange={(e) => cambia({ comune: e.target.value })} aria-label="Comune" className={campo} />
                    <input value={x.provincia} onChange={(e) => cambia({ provincia: e.target.value })} aria-label="Provincia" className={`${campo} uppercase`} />
                    <select value={x.nazione} onChange={(e) => cambia({ nazione: e.target.value })} aria-label="Nazione" className={campo}>
                      {opzioniNazione(x.nazione, true)}
                    </select>
                    <input type="tel" value={x.telefono} onChange={(e) => cambia({ telefono: e.target.value })} aria-label="Telefono" className={campo} />
                    <input value={x.annotazioni} onChange={(e) => cambia({ annotazioni: e.target.value })} placeholder="es. orari" aria-label="Annotazioni" className={campo} />
                    <label className="flex items-center gap-1.5 text-sm text-slate-700">
                      <input type="checkbox" checked={x.consegna} onChange={(e) => cambia({ consegna: e.target.checked })} className="h-4 w-4" />
                      Consegna
                    </label>
                    <TogliRiga etichetta="Togli sede" onClick={() => setAltreSedi(altreSedi.filter((y) => y.chiave !== x.chiave))} />
                  </div>
                );
              })}
            </Tabella>
          )}
        </Riquadro>

        {/* ---------------- Note e privacy ---------------- */}
        <Riquadro titolo="Note e privacy" largo>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Campo testo="Note interne" classe="sm:col-span-2">
              <textarea name="note_interne" defaultValue={v("note_interne")} rows={3} placeholder="Visibili solo in questa scheda" className={campo} />
            </Campo>
            <Campo testo="Note da riportare su fatture e DDT" classe="sm:col-span-2">
              <textarea name="note_documenti" defaultValue={v("note_documenti")} rows={3} className={campo} />
            </Campo>
            <Campo testo="Informativa privacy inviata il">
              <input name="privacy_inviata_il" type="date" defaultValue={v("privacy_inviata_il")} className={campo} />
            </Campo>
            <Campo testo="Firmata / ricevuta il">
              <input name="privacy_firmata_il" type="date" defaultValue={v("privacy_firmata_il")} className={campo} />
            </Campo>
          </div>
        </Riquadro>
      </fieldset>

      {modificabile && (
        <div className="flex justify-end">
          <button className={pulsante} disabled={inCorso}>
            {inCorso ? "Salvataggio…" : soggetto ? "Salva modifiche" : `Aggiungi ${parola}`}
          </button>
        </div>
      )}
    </form>
  );
}


// ---------------------------------------------------------------------
// Pezzi di interfaccia usati solo in questa scheda
// ---------------------------------------------------------------------
const pulsantePiccolo =
  "min-h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60";

function Xml() {
  return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">XML</span>;
}
function DaConfermare() {
  return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">da confermare</span>;
}
function Etichetta({ children }: { children: ReactNode }) {
  return <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-800">{children}</span>;
}
function Nota({ children, classe = "" }: { children: ReactNode; classe?: string }) {
  return <p className={`text-xs text-slate-500 ${classe}`}>{children}</p>;
}

function Riquadro(props: {
  titolo: ReactNode;
  sottotitolo?: string;
  pulsante?: ReactNode;
  largo?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`${riquadro} flex min-w-0 flex-col gap-4 p-5 ${props.largo ? "lg:col-span-2" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex flex-1 flex-wrap items-center gap-2 font-semibold">{props.titolo}</h3>
        {props.pulsante}
      </div>
      {props.sottotitolo && <p className="-mt-2 text-sm text-slate-500">{props.sottotitolo}</p>}
      {props.children}
    </section>
  );
}

function Campo({ testo, classe = "", children }: { testo: ReactNode; classe?: string; children: ReactNode }) {
  return (
    <label className={`${etichetta} min-w-0 ${classe}`}>
      <span className="flex flex-wrap items-center gap-1.5">{testo}</span>
      {children}
    </label>
  );
}

/** Pulsanti a scelta singola (radio) con l'aspetto del mockup. */
function Scelte(props: {
  legenda: string;
  nome: string;
  valore: string;
  opzioni: [string, string][];
  onCambia: (valore: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className={`${etichetta} pb-1`}>{props.legenda}</legend>
      <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {props.opzioni.map(([valore, testo]) => (
          <label
            key={valore}
            className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm font-semibold has-focus-visible:ring-2 has-focus-visible:ring-blue-600/40 ${
              props.valore === valore ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            <input
              type="radio"
              name={props.nome}
              value={valore}
              checked={props.valore === valore}
              onChange={() => props.onCambia(valore)}
              className="sr-only"
            />
            {testo}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SceltaMese({ nome, valore }: { nome: string; valore: string }) {
  return (
    <select name={nome} defaultValue={valore} className={campo}>
      <option value="">— nessuno —</option>
      {MESI.map((m, i) => (
        <option key={m} value={i + 1}>{m}</option>
      ))}
    </select>
  );
}

/** Opzioni delle nazioni; se il valore salvato non è nell'elenco, lo aggiunge in cima. */
function opzioniNazione(valore: string, soloSigla = false) {
  const elenco = NAZIONI.some((n) => n.sigla === valore) ? NAZIONI : [{ sigla: valore, nome: valore }, ...NAZIONI];
  return elenco.map((n) => (
    <option key={n.sigla} value={n.sigla}>{soloSigla ? n.sigla : n.nome}</option>
  ));
}

/** Righe modificabili con intestazione; su schermi stretti scorrono di lato. */
function Tabella(props: { colonne: string[]; griglia: string; larghezza?: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <div className={`flex flex-col gap-2 ${props.larghezza ?? "min-w-[960px]"}`}>
        <div className={`grid gap-2 ${props.griglia}`}>
          {props.colonne.map((c, i) => (
            <span key={i} className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{c}</span>
          ))}
        </div>
        {props.children}
      </div>
    </div>
  );
}

function TogliRiga({ etichetta: testo, onClick }: { etichetta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={testo}
      className="h-9 w-9 rounded-lg text-lg text-slate-500 hover:bg-red-100 hover:text-red-700"
    >
      ×
    </button>
  );
}
