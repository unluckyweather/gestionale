// Scheda Pagamenti e listini: le due tabelle "di servizio" usate nelle schede dei clienti.
import { creaClientServer } from "@/lib/supabase/server";
import { salvaCondizionePagamento, salvaListino } from "./azioni";
import { campo, etichetta, pulsante, riquadro } from "./stile";
import type { CondizionePagamento, Listino } from "./tipi";

export default async function SchedaPagamenti({ modificabile }: { modificabile: boolean }) {
  const supabase = await creaClientServer();
  const [risCondizioni, risListini] = await Promise.all([
    supabase
      .from("condizioni_pagamento")
      .select("id, descrizione, giorni, attivo")
      .order("attivo", { ascending: false })
      .order("giorni")
      .order("descrizione"),
    supabase.from("listini").select("id, nome, note, attivo").order("attivo", { ascending: false }).order("nome"),
  ]);
  const condizioni = (risCondizioni.data ?? []) as CondizionePagamento[];
  const listini = (risListini.data ?? []) as Listino[];

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {/* ---------------- Condizioni di pagamento ---------------- */}
      <section className={riquadro}>
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold">Condizioni di pagamento</h2>
          <p className="mt-1 text-sm text-slate-500">Si scelgono nella scheda di ogni cliente e fornitore.</p>
        </div>

        {modificabile && (
          <form action={salvaCondizionePagamento} className="grid items-end gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_6rem_auto]">
            <label className={etichetta}>
              Descrizione
              <input name="descrizione" required placeholder="es. Ri.Ba. 60 gg fine mese" className={campo} />
            </label>
            <label className={etichetta}>
              Giorni
              <input name="giorni" type="number" min={0} max={365} defaultValue={30} className={campo} />
            </label>
            <button className={pulsante}>Aggiungi</button>
          </form>
        )}

        <ul className="divide-y divide-slate-100">
          {condizioni.map((c) => (
            <li key={c.id} className={`p-4 ${c.attivo ? "" : "opacity-60"}`}>
              <form action={salvaCondizionePagamento} className="grid items-end gap-3 sm:grid-cols-[1fr_6rem_auto_auto]">
                <input type="hidden" name="id" value={c.id} />
                <fieldset disabled={!modificabile} className="contents">
                  <label className={etichetta}>
                    Descrizione
                    <input name="descrizione" defaultValue={c.descrizione} required className={campo} />
                  </label>
                  <label className={etichetta}>
                    Giorni
                    <input name="giorni" type="number" min={0} max={365} defaultValue={c.giorni} className={campo} />
                  </label>
                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <input type="checkbox" name="attivo" defaultChecked={c.attivo} className="h-4 w-4" />
                    Attiva
                  </label>
                </fieldset>
                {modificabile && <button className={pulsante}>Salva</button>}
              </form>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------- Listini ---------------- */}
      <section className={riquadro}>
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold">Listini</h2>
          <p className="mt-1 text-sm text-slate-500">
            Un cliente senza listino paga il prezzo base. I prezzi di ogni listino si scrivono nella scheda
            dell&apos;articolo; se un articolo non ha prezzo nel listino, vale il prezzo base.
          </p>
        </div>

        {modificabile && (
          <form action={salvaListino} className="grid items-end gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_auto]">
            <label className={etichetta}>
              Nome
              <input name="nome" required placeholder="es. Rivenditori" className={campo} />
            </label>
            <label className={etichetta}>
              Note
              <input name="note" className={campo} />
            </label>
            <button className={pulsante}>Aggiungi</button>
          </form>
        )}

        {listini.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Nessun listino: tutti i clienti pagano il prezzo base.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {listini.map((l) => (
              <li key={l.id} className={`p-4 ${l.attivo ? "" : "opacity-60"}`}>
                <form action={salvaListino} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
                  <input type="hidden" name="id" value={l.id} />
                  <fieldset disabled={!modificabile} className="contents">
                    <label className={etichetta}>
                      Nome
                      <input name="nome" defaultValue={l.nome} required className={campo} />
                    </label>
                    <label className={etichetta}>
                      Note
                      <input name="note" defaultValue={l.note ?? ""} className={campo} />
                    </label>
                    <label className="flex items-center gap-2 pb-2 text-sm">
                      <input type="checkbox" name="attivo" defaultChecked={l.attivo} className="h-4 w-4" />
                      Attivo
                    </label>
                  </fieldset>
                  {modificabile && <button className={pulsante}>Salva</button>}
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
