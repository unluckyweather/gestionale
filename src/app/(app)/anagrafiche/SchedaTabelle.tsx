// Scheda "Codici IVA, pagamenti e banche": le tabelle di servizio usate nelle schede di clienti e fornitori.
// Codici IVA, condizioni di pagamento e banche aziendali le modificano titolare e contabilità;
// le categorie merceologiche titolare e ufficio (come clienti e fornitori).
import type { ReactNode } from "react";
import { creaClientServer } from "@/lib/supabase/server";
import { salvaBancaAziendale, salvaCategoria, salvaCodiceIva, salvaCondizionePagamento } from "./azioni";
import { leggiTabelle } from "./dati";
import { campo, etichetta, pulsante, riquadro } from "./stile";

type Props = { modificaFiscali: boolean; modificaCategorie: boolean };

const ALIQUOTE = [22, 10, 5, 4, 0];

export default async function SchedaTabelle({ modificaFiscali, modificaCategorie }: Props) {
  const supabase = await creaClientServer();
  const { codiciIva, condizioni, banche, categorie } = await leggiTabelle(supabase);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      {/* ---------------- Codici IVA ---------------- */}
      <Sezione
        titolo="Codici IVA"
        descrizione="Aliquota e, per le operazioni senza IVA, la natura per la fattura elettronica (N1…N7). Elenco da confermare con il commercialista."
        modificabile={modificaFiscali}
        chi="titolare e contabilità"
        largo
      >
        {modificaFiscali && (
          <form action={salvaCodiceIva} className="grid items-end gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-[6rem_minmax(0,1fr)_6rem_6rem_auto]">
            <CampiCodiceIva />
            <button className={pulsante}>Aggiungi</button>
          </form>
        )}
        <ul className="divide-y divide-slate-100">
          {codiciIva.map((c) => (
            <Riga key={c.id} azione={salvaCodiceIva} id={c.id} attivo={c.attivo} modificabile={modificaFiscali} griglia="sm:grid-cols-[6rem_minmax(0,1fr)_6rem_6rem_auto_auto]">
              <CampiCodiceIva codice={c.codice} descrizione={c.descrizione} aliquota={Number(c.aliquota)} natura={c.natura} />
            </Riga>
          ))}
        </ul>
      </Sezione>

      {/* ---------------- Condizioni di pagamento ---------------- */}
      <Sezione
        titolo="Condizioni di pagamento"
        descrizione="Si scelgono nella scheda di ogni cliente e fornitore. Le rate e la modalità per l'XML si aggiungeranno con la fatturazione."
        modificabile={modificaFiscali}
        chi="titolare e contabilità"
      >
        {modificaFiscali && (
          <form action={salvaCondizionePagamento} className="grid items-end gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_6rem_auto]">
            <CampiCondizione giorni={30} />
            <button className={pulsante}>Aggiungi</button>
          </form>
        )}
        <ul className="divide-y divide-slate-100">
          {condizioni.map((c) => (
            <Riga key={c.id} azione={salvaCondizionePagamento} id={c.id} attivo={c.attivo} modificabile={modificaFiscali} griglia="sm:grid-cols-[1fr_6rem_auto_auto]">
              <CampiCondizione descrizione={c.descrizione} giorni={c.giorni} />
            </Riga>
          ))}
        </ul>
      </Sezione>

      {/* ---------------- Banche aziendali ---------------- */}
      <Sezione
        titolo="Banche aziendali"
        descrizione="Le banche dell'azienda: si scelgono come «nostra banca d'appoggio» per Ri.Ba. e bonifici."
        modificabile={modificaFiscali}
        chi="titolare e contabilità"
      >
        {modificaFiscali && (
          <form action={salvaBancaAziendale} className="grid items-end gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <CampiBanca />
            <button className={`${pulsante} sm:col-span-2`}>Aggiungi</button>
          </form>
        )}
        {banche.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Nessuna banca aziendale.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {banche.map((b) => (
              <Riga key={b.id} azione={salvaBancaAziendale} id={b.id} attivo={b.attivo} modificabile={modificaFiscali} griglia="sm:grid-cols-2">
                <CampiBanca nome={b.nome} iban={b.iban} abi={b.abi} cab={b.cab} note={b.note} />
              </Riga>
            ))}
          </ul>
        )}
      </Sezione>

      {/* ---------------- Categorie ---------------- */}
      <Sezione
        titolo="Categorie merceologiche"
        descrizione="Per raggruppare clienti e fornitori (facoltative)."
        modificabile={modificaCategorie}
        chi="titolare e ufficio"
      >
        {modificaCategorie && (
          <form action={salvaCategoria} className="grid items-end gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_auto]">
            <label className={etichetta}>
              Descrizione
              <input name="descrizione" required placeholder="es. Arredamento negozi" className={campo} />
            </label>
            <button className={pulsante}>Aggiungi</button>
          </form>
        )}
        {categorie.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Nessuna categoria.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {categorie.map((c) => (
              <Riga key={c.id} azione={salvaCategoria} id={c.id} attivo={c.attivo} modificabile={modificaCategorie} griglia="sm:grid-cols-[1fr_auto_auto]">
                <label className={etichetta}>
                  Descrizione
                  <input name="descrizione" defaultValue={c.descrizione} required className={campo} />
                </label>
              </Riga>
            ))}
          </ul>
        )}
      </Sezione>
    </div>
  );
}


