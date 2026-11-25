"use client";
// Conferma del materiale usato per la commessa: per ogni articolo la quantità usata
// adesso (proposta: quello che manca rispetto al previsto). Numero negativo = materiale
// avanzato che torna in magazzino. Si salva tutto insieme (scarica_materiali, 0011).
import { useActionState, useState } from "react";
import { quantitaConUnita } from "@/lib/magazzino";
import { campo, etichetta, pulsante, pulsanteSecondario } from "../anagrafiche/stile";
import { scaricaMateriali, type EsitoMateriali } from "./azioni";

export type RigaMateriale = {
  articolo_id: string;
  nome: string;
  unita: string;
  previsto: number | null;
  dalPreventivo: boolean;
  usato: number;
  giacenza: number;
  proposta: number;
};
type Articolo = { articolo_id: string; nome: string; unita: string; giacenza: number };

const campoNumero = (n: number) => (n ? String(n).replace(".", ",") : "");

export default function ModuloMateriali({ commessaId, righe, articoli, oggi }: { commessaId: string; righe: RigaMateriale[]; articoli: Articolo[]; oggi: string }) {
  const [esito, azione, inCorso] = useActionState<EsitoMateriali, FormData>(scaricaMateriali, {});
  const [quantita, setQuantita] = useState<Record<string, string>>(() =>
    Object.fromEntries(righe.map((r) => [r.articolo_id, campoNumero(r.proposta)]))
  );
  const [aggiunti, setAggiunti] = useState<Articolo[]>([]);
  const [scelta, setScelta] = useState("");

  const tutte: (RigaMateriale | (Articolo & { previsto: null; usato: number; dalPreventivo: false; proposta: 0 }))[] = [
    ...righe,
    ...aggiunti.map((a) => ({ ...a, previsto: null, usato: 0, dalPreventivo: false as const, proposta: 0 as const })),
  ];
  const disponibili = articoli.filter((a) => !tutte.some((r) => r.articolo_id === a.articolo_id));
  const daMandare = tutte.map((r) => ({ articolo_id: r.articolo_id, nome: r.nome, quantita: quantita[r.articolo_id] ?? "" }));
  const compilate = daMandare.filter((r) => r.quantita.trim() && r.quantita.trim() !== "0").length;

  return (
    <form action={azione} className="flex flex-col">
      <input type="hidden" name="commessa_id" value={commessaId} />
      <input type="hidden" name="righe" value={JSON.stringify(daMandare)} />
      {tutte.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Nessun materiale previsto: aggiungi gli articoli usati qui sotto.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-2">Articolo</th>
                <th className="px-4 py-2 text-right">Previsto</th>
                <th className="px-4 py-2 text-right">Già usato</th>
                <th className="px-4 py-2 text-right">In magazzino</th>
                <th className="w-36 px-4 py-2 text-right">Usato adesso</th>
              </tr>
            </thead>
            <tbody>
              {tutte.map((r) => {
                const completo = r.previsto !== null && r.usato >= r.previsto;
                return (
                  <tr key={r.articolo_id} className="border-b border-slate-100">
                    <td className="px-4 py-2">
                      {r.nome}
                      {!r.dalPreventivo && <span className="ml-1 text-xs text-slate-500">(non previsto)</span>}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {r.previsto === null ? (r.dalPreventivo ? "non calcolabile" : "—") : quantitaConUnita(r.previsto, r.unita)}
                    </td>
                    <td className={`px-4 py-2 text-right whitespace-nowrap ${completo ? "font-semibold text-green-800" : ""}`}>
                      {quantitaConUnita(r.usato, r.unita)}
                    </td>
                    <td className={`px-4 py-2 text-right whitespace-nowrap ${r.giacenza < 0 ? "font-semibold text-red-700" : ""}`}>
                      {quantitaConUnita(r.giacenza, r.unita)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          value={quantita[r.articolo_id] ?? ""}
                          onChange={(e) => setQuantita((q) => ({ ...q, [r.articolo_id]: e.target.value }))}
                          inputMode="decimal"
                          placeholder="0"
                          aria-label={`${r.nome}: quantità usata adesso (${r.unita})`}
                          className={`${campo} text-right`}
                        />
                        <span className="text-xs text-slate-500">{r.unita}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 p-4">
        <label className={`${etichetta} flex-[2_1_14rem]`}>
          Aggiungi un articolo usato
          <select value={scelta} onChange={(e) => setScelta(e.target.value)} className={campo}>
            <option value="">Scegli dal catalogo…</option>
            {disponibili.map((a) => (
              <option key={a.articolo_id} value={a.articolo_id}>{a.nome}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!scelta}
          onClick={() => {
            const a = articoli.find((x) => x.articolo_id === scelta);
            if (a) setAggiunti((x) => [...x, a]);
            setScelta("");
          }}
          className={`${pulsanteSecondario} disabled:opacity-50`}
        >
          Aggiungi
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 bg-slate-50 p-4">
        <label className={`${etichetta} w-40`}>
          Data
          <input type="date" name="data" defaultValue={oggi} className={campo} />
        </label>
        <label className={`${etichetta} flex-[2_1_14rem]`}>
          Note
          <input name="note" placeholder="facoltative (altrimenti «commessa …»)" className={campo} />
        </label>
        <button disabled={inCorso || compilate === 0} className={`${pulsante} disabled:opacity-50`}>
          {inCorso ? "Registro…" : `Scarica dal magazzino${compilate ? ` (${compilate})` : ""}`}
        </button>
        <p className="basis-full text-xs text-slate-500">
          Le quantità proposte sono quelle che mancano rispetto al previsto: correggile con quelle usate davvero. Un numero
          negativo (es. −1) rimette in magazzino il materiale avanzato. Uno scarico sbagliato si annulla dal Magazzino.
        </p>
        {esito.errore && <p role="alert" className="basis-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{esito.errore}</p>}
      </div>
    </form>
  );
}
