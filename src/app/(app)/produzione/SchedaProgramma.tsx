// Produzione → «Programma del giorno».
// Tutti lo vedono (senza prezzi); solo il titolare lo prepara.
// Indirizzo: /produzione?scheda=programma&giorno=<data>&vista=persona
//   &lavoro=<id>[&a=<persona>&dalle=&alle=]  → «Chi può farlo» e modulo per metterlo nel programma
//   &modifica=<assegnazione>                → modulo per spostarla o toglierla
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { dataIt, oggiIt, ora } from "@/lib/produzione";
import {
  durata,
  fasceDi,
  giornoSettimana,
  hhmm,
  oreDaMinuti,
  periodoNelGiorno,
  proposta,
  spostaGiorno,
  testoIntervalli,
  togli,
  type Intervallo,
} from "@/lib/programma";
import { campo, etichetta, pulsante, pulsanteSecondario, riquadro } from "../anagrafiche/stile";
import { EtichettaUrgente, Messaggi, SchedeProduzione, indirizzo, oreTesto } from "./comuni";
import { avvisi, leggiProgramma, type Assegnazione, type DatiProgramma } from "./programmaDati";
import { salvaAssegnazione, salvaLavoroInterno, togliAssegnazione } from "./azioniProgramma";

export type ParametriProgramma = {
  giorno?: string;
  vista?: string;
  lavoro?: string;
  a?: string;
  dalle?: string;
  alle?: string;
  modifica?: string;
  ok?: string;
  errore?: string;
};

