// Elenco dipendenti, usato in Impostazioni e in Anagrafiche → Dipendenti.
// Il titolare può aggiungere e modificare; gli altri ruoli vedono una tabella in sola lettura.
import { salvaDipendente } from "@/app/(app)/impostazioni/azioni";

export type DipendenteElenco = {
  id: string;
  nome: string;
  cognome: string;
  mansione_principale: string | null;
  profilo_id: string | null;
  attivo: boolean;
};
export type AccountElenco = { id: string; email: string; nome_visualizzato: string };

type Props = {
  dipendenti: DipendenteElenco[];
  account: AccountElenco[];
  modificabile: boolean;
  /** pagina a cui tornare dopo il salvataggio (deve essere tra quelle ammesse in impostazioni/azioni.ts) */
  ritorno: string;
};

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-100 disabled:text-slate-500";
const etichetta = "flex flex-col gap-1 text-xs font-medium text-slate-500";
const pulsante = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700";

export default function ElencoDipendenti({ dipendenti, account, modificabile, ritorno }: Props) {
  if (!modificabile) {
    return (
      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {dipendenti.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Nessun dipendente inserito.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <th className="px-4 py-3">Cognome e nome</th>
                <th className="px-4 py-3">Mansione principale</th>
                <th className="px-4 py-3">Usa l&apos;app</th>
                <th className="px-4 py-3">Stato</th>
              </tr>
            </thead>
            <tbody>
              {dipendenti.map((d) => (
                <tr key={d.id} className={`border-b border-slate-100 ${d.attivo ? "" : "text-slate-400"}`}>
                  <td className="px-4 py-3 font-medium">{d.cognome} {d.nome}</td>
                  <td className="px-4 py-3">{d.mansione_principale}</td>
                  <td className="px-4 py-3">{d.profilo_id ? "Sì" : "No"}</td>
                  <td className="px-4 py-3">{d.attivo ? "Attivo" : "Non attivo"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  }

  const collegati = new Set(dipendenti.map((d) => d.profilo_id).filter(Boolean));
  const accountLiberi = (attuale: string | null) =>
    account.filter((p) => !collegati.has(p.id) || p.id === attuale);

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <h2 className="font-semibold">Dipendenti</h2>
        <p className="mt-1 text-sm text-slate-500">
          Collega un account se il dipendente usa l&apos;app (es. per timbrare dal telefono).
        </p>
      </div>

      <form action={salvaDipendente} className="grid items-end gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_1fr_1fr_1.2fr_auto]">
        <input type="hidden" name="ritorno" value={ritorno} />
        <label className={etichetta}>
          Nome
          <input name="nome" required className={campo} />
        </label>
        <label className={etichetta}>
          Cognome
          <input name="cognome" required className={campo} />
        </label>
        <label className={etichetta}>
          Mansione principale
          <input name="mansione_principale" placeholder="es. Assemblaggio" className={campo} />
        </label>
        <label className={etichetta}>
          Account
          <select name="profilo_id" defaultValue="" className={campo}>
            <option value="">— nessuno —</option>
            {accountLiberi(null).map((p) => (
              <option key={p.id} value={p.id}>{p.nome_visualizzato || p.email}</option>
            ))}
          </select>
        </label>
        <button className={pulsante}>Aggiungi</button>
      </form>

      {dipendenti.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Nessun dipendente inserito.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {dipendenti.map((d) => (
            <li key={d.id} className={`p-4 ${d.attivo ? "" : "opacity-60"}`}>
              <form
                action={salvaDipendente}
                className="grid items-end gap-3 md:grid-cols-[1fr_1fr_1fr_1.2fr_auto_auto]"
              >
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="ritorno" value={ritorno} />
                <label className={etichetta}>
                  Nome
                  <input name="nome" defaultValue={d.nome} required className={campo} />
                </label>
                <label className={etichetta}>
                  Cognome
                  <input name="cognome" defaultValue={d.cognome} required className={campo} />
                </label>
                <label className={etichetta}>
                  Mansione principale
                  <input name="mansione_principale" defaultValue={d.mansione_principale ?? ""} className={campo} />
                </label>
                <label className={etichetta}>
                  Account
                  <select name="profilo_id" defaultValue={d.profilo_id ?? ""} className={campo}>
                    <option value="">— nessuno —</option>
                    {accountLiberi(d.profilo_id).map((p) => (
                      <option key={p.id} value={p.id}>{p.nome_visualizzato || p.email}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input type="checkbox" name="attivo" defaultChecked={d.attivo} className="h-4 w-4" />
                  Attivo
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
