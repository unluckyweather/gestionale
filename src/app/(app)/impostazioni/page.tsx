// Impostazioni (solo titolare), divise in schede (?scheda=…):
// Utenti (account e dipendenti), Tariffe orarie, Macchine e competenze (con l'orario), Dati dell'azienda.
import Link from "next/link";
import { richiediSezione } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { ETICHETTE_RUOLO, RUOLI, type Ruolo } from "@/lib/ruoli";
import { salvaProfilo } from "./azioni";
import ElencoDipendenti from "@/components/ElencoDipendenti";
import ElencoTariffe, { type Tariffa } from "./ElencoTariffe";
import ModuloAzienda, { type Azienda } from "./ModuloAzienda";
import ModuloPosizione from "./ModuloPosizione";
import SchedaMacchine from "./SchedaMacchine";

type Chiave = "utenti" | "tariffe" | "macchine" | "azienda";
const SCHEDE: { chiave: Chiave; etichetta: string }[] = [
  { chiave: "utenti", etichetta: "Utenti" },
  { chiave: "tariffe", etichetta: "Tariffe orarie" },
  { chiave: "macchine", etichetta: "Macchine e competenze" },
  { chiave: "azienda", etichetta: "Dati dell'azienda" },
];

type Profilo = {
  id: string;
  email: string;
  nome_visualizzato: string;
  ruolo: Ruolo;
  attivo: boolean;
  creato_il: string;
  aggiornato_il: string;
};
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
  searchParams: Promise<{ scheda?: string; orario?: string; ok?: string; errore?: string }>;
}) {
  const io = await richiediSezione("/impostazioni");
  const { scheda: chiave, orario, ok, errore } = await searchParams;
  const scheda = SCHEDE.find((s) => s.chiave === chiave) ?? SCHEDE[0];

  const supabase = await creaClientServer();
  // si leggono solo i dati della scheda aperta
  const vuoto = Promise.resolve({ data: null });
  const [risProfili, risDipendenti, risTariffe, risAzienda] = await Promise.all([
    scheda.chiave !== "utenti"
      ? vuoto
      : supabase
          .from("profili")
          .select("id, email, nome_visualizzato, ruolo, attivo, creato_il, aggiornato_il")
          .order("attivo", { ascending: true })
          .order("email"),
    scheda.chiave !== "utenti"
      ? vuoto
      : supabase
          .from("dipendenti")
          .select("id, nome, cognome, mansione_principale, profilo_id, attivo")
          .order("attivo", { ascending: false })
          .order("cognome"),
    scheda.chiave !== "tariffe"
      ? vuoto
      : supabase
          .from("tariffe_orarie")
          .select("id, nome, tipo, costo_orario, note, attivo")
          .order("attivo", { ascending: false })
          .order("tipo")
          .order("nome"),
    scheda.chiave !== "azienda" ? vuoto : supabase.from("azienda").select("*").maybeSingle(),
  ]);
  const profili = (risProfili.data ?? []) as Profilo[];
  // Un account disattivato che non è mai stato modificato è "nuovo, da attivare" (appena creato su
  // Supabase) e resta in vista; quelli disattivati di proposito finiscono in un elenco chiuso in fondo.
  const nuovo = (p: Profilo) => !p.attivo && p.creato_il === p.aggiornato_il;
  const inVista = profili.filter((p) => p.attivo || nuovo(p));
  const disattivati = profili.filter((p) => !p.attivo && !nuovo(p));
  const dipendenti = (risDipendenti.data ?? []) as Dipendente[];
  const tariffe = (risTariffe.data ?? []) as Tariffa[];
  const azienda = (risAzienda.data ?? null) as Azienda | null;

  const rigaAccount = (p: Profilo) => {
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
              {p.attivo ? "Attivo" : nuovo(p) ? "Nuovo, da attivare" : "Disattivato"}
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
  };

  return (
    <div className={`flex flex-col gap-8 ${scheda.chiave === "macchine" ? "max-w-6xl" : "max-w-5xl"}`}>
      <header>
        <h1 className="text-2xl font-semibold">Impostazioni</h1>
        <p className="mt-1 text-sm text-slate-500">Le modifica solo il titolare.</p>
      </header>

      {ok && (
        <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{ok}</p>
      )}
      {errore && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{errore}</p>
      )}

      <nav aria-label="Sezioni delle impostazioni" className="-mb-4 flex gap-1 overflow-x-auto border-b border-slate-300">
        {SCHEDE.map((s) => {
          const attiva = s.chiave === scheda.chiave;
          return (
            <Link
              key={s.chiave}
              href={s.chiave === "utenti" ? "/impostazioni" : `/impostazioni?scheda=${s.chiave}`}
              aria-current={attiva ? "page" : undefined}
              className={`border-b-[3px] px-4 py-3 text-sm whitespace-nowrap ${
                attiva
                  ? "border-blue-600 font-bold text-slate-900"
                  : "border-transparent font-semibold text-slate-600 hover:text-slate-900"
              }`}
            >
              {s.etichetta}
            </Link>
          );
        })}
      </nav>

      {scheda.chiave === "utenti" && (
      <>
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
          {inVista.map(rigaAccount)}
        </ul>
        {disattivati.length > 0 && (
          <details className="border-t border-slate-200">
            <summary className="cursor-pointer p-4 text-sm font-medium text-slate-600 hover:text-slate-900">
              Account disattivati ({disattivati.length})
            </summary>
            <ul className="divide-y divide-slate-100 bg-slate-50">{disattivati.map(rigaAccount)}</ul>
          </details>
        )}
      </section>

      {/* ---------------- Dipendenti (stesso elenco della scheda Anagrafiche) ---------------- */}
      <ElencoDipendenti dipendenti={dipendenti} account={profili} modificabile ritorno="/impostazioni" />
      </>
      )}

      {/* ---------------- Tariffe orarie (usate nei preventivi) ---------------- */}
      {scheda.chiave === "tariffe" && <ElencoTariffe tariffe={tariffe} />}

      {/* ---------------- Macchine, competenze e orario (programma del giorno) ---------------- */}
      {scheda.chiave === "macchine" && <SchedaMacchine orarioDi={orario} />}

      {/* ---------------- Dati dell'azienda (intestazione dei documenti) ---------------- */}
      {scheda.chiave === "azienda" && <ModuloAzienda key={azienda?.aggiornato_il ?? "nuova"} azienda={azienda} />}
      {scheda.chiave === "azienda" && azienda && <ModuloPosizione key={`pos-${azienda.aggiornato_il}`} azienda={azienda} />}
    </div>
  );
}
