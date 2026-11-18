"use client";
// Scheda di un cliente o fornitore (nuovo o esistente).
// Se il salvataggio non va, il server restituisce l'errore e i valori scritti: il modulo resta compilato.
import { useActionState } from "react";
import { salvaSoggetto, type StatoModulo } from "./azioni";
import { campo, etichetta, pulsante } from "./stile";
import {
  ETICHETTE_TIPO_SOGGETTO,
  type CondizionePagamento,
  type Listino,
  type Soggetto,
  type TipoSoggetto,
} from "./tipi";

type Props = {
  soggetto: Soggetto | null; // null = nuovo
  scheda: "clienti" | "fornitori";
  condizioni: CondizionePagamento[];
  listini: Listino[];
  modificabile: boolean;
};

export default function ModuloSoggetto({ soggetto, scheda, condizioni, listini, modificabile }: Props) {
  const [stato, azione, inCorso] = useActionState<StatoModulo, FormData>(salvaSoggetto, {});

  // valore da mostrare: quello appena scritto (se c'è stato un errore) o quello salvato
  const v = (nome: keyof Soggetto): string =>
    stato.valori ? (stato.valori[nome] ?? "") : String(soggetto?.[nome] ?? "");

  const tipoIniziale: TipoSoggetto = scheda === "fornitori" ? "fornitore" : "cliente";
  const attivo = stato.valori ? stato.valori.attivo === "on" : (soggetto?.attivo ?? true);
  const titolo = soggetto ? soggetto.ragione_sociale : scheda === "fornitori" ? "Nuovo fornitore" : "Nuovo cliente";

  // nelle tendine compaiono le voci attive, più quella già scelta anche se archiviata
  const condizioniVisibili = condizioni.filter((c) => c.attivo || c.id === soggetto?.condizione_pagamento_id);
  const listiniVisibili = listini.filter((l) => l.attivo || l.id === soggetto?.listino_id);

  return (
    <form action={azione} className="flex flex-col gap-4 p-5">
      <h2 className="text-lg font-semibold">{titolo}</h2>

      {stato.errore && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{stato.errore}</p>
      )}
      {!modificabile && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">Sola lettura per il tuo ruolo.</p>
      )}

      <input type="hidden" name="id" value={soggetto?.id ?? ""} />
      <input type="hidden" name="scheda" value={scheda} />

      <fieldset disabled={!modificabile || inCorso} className="grid grid-cols-2 gap-3">
        <label className={`${etichetta} col-span-2`}>
          Ragione sociale *
          <input name="ragione_sociale" defaultValue={v("ragione_sociale")} required className={campo} />
        </label>
        <label className={etichetta}>
          Tipo
          <select name="tipo" defaultValue={v("tipo") || tipoIniziale} className={campo}>
            {(Object.keys(ETICHETTE_TIPO_SOGGETTO) as TipoSoggetto[]).map((t) => (
              <option key={t} value={t}>{ETICHETTE_TIPO_SOGGETTO[t]}</option>
            ))}
          </select>
        </label>
        <label className={etichetta}>
          Referente
          <input name="referente" defaultValue={v("referente")} className={campo} />
        </label>

        <h3 className="col-span-2 mt-2 text-sm font-semibold text-slate-700">Dati fiscali</h3>
        <label className={etichetta}>
          Partita IVA
          <input name="partita_iva" defaultValue={v("partita_iva")} inputMode="numeric" maxLength={16} className={campo} />
        </label>
        <label className={etichetta}>
          Codice fiscale
          <input name="codice_fiscale" defaultValue={v("codice_fiscale")} maxLength={16} className={`${campo} uppercase`} />
        </label>
        <label className={etichetta}>
          Codice SDI
          <input name="codice_sdi" defaultValue={v("codice_sdi")} maxLength={7} placeholder="7 caratteri" className={`${campo} uppercase`} />
        </label>
        <label className={etichetta}>
          PEC
          <input name="pec" type="email" defaultValue={v("pec")} className={campo} />
        </label>

        <h3 className="col-span-2 mt-2 text-sm font-semibold text-slate-700">Indirizzo e contatti</h3>
        <label className={`${etichetta} col-span-2`}>
          Indirizzo
          <input name="indirizzo" defaultValue={v("indirizzo")} placeholder="Via e numero civico" className={campo} />
        </label>
        <div className="col-span-2 grid grid-cols-[6rem_1fr_4.5rem] gap-3">
          <label className={etichetta}>
            CAP
            <input name="cap" defaultValue={v("cap")} inputMode="numeric" maxLength={5} className={campo} />
          </label>
          <label className={etichetta}>
            Città
            <input name="citta" defaultValue={v("citta")} className={campo} />
          </label>
          <label className={etichetta}>
            Prov.
            <input name="provincia" defaultValue={v("provincia")} maxLength={2} className={`${campo} uppercase`} />
          </label>
        </div>
        <label className={etichetta}>
          Email
          <input name="email" type="email" defaultValue={v("email")} className={campo} />
        </label>
        <label className={etichetta}>
          Telefono
          <input name="telefono" type="tel" defaultValue={v("telefono")} className={campo} />
        </label>

        <h3 className="col-span-2 mt-2 text-sm font-semibold text-slate-700">Condizioni commerciali</h3>
        <label className={etichetta}>
          Pagamento
          <select name="condizione_pagamento_id" defaultValue={v("condizione_pagamento_id")} className={campo}>
            <option value="">— non indicato —</option>
            {condizioniVisibili.map((c) => (
              <option key={c.id} value={c.id}>{c.descrizione}{c.attivo ? "" : " (archiviata)"}</option>
            ))}
          </select>
        </label>
        <label className={etichetta}>
          Listino
          <select name="listino_id" defaultValue={v("listino_id")} className={campo}>
            <option value="">Prezzo base</option>
            {listiniVisibili.map((l) => (
              <option key={l.id} value={l.id}>{l.nome}{l.attivo ? "" : " (archiviato)"}</option>
            ))}
          </select>
        </label>
        <label className={`${etichetta} col-span-2`}>
          Note
          <textarea name="note" defaultValue={v("note")} rows={3} className={campo} />
        </label>

        {soggetto && (
          <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="attivo" defaultChecked={attivo} className="h-4 w-4" />
            Attivo (togli la spunta per archiviarlo: non comparirà più nelle scelte)
          </label>
        )}
      </fieldset>

      {modificabile && (
        <button className={pulsante} disabled={inCorso}>
          {inCorso ? "Salvataggio…" : soggetto ? "Salva modifiche" : "Aggiungi"}
        </button>
      )}
    </form>
  );
}