const NOMI_GIORNO = ["", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const MOTIVI: Record<string, string> = { ferie: "ferie", permesso: "permesso", malattia: "malattia", assente: "assente" };

type LavoroDaFare = {
  id: string;
  titolo: string;
  commessa_id: string | null;
  macchina_id: string | null;
  ore_previste: number | null;
  urgente: boolean;
  ore_programmate: number;
  da_programmare: number | null; // null = ore non indicate
  commessa?: { numero: string; cliente: string; data_consegna: string | null; urgente: boolean };
};

export default async function SchedaProgramma({ p, titolare }: { p: ParametriProgramma; titolare: boolean }) {
  const oggi = oggiIt();
  const giorno = p.giorno && /^\d{4}-\d{2}-\d{2}$/.test(p.giorno) ? p.giorno : oggi;
  const perPersona = p.vista === "persona";
  const supabase = await creaClientServer();
  const d = await leggiProgramma(supabase, giorno);
  const lavori = titolare ? await leggiDaPianificare(supabase) : [];

  const link = (x: Partial<ParametriProgramma>) =>
    indirizzo({ scheda: "programma", giorno, vista: perPersona ? "persona" : undefined, ...x });

  // ------------------------------------------------------------------
  // Asse delle ore: dall'inizio dell'orario (o del primo lavoro) alla fine
  // ------------------------------------------------------------------
  const fasceAzienda = fasceDi(null, giorno, d.orari);
  const tutti = [
    ...fasceAzienda,
    ...d.assegnazioni.map((a) => ({ da: min(a.dalle), a: min(a.alle) })),
  ];
  const H0 = Math.min(8 * 60, ...tutti.map((x) => Math.floor(x.da / 60) * 60));
  const H1 = Math.max(17 * 60, ...tutti.map((x) => Math.ceil(x.a / 60) * 60));
  const ore: number[] = [];
  for (let h = H0; h < H1; h += 60) ore.push(h);

  const assentiOggi = d.assenze.map((a) => ({ ...a, nome: d.persone.find((x) => x.id === a.dipendente_id)?.nome_completo ?? "" }));
  const conAvvisi = d.assegnazioni.filter((a) => avvisi(a).length > 0);
  const piuLavori = [...new Set(d.assegnazioni.filter((a) => a.persona_su_piu_lavori && a.persona).map((a) => a.persona as string))];
  const fermiOggi = d.fermi.map((f) => ({ ...f, macchina: d.macchine.find((m) => m.id === f.macchina_id)?.nome ?? "" }));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-60 flex-1">
          <h1 className="text-2xl font-semibold">Produzione</h1>
          <p className="mt-1 text-sm text-slate-500">Chi fa cosa, su quale macchina e a che ora</p>
        </div>
        <Link href={`/stampa/programma/${giorno}${perPersona ? "?vista=persona" : ""}`} className={pulsanteSecondario}>Stampa programma</Link>
      </header>
      <SchedeProduzione attiva="programma" />
      <Messaggi ok={p.ok} errore={p.errore} />
      {d.errore && <Messaggi errore="Non riesco a leggere tutto il programma dal database: quello che vedi potrebbe essere incompleto." />}

      {/* -------- giorno e vista -------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={link({ giorno: spostaGiorno(giorno, -1) })} aria-label="Giorno precedente" className={`${pulsanteSecondario} px-3`}>‹</Link>
        <form action="/produzione" className="flex items-center gap-2">
          <input type="hidden" name="scheda" value="programma" />
          {perPersona && <input type="hidden" name="vista" value="persona" />}
          <input type="date" name="giorno" defaultValue={giorno} aria-label="Giorno" className={`${campo} w-40`} />
          <button className={pulsanteSecondario}>Vai</button>
        </form>
        <Link href={link({ giorno: spostaGiorno(giorno, 1) })} aria-label="Giorno successivo" className={`${pulsanteSecondario} px-3`}>›</Link>
        {giorno !== oggi && <Link href={link({ giorno: oggi })} className={pulsanteSecondario}>Oggi</Link>}
        <strong className="px-2 text-lg">
          {NOMI_GIORNO[giornoSettimana(giorno)]} {dataIt(giorno)}
        </strong>
        <div role="group" aria-label="Vista" className="ml-auto flex gap-1 rounded-xl bg-slate-200 p-1">
          <Link
            href={indirizzo({ scheda: "programma", giorno })}
            aria-current={!perPersona ? "page" : undefined}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${!perPersona ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          >
            Per macchina
          </Link>
          <Link
            href={indirizzo({ scheda: "programma", giorno, vista: "persona" })}
            aria-current={perPersona ? "page" : undefined}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${perPersona ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          >
            Per persona
          </Link>
        </div>
      </div>

      {/* -------- assenti e avvisi -------- */}
      <section aria-label="Assenze e avvisi" className="grid gap-4 md:grid-cols-2">
        <div className={`${riquadro} flex flex-col gap-2 p-4 text-sm`}>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Assenti</h2>
            <Link href={`/timbrature?scheda=ferie&dal=${giorno}`} className="ml-auto text-xs font-semibold text-blue-700 hover:underline">
              Ferie e permessi
            </Link>
          </div>
          {assentiOggi.length === 0 && fermiOggi.length === 0 && <p className="text-slate-500">Nessuno.</p>}
          <div className="flex flex-wrap gap-2">
            {assentiOggi.map((a) => (
              <span key={a.id} className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-900">
                {a.nome} · {MOTIVI[a.motivo] ?? a.motivo} {orePeriodo(a, giorno)}
              </span>
            ))}
            {fermiOggi.map((f) => (
              <span key={f.id} className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-900">
                {f.macchina} · {f.motivo.toLowerCase()} {orePeriodo(f, giorno)}
              </span>
            ))}
          </div>
        </div>
        <div className={`flex flex-col gap-1.5 rounded-xl border p-4 text-sm ${conAvvisi.length ? "border-orange-200 bg-orange-50 text-orange-950" : "border-slate-200 bg-white"}`}>
          <h2 className="font-semibold">{conAvvisi.length ? `Da controllare · ${conAvvisi.length}` : "Da controllare"}</h2>
          {conAvvisi.length === 0 && <p className="text-slate-500">Nessun avviso.</p>}
          {conAvvisi.map((a) => (
            <p key={a.id}>
              {titolare ? (
                <Link href={link({ modifica: a.id })} className="font-semibold hover:underline">
                  {a.persona ?? "Da assegnare"} · {a.commessa_numero ? `${a.commessa_numero} ${a.cliente ?? ""} · ` : ""}{a.titolo}
                </Link>
              ) : (
                <strong>{a.persona ?? "Da assegnare"} · {a.commessa_numero ? `${a.commessa_numero} ${a.cliente ?? ""} · ` : ""}{a.titolo}</strong>
              )}{" "}
              ({ora(a.dalle)}–{ora(a.alle)}): {avvisi(a).join(", ")}.
            </p>
          ))}
          {piuLavori.map((nome) => (
            <p key={nome} className="text-slate-600">{nome} segue più lavori nello stesso momento (consentito).</p>
          ))}
        </div>
      </section>

      {/* -------- il programma -------- */}
      <Griglia d={d} giorno={giorno} perPersona={perPersona} H0={H0} H1={H1} ore={ore} fasceAzienda={fasceAzienda} link={titolare ? link : null} selezionata={p.modifica} />

      {/* -------- strumenti del titolare -------- */}
      {titolare && (
        <section aria-label="Preparare il programma" className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <DaPianificare lavori={lavori} d={d} selezionato={p.lavoro} link={link} giorno={giorno} />
          {p.modifica ? (
            <Modifica d={d} id={p.modifica} giorno={giorno} perPersona={perPersona} link={link} />
          ) : p.lavoro ? (
            <ChiPuoFarlo lavoro={lavori.find((l) => l.id === p.lavoro) ?? null} d={d} p={p} giorno={giorno} perPersona={perPersona} link={link} />
          ) : (
            <p className={`${riquadro} p-4 text-sm text-slate-600`}>
              Scegli un lavoro da pianificare per vedere chi può farlo e metterlo nel programma, oppure tocca un lavoro nel
              programma per spostarlo o toglierlo.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Griglia: una riga per macchina (o per persona), blocchi sull'asse delle ore
// ---------------------------------------------------------------------
type Blocco = { chiave: string; da: number; a: number; tipo: "lavoro" | "pausa" | "ferma" | "assenza"; titolo: string; sotto: string; a_id?: string; stile?: string; corsia?: number; corsie?: number };

/** Lavori che si sovrappongono nella stessa riga: uno sotto l'altro (corsie). */
function corsie(blocchi: Blocco[]): Blocco[] {
  const lavori = blocchi.filter((b) => b.tipo === "lavoro").sort((x, y) => x.da - y.da);
  const fine: number[] = [];
  for (const b of lavori) {
    let i = fine.findIndex((f) => f <= b.da);
    if (i === -1) i = fine.push(0) - 1;
    fine[i] = b.a;
    b.corsia = i;
  }
  for (const b of lavori) b.corsie = fine.length;
  return blocchi;
}

function Griglia({
  d, giorno, perPersona, H0, H1, ore, fasceAzienda, link, selezionata,
}: {
  d: DatiProgramma; giorno: string; perPersona: boolean; H0: number; H1: number; ore: number[];
  fasceAzienda: Intervallo[]; link: ((x: Partial<ParametriProgramma>) => string) | null; selezionata?: string;
}) {
  const fuori = (fasce: Intervallo[]): Blocco[] =>
    togli([{ da: H0, a: H1 }], fasce).map((x, i) => ({ chiave: `p${i}`, da: x.da, a: x.a, tipo: "pausa", titolo: fasce.length ? "" : "Riposo", sotto: "" }));
  const bloccoLavoro = (a: Assegnazione, sotto: string): Blocco => ({
    chiave: a.id,
    da: min(a.dalle),
    a: min(a.alle),
    tipo: "lavoro",
    titolo: a.commessa_numero ? `${a.commessa_numero} · ${a.cliente ?? ""}` : "Interno",
    sotto: [a.titolo, sotto].filter(Boolean).join(" · "),
    a_id: a.id,
    stile: stileLavoro(a, a.id === selezionata),
  });

  type Riga = { chiave: string; nome: string; sotto: string; avviso: boolean; blocchi: Blocco[] };
  let righe: Riga[];
  if (!perPersona) {
    righe = d.macchine.map((m) => {
      const fermi = d.fermi
        .filter((f) => f.macchina_id === m.id)
        .map((f) => periodoNelGiorno(f, giorno))
        .filter((x): x is Intervallo => x !== null);
      return {
        chiave: m.id,
        nome: m.nome,
        sotto: fermi.length ? "Ferma" : m.reparto ?? (m.tipo === "postazione" ? "Postazione" : ""),
        avviso: fermi.length > 0,
        blocchi: [
          ...fuori(fasceAzienda),
          ...fermi.map((x, i) => ({ chiave: `f${i}`, da: x.da, a: x.a, tipo: "ferma" as const, titolo: "Macchina ferma", sotto: "" })),
          ...d.assegnazioni.filter((a) => a.macchina_id === m.id).map((a) => bloccoLavoro(a, a.persona ?? "Da assegnare")),
        ],
      };
    });
    const senza = d.assegnazioni.filter((a) => !a.macchina_id || !d.macchine.some((m) => m.id === a.macchina_id));
    if (senza.length)
      righe.push({ chiave: "senza", nome: "Altro", sotto: "macchina tolta o da decidere", avviso: false, blocchi: senza.map((a) => bloccoLavoro(a, a.persona ?? "Da assegnare")) });
  } else {
    righe = d.persone.map((p) => {
      const fasce = fasceDi(p.id, giorno, d.orari);
      const assenze = d.assenze
        .filter((a) => a.dipendente_id === p.id)
        .map((a) => ({ a, x: periodoNelGiorno(a, giorno) }))
        .filter((x): x is { a: (typeof d.assenze)[number]; x: Intervallo } => x.x !== null);
      const miei = d.assegnazioni.filter((a) => a.dipendente_id === p.id);
      const occupato = durata(miei.map((a) => ({ da: min(a.dalle), a: min(a.alle) })));
      const disponibile = durata(togli(fasce, assenze.map((x) => x.x)));
      const tropo = occupato > disponibile;
      return {
        chiave: p.id,
        nome: p.nome_completo + (p.io ? " (tu)" : ""),
        sotto:
          fasce.length === 0 ? "Riposo" : disponibile === 0 ? "Assente" : `${oreDaMinuti(occupato)} occupate su ${oreDaMinuti(disponibile)}${tropo ? " · troppe" : ""}`,
        avviso: tropo,
        blocchi: [
          ...fuori(fasce),
          ...assenze.map(({ a, x }, i) => ({ chiave: `a${i}`, da: x.da, a: x.a, tipo: "assenza" as const, titolo: cap(MOTIVI[a.motivo] ?? a.motivo), sotto: "" })),
          ...miei.map((a) => bloccoLavoro(a, a.macchina ?? "")),
        ],
      };
    });
    const senza = d.assegnazioni.filter((a) => !a.dipendente_id || !d.persone.some((p) => p.id === a.dipendente_id));
    if (senza.length)
      righe.push({ chiave: "senza", nome: "Da assegnare", sotto: "manca la persona", avviso: true, blocchi: senza.map((a) => bloccoLavoro(a, a.macchina ?? "")) });
  }

  const pos = (b: Blocco) => {
    const n = b.corsie ?? 1;
    const i = b.corsia ?? 0;
    return {
      left: `${((Math.max(b.da, H0) - H0) / (H1 - H0)) * 100}%`,
      width: `${((Math.min(b.a, H1) - Math.max(b.da, H0)) / (H1 - H0)) * 100}%`,
      top: `calc(${(i / n) * 100}% + 4px)`,
      height: `calc(${100 / n}% - 8px)`,
    };
  };
  for (const r of righe) corsie(r.blocchi);

  return (
    <section aria-label="Programma" className={`${riquadro} overflow-hidden`}>
      <div className="overflow-x-auto">
        <div className="min-w-[960px]">
          <div className="flex border-b border-slate-200 bg-slate-50">
            <div className="w-48 shrink-0 px-3 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              {perPersona ? "Persona" : "Macchina"}
            </div>
            <div className="flex flex-1">
              {ore.map((h) => (
                <div key={h} className="flex-1 border-l border-slate-200 py-2 pl-1 text-xs font-semibold text-slate-500">{hhmm(h)}</div>
              ))}
            </div>
          </div>
          {righe.length === 0 && <p className="p-4 text-sm text-slate-500">Nessuna {perPersona ? "persona" : "macchina"} attiva.</p>}
          {righe.map((r) => (
            <div key={r.chiave} className="flex border-b border-slate-100" style={{ minHeight: `${Math.max(4, 3.25 * Math.max(1, ...r.blocchi.map((b) => b.corsie ?? 1)))}rem` }}>
              <div className="flex w-48 shrink-0 flex-col justify-center border-r border-slate-200 px-3 py-2">
                <strong className="text-sm">{r.nome}</strong>
                <span className={`text-xs ${r.avviso ? "font-semibold text-orange-800" : "text-slate-500"}`}>{r.sotto}</span>
              </div>
              <div
                className="relative flex-1"
                style={{ backgroundImage: `repeating-linear-gradient(to right, #f1f5f9 0 1px, transparent 1px ${100 / ore.length}%)` }}
              >
                {r.blocchi.map((b) => {
                  const stile =
                    b.tipo === "lavoro"
                      ? b.stile
                      : b.tipo === "ferma"
                        ? "bg-[repeating-linear-gradient(45deg,#e2e8f0_0_6px,#f8fafc_6px_12px)] border border-slate-300 text-slate-700"
                        : b.tipo === "assenza"
                          ? "bg-[repeating-linear-gradient(45deg,#e9d5ff_0_6px,#faf5ff_6px_12px)] border border-purple-300 text-purple-900"
                          : "bg-[repeating-linear-gradient(45deg,#eef2f6_0_6px,#f8fafc_6px_12px)] text-slate-500";
                  const contenuto = (
                    <>
                      <strong className="truncate">{b.titolo}</strong>
                      {b.sotto && <span className="truncate">{b.sotto}</span>}
                    </>
                  );
                  const classi = `absolute flex flex-col overflow-hidden rounded-lg px-2 py-1 text-[11px] leading-tight ${stile} ${b.tipo === "lavoro" ? "z-10" : ""}`;
                  return b.tipo === "lavoro" && link && b.a_id ? (
                    <Link key={b.chiave} href={link({ modifica: b.a_id })} title={`${b.titolo} · ${hhmm(b.da)}–${hhmm(b.a)} · ${b.sotto}`} style={pos(b)} className={`${classi} hover:ring-2 hover:ring-blue-500`}>
                      {contenuto}
                    </Link>
                  ) : (
                    <div key={b.chiave} title={b.titolo ? `${b.titolo} · ${hhmm(b.da)}–${hhmm(b.a)}${b.sotto ? ` · ${b.sotto}` : ""}` : undefined} style={pos(b)} className={classi}>
                      {contenuto}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
        <Legenda stile="border border-blue-300 bg-blue-100" testo="Lavoro" />
        <Legenda stile="border border-orange-300 bg-orange-100" testo="Urgente" />
        <Legenda stile="border-2 border-orange-600 bg-white" testo="Da controllare" />
        <Legenda stile="border border-green-300 bg-green-100" testo="Finito" />
        <Legenda stile="bg-[repeating-linear-gradient(45deg,#e2e8f0_0_4px,#f8fafc_4px_8px)]" testo="Pausa, fuori orario o macchina ferma" />
        <Legenda stile="bg-[repeating-linear-gradient(45deg,#e9d5ff_0_4px,#faf5ff_4px_8px)]" testo="Ferie o permesso" />
      </div>
    </section>
  );
}

function stileLavoro(a: Assegnazione, scelta: boolean): string {
  const base =
    a.stato_lavoro === "finito"
      ? "bg-green-100 text-green-900 border border-green-300"
      : a.urgente
        ? "bg-orange-100 text-orange-950 border border-orange-300"
        : "bg-blue-100 text-blue-950 border border-blue-300";
  const avviso = avvisi(a).length ? " border-2! border-orange-600!" : "";
  return base + avviso + (scelta ? " ring-2 ring-blue-600" : "");
}

function Legenda({ stile, testo }: { stile: string; testo: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3.5 w-3.5 rounded ${stile}`} />
      {testo}
    </span>
  );
}

// ---------------------------------------------------------------------
// Lavori da pianificare
// ---------------------------------------------------------------------
async function leggiDaPianificare(supabase: Awaited<ReturnType<typeof creaClientServer>>): Promise<LavoroDaFare[]> {
  const [risLavori, risRiepilogo, risCommesse] = await Promise.all([
    supabase.from("lavori").select("id, titolo, commessa_id, macchina_id, ore_previste, urgente, ordine").eq("attivo", true).neq("stato", "finito").limit(1000),
    supabase.from("lavori_riepilogo").select("lavoro_id, ore_programmate").limit(5000),
    supabase.from("commesse_elenco").select("id, numero, cliente, data_consegna, urgente, stato").eq("attivo", true).neq("stato", "completata").limit(1000),
  ]);
  const programmate = new Map(((risRiepilogo.data ?? []) as { lavoro_id: string; ore_programmate: number }[]).map((r) => [r.lavoro_id, Number(r.ore_programmate)]));
  const commesse = new Map(
    ((risCommesse.data ?? []) as { id: string; numero: string; cliente: string; data_consegna: string | null; urgente: boolean }[]).map((c) => [c.id, c])
  );
  return ((risLavori.data ?? []) as (Omit<LavoroDaFare, "ore_programmate" | "da_programmare" | "commessa"> & { ordine: number })[])
    .filter((l) => !l.commessa_id || commesse.has(l.commessa_id))
    .map((l) => {
      const fatte = programmate.get(l.id) ?? 0;
      const previste = l.ore_previste === null ? null : Number(l.ore_previste);
      return {
        ...l,
        ore_previste: previste,
        ore_programmate: fatte,
        da_programmare: previste === null ? null : Math.max(previste - fatte, 0),
        commessa: l.commessa_id ? commesse.get(l.commessa_id) : undefined,
      };
    })
    // da pianificare: ore che restano, oppure ore non indicate e niente nel programma
    .filter((l) => (l.da_programmare === null ? l.ore_programmate === 0 : l.da_programmare > 0))
    .sort((x, y) => {
      const ux = x.urgente || x.commessa?.urgente ? 0 : 1;
      const uy = y.urgente || y.commessa?.urgente ? 0 : 1;
      if (ux !== uy) return ux - uy;
      const cx = x.commessa?.data_consegna ?? "9999";
      const cy = y.commessa?.data_consegna ?? "9999";
      return cx.localeCompare(cy) || (x.commessa?.numero ?? "").localeCompare(y.commessa?.numero ?? "") || x.ordine - y.ordine;
    });
}

function DaPianificare({
  lavori, d, selezionato, link, giorno,
}: { lavori: LavoroDaFare[]; d: DatiProgramma; selezionato?: string; link: (x: Partial<ParametriProgramma>) => string; giorno: string }) {
  return (
    <div className={`${riquadro} flex flex-col gap-3 p-4`}>
      <h2 className="font-semibold">Da pianificare · {lavori.length}</h2>
      <p className="text-sm text-slate-500">
        Lavori delle commesse (e interni) con ore ancora da mettere nel programma. Scegline uno per vedere chi può farlo.
      </p>
      {lavori.length === 0 && <p className="text-sm text-slate-500">Niente da pianificare.</p>}
      <ul className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto">
        {lavori.map((l) => {
          const scelto = l.id === selezionato;
          return (
            <li key={l.id}>
              <Link
                href={link({ lavoro: l.id })}
                aria-current={scelto ? "true" : undefined}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg p-3 text-sm ${scelto ? "border-2 border-blue-600 bg-blue-50" : "border border-slate-200 hover:bg-slate-50"}`}
              >
                <span className="flex min-w-48 flex-1 flex-col">
                  <span className="font-semibold">
                    {l.commessa ? `${l.commessa.numero} · ${l.commessa.cliente}` : "Lavoro interno"}
                  </span>
                  <span className="text-slate-700">{l.titolo}</span>
                </span>
                <span className="text-slate-700">{d.macchine.find((m) => m.id === l.macchina_id)?.nome ?? "macchina da decidere"}</span>
                <span className="text-slate-700">
                  {l.da_programmare === null ? "ore non indicate" : `${oreTesto(l.da_programmare)}${l.ore_programmate ? ` (di ${oreTesto(l.ore_previste)})` : ""}`}
                </span>
                {l.commessa?.data_consegna && (
                  <span className={l.commessa.data_consegna < giorno ? "font-semibold text-red-700" : "text-slate-700"}>
                    consegna {dataIt(l.commessa.data_consegna).slice(0, 5)}
                  </span>
                )}
                {(l.urgente || l.commessa?.urgente) && <EtichettaUrgente />}
              </Link>
            </li>
          );
        })}
      </ul>
      <details className="rounded-lg border border-slate-200 p-3 text-sm">
        <summary className="cursor-pointer font-semibold">+ Lavoro interno (senza commessa)</summary>
        <form action={salvaLavoroInterno} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="giorno" value={giorno} />
          <label className={`${etichetta} flex-[2_1_12rem]`}>
            Cosa c&apos;è da fare
            <input name="titolo" required placeholder="es. Manutenzione Zund" className={campo} />
          </label>
          <label className={`${etichetta} flex-[1_1_10rem]`}>
            Macchina o postazione
            <select name="macchina_id" defaultValue="" className={campo}>
              <option value="">— nessuna —</option>
              {d.macchine.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          </label>
          <label className={`${etichetta} w-20`}>
            Ore
            <input name="ore_previste" inputMode="decimal" className={campo} />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="urgente" className="h-4 w-4" /> Urgente
          </label>
          <button className={pulsante}>Aggiungi</button>
        </form>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------
// Chi può farlo + modulo per metterlo nel programma
// ---------------------------------------------------------------------
function ChiPuoFarlo({
  lavoro, d, p, giorno, perPersona, link,
}: { lavoro: LavoroDaFare | null; d: DatiProgramma; p: ParametriProgramma; giorno: string; perPersona: boolean; link: (x: Partial<ParametriProgramma>) => string }) {
  if (!lavoro) return <p className={`${riquadro} p-4 text-sm text-slate-600`}>Questo lavoro non è più da pianificare.</p>;
  const macchina = d.macchine.find((m) => m.id === lavoro.macchina_id);
  const serve = lavoro.da_programmare === null ? 0 : Math.round(lavoro.da_programmare * 60);

  // per ogni persona: tempo libero quel giorno (orario meno assenze meno lavori già assegnati)
  const candidati = d.persone.map((persona) => {
    const fasce = fasceDi(persona.id, giorno, d.orari);
    const occupati = [
      ...d.assenze.filter((a) => a.dipendente_id === persona.id).map((a) => periodoNelGiorno(a, giorno)).filter((x): x is Intervallo => x !== null),
      ...d.assegnazioni.filter((a) => a.dipendente_id === persona.id).map((a) => ({ da: min(a.dalle), a: min(a.alle) })),
    ];
    const libero = togli(fasce, occupati);
    const livello = macchina ? d.competenze.find((c) => c.dipendente_id === persona.id && c.macchina_id === macchina.id)?.livello ?? null : null;
    const assente = d.assenze.some((a) => a.dipendente_id === persona.id && periodoNelGiorno(a, giorno)?.da === 0 && periodoNelGiorno(a, giorno)?.a === 24 * 60);
    return { persona, libero, liberoMin: durata(libero), livello, assente, riposo: fasce.length === 0 };
  });
  const ordine = { principale: 0, sa_usarla: 1 } as const;
  const conCompetenza = candidati.filter((c) => c.livello).sort((x, y) => ordine[x.livello!] - ordine[y.livello!] || y.liberoMin - x.liberoMin);
  const altri = candidati.filter((c) => !c.livello).sort((x, y) => y.liberoMin - x.liberoMin);

  // valori del modulo: dai parametri (dopo «Assegna a…» o un errore), altrimenti la proposta migliore
  const migliore = [...conCompetenza, ...altri].find((c) => !c.assente && c.liberoMin > 0);
  const prop = migliore ? proposta(migliore.libero, serve) : null;
  const persona = p.a ?? migliore?.persona.id ?? "";
  const dalle = p.dalle ?? (prop ? hhmm(prop.da) : "08:00");
  const alle = p.alle ?? (prop ? hhmm(prop.a) : "10:00");

  const riga = (c: (typeof candidati)[number]) => {
    const pr = proposta(c.libero, serve);
    const basta = serve === 0 || c.libero.some((x) => x.a - x.da >= serve);
    const testo = c.riposo
      ? "Non lavora questo giorno"
      : c.assente
        ? "Assente"
        : c.liberoMin === 0
          ? "Occupato tutto il giorno"
          : `Libero ${testoIntervalli(c.libero)} (${oreDaMinuti(c.liberoMin)})${basta ? "" : ": non c'è un pezzo lungo abbastanza, il resto un altro giorno"}`;
    const colore = c.riposo || c.assente || c.liberoMin === 0 ? "text-slate-500" : basta ? "text-green-800" : "text-orange-800";
    return (
      <li key={c.persona.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm">
        <strong>{c.persona.nome_completo}</strong>
        {c.livello && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.livello === "principale" ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-900"}`}>
            {c.livello === "principale" ? "Principale" : "Sa usarla"}
          </span>
        )}
        <span className={`basis-full ${colore}`}>{testo}</span>
        {pr && !c.assente && (
          <Link
            href={link({ lavoro: lavoro.id, a: c.persona.id, dalle: hhmm(pr.da), alle: hhmm(pr.a) })}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Assegna a {c.persona.nome_completo.split(" ")[0]} {hhmm(pr.da)}–{hhmm(pr.a)}
          </Link>
        )}
      </li>
    );
  };

  return (
    <div className={`${riquadro} flex flex-col gap-3 p-4`}>
      <h2 className="font-semibold">Chi può farlo</h2>
      <p className="text-sm text-slate-600">
        <strong>{lavoro.commessa ? `${lavoro.commessa.numero} · ${lavoro.commessa.cliente} · ` : "Interno · "}{lavoro.titolo}</strong> · {macchina?.nome ?? "macchina da decidere"} ·{" "}
        {lavoro.da_programmare === null ? "ore non indicate" : `${oreTesto(lavoro.da_programmare)} da programmare`}
      </p>
      {macchina && conCompetenza.length === 0 && (
        <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900">
          Nessuno ha la {macchina.nome} tra le sue competenze (Impostazioni → Macchine e competenze).
        </p>
      )}
      <ul className="flex flex-col gap-2">{conCompetenza.map(riga)}</ul>
      {altri.length > 0 && (
        <details open={!macchina || conCompetenza.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-600">
            {macchina ? `Gli altri (${altri.length}): non hanno la ${macchina.nome} tra le competenze` : `Tutti (${altri.length})`}
          </summary>
          <ul className="mt-2 flex flex-col gap-2">{altri.map(riga)}</ul>
        </details>
      )}

      <form key={`${lavoro.id}-${persona}-${dalle}-${alle}`} action={salvaAssegnazione} className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3">
        <h3 className="text-sm font-semibold">Metti nel programma</h3>
        <input type="hidden" name="lavoro_id" value={lavoro.id} />
        {perPersona && <input type="hidden" name="vista" value="persona" />}
        <CampiAssegnazione d={d} persona={persona} macchina={lavoro.macchina_id ?? ""} giorno={giorno} dalle={dalle} alle={alle} note="" />
        <button className={pulsante}>Metti nel programma</button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------
// Modifica di un'assegnazione: sposta (persona, macchina, giorno, ore) o togli
// ---------------------------------------------------------------------
function Modifica({ d, id, giorno, perPersona, link }: { d: DatiProgramma; id: string; giorno: string; perPersona: boolean; link: (x: Partial<ParametriProgramma>) => string }) {
  const a = d.assegnazioni.find((x) => x.id === id);
  if (!a) return <p className={`${riquadro} p-4 text-sm text-slate-600`}>Assegnazione non trovata in questo giorno.</p>;
  const problemi = avvisi(a);
  return (
    <div className={`${riquadro} flex flex-col gap-3 p-4`}>
      <div className="flex items-start gap-2">
        <h2 className="flex-1 font-semibold">
          {a.commessa_numero ? `${a.commessa_numero} · ` : ""}{a.titolo}
        </h2>
        <Link href={link({})} className="text-sm text-blue-700 hover:underline">Chiudi</Link>
      </div>
      <p className="text-sm text-slate-600">
        {a.cliente && <>{a.cliente} · </>}
        {a.commessa_descrizione}
        {a.data_consegna && <> · consegna {dataIt(a.data_consegna)}</>}
        {a.luogo_posa && <><br />Posa: {a.luogo_posa}</>}
      </p>
      {problemi.length > 0 && (
        <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900">Da controllare: {problemi.join(", ")}.</p>
      )}
      {a.commessa_id && (
        <Link href={indirizzo({ id: a.commessa_id })} className="text-sm font-semibold text-blue-700 hover:underline">Apri la commessa →</Link>
      )}
      <form action={salvaAssegnazione} className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3">
        <input type="hidden" name="id" value={a.id} />
        <input type="hidden" name="torna_giorno" value={giorno} />
        {perPersona && <input type="hidden" name="vista" value="persona" />}
        <CampiAssegnazione d={d} persona={a.dipendente_id ?? ""} macchina={a.macchina_id ?? ""} giorno={a.giorno} dalle={ora(a.dalle)} alle={ora(a.alle)} note={a.note ?? ""} />
        <button className={pulsante}>Salva le modifiche</button>
      </form>
      <form action={togliAssegnazione}>
        <input type="hidden" name="id" value={a.id} />
        <input type="hidden" name="giorno" value={giorno} />
        {perPersona && <input type="hidden" name="vista" value="persona" />}
        <button className={`${pulsanteSecondario} text-red-700`}>Togli dal programma</button>
      </form>
    </div>
  );
}

function CampiAssegnazione({ d, persona, macchina, giorno, dalle, alle, note }: { d: DatiProgramma; persona: string; macchina: string; giorno: string; dalle: string; alle: string; note: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={etichetta}>
        Persona
        <select name="dipendente_id" defaultValue={persona} className={campo}>
          <option value="">— da assegnare —</option>
          {d.persone.map((p) => (
            <option key={p.id} value={p.id}>{p.nome_completo}</option>
          ))}
        </select>
      </label>
      <label className={etichetta}>
        Macchina o postazione
        <select name="macchina_id" defaultValue={macchina} className={campo}>
          <option value="">— quella del lavoro —</option>
          {d.macchine.map((m) => (
            <option key={m.id} value={m.id}>{m.nome}</option>
          ))}
        </select>
      </label>
      <label className={etichetta}>
        Giorno
        <input type="date" name="giorno" required defaultValue={giorno} className={campo} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={etichetta}>
          Dalle
          <input type="time" name="dalle" required defaultValue={dalle} className={campo} />
        </label>
        <label className={etichetta}>
          Alle
          <input type="time" name="alle" required defaultValue={alle} className={campo} />
        </label>
      </div>
      <label className={`${etichetta} sm:col-span-2`}>
        Note
        <input name="note" defaultValue={note} placeholder="facoltative" className={campo} />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------
function min(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "dalle 14:00", "14:00–16:00", "tutto il giorno" per un'assenza o un fermo in quel giorno */
function orePeriodo(x: { dal: string; al: string; dalle: string | null; alle: string | null }, giorno: string): string {
  const i = periodoNelGiorno(x, giorno);
  if (!i || (i.da === 0 && i.a === 24 * 60)) return "tutto il giorno";
  if (i.da === 0) return `fino alle ${hhmm(i.a)}`;
  if (i.a === 24 * 60) return `dalle ${hhmm(i.da)}`;
  return `${hhmm(i.da)}–${hhmm(i.a)}`;
}
