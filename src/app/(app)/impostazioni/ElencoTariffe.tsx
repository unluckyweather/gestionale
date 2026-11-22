// Tariffe orarie (solo titolare): costo di un'ora di lavoro di una persona, di una macchina o della posa.
// Le usano le righe di ore dei preventivi. Il costo viene COPIATO nel preventivo quando si crea la riga:
// cambiando una tariffa, i preventivi già fatti restano com'erano.
import { salvaTariffa } from "./azioni";

export type Tariffa = {
  id: string;
  nome: string;
  tipo: TipoTariffa;
  costo_orario: number;
  note: string | null;
  attivo: boolean;
};

export type TipoTariffa = "persona" | "macchina" | "posa";

export const TIPI_TARIFFA: { valore: TipoTariffa; etichetta: string }[] = [
  { valore: "persona", etichetta: "Persona / reparto" },
  { valore: "macchina", etichetta: "Macchina" },
  { valore: "posa", etichetta: "Posa (trasferta compresa)" },
];

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-100 disabled:text-slate-500";
const etichetta = "flex flex-col gap-1 text-xs font-medium text-slate-500";
const pulsante = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700";
const colonne = "md:grid-cols-[1.4fr_1.1fr_0.7fr_1.4fr_auto_auto]";

/** 45 → "45,00" (come si scrive nel campo) */
function scriviCosto(valore: number): string {
  return Number(valore).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ElencoTariffe({ tariffe }: { tariffe: Tariffa[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <h2 className="font-semibold">Tariffe orarie</h2>
        <p className="mt-1 text-sm text-slate-500">
          Costo di un&apos;ora di lavoro, IVA esclusa, usato nei preventivi. Se cambi una tariffa,
          i preventivi già fatti non cambiano: vale per le righe nuove.
        </p>
      </div>

      {/* Nuova tariffa */}
      <form action={salvaTariffa} className={`grid items-end gap-3 border-b border-slate-200 bg-slate-50 p-4 ${colonne}`}>
        <label className={etichetta}>
          Nome
          <input name="nome" required placeholder="es. Plotter da taglio" className={campo} />
        </label>
        <label className={etichetta}>
          Tipo
          <select name="tipo" defaultValue="persona" className={campo}>
            {TIPI_TARIFFA.map((t) => (
              <option key={t.valore} value={t.valore}>{t.etichetta}</option>
            ))}
          </select>
        </label>
        <label className={etichetta}>
          € / ora
          <input name="costo_orario" required inputMode="decimal" placeholder="0,00" className={`${campo} text-right`} />
        </label>
        <label className={etichetta}>
          Note
          <input name="note" className={campo} />
        </label>
        <span aria-hidden="true" />
        <button className={pulsante}>Aggiungi</button>
      </form>

      {tariffe.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Nessuna tariffa inserita.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {tariffe.map((t) => (
            <li key={t.id} className={`p-4 ${t.attivo ? "" : "opacity-60"}`}>
              <form action={salvaTariffa} className={`grid items-end gap-3 ${colonne}`}>
                <input type="hidden" name="id" value={t.id} />
                <label className={etichetta}>
                  Nome
                  <input name="nome" defaultValue={t.nome} required className={campo} />
                </label>
                <label className={etichetta}>
                  Tipo
                  <select name="tipo" defaultValue={t.tipo} className={campo}>
                    {TIPI_TARIFFA.map((x) => (
                      <option key={x.valore} value={x.valore}>{x.etichetta}</option>
                    ))}
                  </select>
                </label>
                <label className={etichetta}>
                  € / ora
                  <input
                    name="costo_orario"
                    defaultValue={scriviCosto(t.costo_orario)}
                    required
                    inputMode="decimal"
                    className={`${campo} text-right`}
                  />
                </label>
                <label className={etichetta}>
                  Note
                  <input name="note" defaultValue={t.note ?? ""} className={campo} />
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input type="checkbox" name="attivo" defaultChecked={t.attivo} className="h-4 w-4" />
                  Attiva
                </label>
                <button className={pulsante}>Salva</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