/** largo = occupa tutta la larghezza (serve ai Codici IVA, che hanno molte colonne). */
function Sezione(props: {
  titolo: string;
  descrizione: string;
  modificabile: boolean;
  chi: string;
  largo?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`${riquadro} min-w-0 ${props.largo ? "xl:col-span-2" : ""}`}>
      <div className="border-b border-slate-200 p-4">
        <h2 className="font-semibold">{props.titolo}</h2>
        <p className="mt-1 text-sm text-slate-500">{props.descrizione}</p>
        {!props.modificabile && <p className="mt-1 text-xs text-slate-500">Sola lettura: la modificano {props.chi}.</p>}
      </div>
      {props.children}
    </section>
  );
}

/** Una riga già salvata: i suoi campi, la spunta "Attivo" e il pulsante Salva. */
function Riga(props: {
  azione: (dati: FormData) => Promise<void>;
  id: string;
  attivo: boolean;
  modificabile: boolean;
  griglia: string;
  children: ReactNode;
}) {
  return (
    <li className={`p-4 ${props.attivo ? "" : "opacity-60"}`}>
      <form action={props.azione} className={`grid items-end gap-3 ${props.griglia}`}>
        <input type="hidden" name="id" value={props.id} />
        <fieldset disabled={!props.modificabile} className="contents">
          {props.children}
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="attivo" defaultChecked={props.attivo} className="h-4 w-4" />
            Attivo
          </label>
        </fieldset>
        {props.modificabile && <button className={pulsante}>Salva</button>}
      </form>
    </li>
  );
}

function CampiCodiceIva(p: { codice?: string; descrizione?: string; aliquota?: number; natura?: string | null }) {
  return (
    <>
      <label className={etichetta}>
        Codice
        <input name="codice" defaultValue={p.codice ?? ""} required placeholder="es. N3.1" className={campo} />
      </label>
      <label className={etichetta}>
        Descrizione
        <input name="descrizione" defaultValue={p.descrizione ?? ""} required className={campo} />
      </label>
      <label className={etichetta}>
        Aliquota
        <select name="aliquota" defaultValue={String(p.aliquota ?? 22)} className={campo}>
          {ALIQUOTE.map((a) => <option key={a} value={a}>{a}%</option>)}
        </select>
      </label>
      <label className={etichetta}>
        Natura
        <input name="natura" defaultValue={p.natura ?? ""} placeholder="se 0%" className={`${campo} uppercase`} />
      </label>
    </>
  );
}

function CampiCondizione(p: { descrizione?: string; giorni: number }) {
  return (
    <>
      <label className={etichetta}>
        Descrizione
        <input name="descrizione" defaultValue={p.descrizione ?? ""} required placeholder="es. Ri.Ba. 60 gg fine mese" className={campo} />
      </label>
      <label className={etichetta}>
        Giorni
        <input name="giorni" type="number" min={0} max={365} defaultValue={p.giorni} className={campo} />
      </label>
    </>
  );
}

function CampiBanca(p: { nome?: string; iban?: string | null; abi?: string | null; cab?: string | null; note?: string | null }) {
  return (
    <>
      <label className={etichetta}>
        Nome
        <input name="nome" defaultValue={p.nome ?? ""} required placeholder="es. Banca …, filiale di …" className={campo} />
      </label>
      <label className={etichetta}>
        IBAN
        <input name="iban" defaultValue={p.iban ?? ""} className={`${campo} uppercase`} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={etichetta}>
          ABI
          <input name="abi" defaultValue={p.abi ?? ""} inputMode="numeric" maxLength={5} className={campo} />
        </label>
        <label className={etichetta}>
          CAB
          <input name="cab" defaultValue={p.cab ?? ""} inputMode="numeric" maxLength={5} className={campo} />
        </label>
      </div>
      <label className={etichetta}>
        Note
        <input name="note" defaultValue={p.note ?? ""} className={campo} />
      </label>
    </>
  );
}
