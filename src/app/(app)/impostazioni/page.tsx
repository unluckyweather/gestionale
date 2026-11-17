// Impostazioni (solo titolare): attivazione account, ruoli e anagrafica dipendenti.
import { richiediSezione } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { ETICHETTE_RUOLO, RUOLI, type Ruolo } from "@/lib/ruoli";
import { salvaDipendente, salvaProfilo } from "./azioni";

type Profilo = { id: string; email: string; nome_visualizzato: string; ruolo: Ruolo; attivo: boolean };
type Dipendente = {
  id: string;
  nome: string;
  cognome: string;
  mansione_principale: string | null;
  profilo_id: string | null;
  attivo: boolean;
};

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-100 disabled:text-slate-500";
const etichetta = "flex flex-col gap-1 text-xs font-medium text-slate-500";
const pulsante = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700";

export default async function Impostazioni({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; errore?: string }>;
}) {
  const io = await richiediSezione("/impostazioni");
  const { ok, errore } = await searchParams;

  const supabase = await creaClientServer();
  const [risProfili, risDipendenti] = await Promise.all([
    supabase
      .from("profili")
      .select("id, email, nome_visualizzato, ruolo, attivo")
      .order("attivo", { ascending: true })
      .order("email"),
    supabase
      .from("dipendenti")
      .select("id, nome, cognome, mansione_principale, profilo_id, attivo")
      .order("attivo", { ascending: false })
      .order("cognome"),
  ]);
  const profili = (risProfili.data ?? []) as Profilo[];
  const dipendenti = (risDipendenti.data ?? []) as Dipendente[];

  const collegati = new Set(dipendenti.map((d) => d.profilo_id).filter(Boolean));
  const accountLiberi = (attuale: string | null) =>
    profili.filter((p) => !collegati.has(p.id) || p.id === attuale);

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Impostazioni</h1>
        <p className="mt-1 text-sm text-slate-500">Account, ruoli e personale.</p>
      </header>

      {ok && (
        <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{ok}</p>
      )}
      {errore && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{errore}</p>
      )}

      {/* ---------------- Account ---------------- */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold">Account</h2>
          <p className="mt-1 text-sm text-slate-500">
            I nuovi account si creano su Supabase (Authentication → Users → Add user) e compaiono qui
            disattivati: scegli il ruolo e attivali.
          </p>
        </div>
        <ul className="divide-y divide-slate-100">
          {profili.map((p) => {
            const sonoIo = p.id === io.id;
            return (
              <li key={p.id} className="p-4">
                <form
                  action={salvaProfilo}
                  className="grid items-end gap-3 md:grid-cols-[1.4fr_1.2fr_1fr_auto_auto]"
                >
                  <input type="hidden" name="id" value={p.id} />
                  <div className="text-sm">
                    <div className="truncate font-medium" title={p.email}>{p.email}</div>
                    <div className={`text-xs ${p.attivo ? "text-green-700" : "text-amber-700"}`}>
                      {p.attivo ? "Attivo" : "Da attivare / disattivato"}
                      {sonoIo && " · sei tu"}
                    </div>
                  </div>
                  <label className={etichetta}>
                    Nome visualizzato
                    <input name="nome_visualizzato" defaultValue={p.nome_visualizzato} className={campo} />
                  </label>
                  <label className={etichetta}>
                    Ruolo
                    <select name="ruolo" defaultValue={p.ruolo} disabled={sonoIo} className={campo}>
                      {RUOLI.map((r) => (
                        <option key={r} value={r}>{ETICHETTE_RUOLO[r]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <input
                      type="checkbox"
                      name="attivo"
                      defaultChecked={p.attivo}
                      disabled={sonoIo}
                      className="h-4 w-4"
                    />
                    Attivo
                  </label>
                  <button className={pulsante}>Salva</button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------------- Dipendenti ---------------- */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold">Dipendenti</h2>
          <p className="mt-1 text-sm text-slate-500">
            Collega un account se il dipendente usa l&apos;app (es. per timbrare dal telefono).
          </p>
        </div>

        <form action={salvaDipendente} className="grid items-end gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_1fr_1fr_1.2fr_auto]">
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
    </div>
  );
}
