"use client";
// I pulsanti grandi della timbratura, con l'orologio e il tempo in servizio.
// Se il titolare ha acceso il controllo «vicino alla ditta», prima di timbrare
// chiede la posizione al telefono (solo in quel momento; non si salva).
//
// SENZA RETE (passo 6): se la timbratura non parte, resta salvata sul telefono
// (localStorage, una coda per dipendente) con l'ora del clic e parte da sola appena
// torna la rete (all'apertura della pagina, quando il telefono torna online e ogni
// 30 secondi). Il database la accetta con l'ora del telefono, fino a 72 ore prima, e
// la segna «arrivata dopo»; il codice id_locale evita i doppioni.
// Limite: la pagina deve essere già aperta (o aprirsi) con la rete; senza rete del
// tutto il browser non la carica.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  contaMinuti,
  distanzaTesto,
  durataTesto,
  ETICHETTE_TIMBRATURA,
  oraRoma,
  statoDopo,
  type Timbratura,
  type TipoTimbratura,
} from "@/lib/timbrature";
import { timbra, type EsitoTimbra, type Posizione } from "./azioniTimbra";

const GIORNO = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });

type InCoda = { tipo: TipoTimbratura; idLocale: string; orario: string; posizione: Posizione | null };

function leggiCoda(chiave: string): InCoda[] {
  try {
    const x = JSON.parse(localStorage.getItem(chiave) ?? "[]");
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
}
function scriviCoda(chiave: string, coda: InCoda[]) {
  try {
    if (coda.length) localStorage.setItem(chiave, JSON.stringify(coda));
    else localStorage.removeItem(chiave);
  } catch {
    // memoria del telefono piena o bloccata: niente da fare
  }
}

/** Chiede la posizione al telefono; null se non la dà (permesso negato, GPS spento, troppo tempo). */
function chiediPosizione(): Promise<{ posizione: Posizione | null; problema?: string }> {
  return new Promise((risolvi) => {
    if (!("geolocation" in navigator)) return risolvi({ posizione: null, problema: "questo telefono non dà la posizione" });
    navigator.geolocation.getCurrentPosition(
      (p) => risolvi({ posizione: { lat: p.coords.latitude, lon: p.coords.longitude, precisione: p.coords.accuracy } }),
      (e) =>
        risolvi({
          posizione: null,
          problema: e.code === e.PERMISSION_DENIED ? "non hai dato il permesso per la posizione" : "la posizione non è arrivata",
        }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

export default function PulsantiTimbra({
  dipendente,
  timbrature,
  controllo,
}: {
  dipendente: string;
  timbrature: (Timbratura & { id_locale?: string | null })[];
  controllo: boolean;
}) {
  const chiave = `timbrature-da-inviare-${dipendente}`;
  const [adesso, setAdesso] = useState(() => new Date());
  const [inCorso, avvia] = useTransition();
  const [fase, setFase] = useState<string | null>(null);
  const [esito, setEsito] = useState<EsitoTimbra & { problema?: string; inCoda?: boolean }>({});
  const [confermaUscita, setConfermaUscita] = useState(false);
  const [coda, setCoda] = useState<InCoda[]>([]);
  const [online, setOnline] = useState(true);
  const [respinte, setRespinte] = useState<string[]>([]);
  const invioInCorso = useRef(false);

  // l'orologio si aggiorna ogni 15 secondi e subito dopo ogni timbratura
  useEffect(() => {
    setAdesso(new Date());
    const t = setInterval(() => setAdesso(new Date()), 15000);
    return () => clearInterval(t);
  }, [timbrature.length, coda.length]);

  /** Manda al server, in ordine, le timbrature rimaste sul telefono. */
  const inviaCoda = useCallback(async () => {
    if (invioInCorso.current) return;
    invioInCorso.current = true;
    try {
      let rimaste = leggiCoda(chiave);
      while (rimaste.length) {
        const t = rimaste[0];
        let r: EsitoTimbra;
        try {
          r = await timbra(t.tipo, t.idLocale, t.posizione, t.orario);
        } catch {
          break; // ancora senza rete: si riprova dopo
        }
        if (r.errore && !r.definitivo) break; // problema passeggero del server: si riprova dopo
        if (r.errore) {
          setRespinte((x) => [
            ...x,
            `${ETICHETTE_TIMBRATURA[t.tipo]} del ${new Date(t.orario).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} alle ${oraRoma(t.orario)} non registrata: ${r.errore}`,
          ]);
        }
        rimaste = rimaste.slice(1);
        scriviCoda(chiave, rimaste);
        setCoda(rimaste);
      }
      setCoda(leggiCoda(chiave));
    } finally {
      invioInCorso.current = false;
    }
  }, [chiave]);

  useEffect(() => {
    setCoda(leggiCoda(chiave));
    setOnline(navigator.onLine);
    const su = () => {
      setOnline(true);
      void inviaCoda();
    };
    const giu = () => setOnline(false);
    window.addEventListener("online", su);
    window.addEventListener("offline", giu);
    void inviaCoda();
    const t = setInterval(() => {
      if (leggiCoda(chiave).length) void inviaCoda();
    }, 30000);
    return () => {
      window.removeEventListener("online", su);
      window.removeEventListener("offline", giu);
      clearInterval(t);
    };
  }, [chiave, inviaCoda]);

  // timbrature arrivate al server + quelle ancora sul telefono (senza doppioni)
  const arrivati = new Set(timbrature.map((t) => t.id_locale).filter(Boolean));
  const daInviare = coda.filter((c) => !arrivati.has(c.idLocale));
  const tutte = [...timbrature.map((t) => ({ tipo: t.tipo, orario: t.orario })), ...daInviare.map((c) => ({ tipo: c.tipo, orario: c.orario }))].sort(
    (a, b) => Date.parse(a.orario) - Date.parse(b.orario)
  );

  const ultima = tutte.at(-1);
  const stato = statoDopo(ultima?.tipo);
  const { lavoro, pausa } = contaMinuti(tutte, adesso);

  function premi(tipo: TipoTimbratura) {
    setConfermaUscita(false);
    setEsito({});
    avvia(async () => {
      const idLocale = crypto.randomUUID();
      const orario = new Date().toISOString();
      let posizione: Posizione | null = null;
      let problema: string | undefined;
      if (controllo) {
        setFase("Cerco la posizione…");
        ({ posizione, problema } = await chiediPosizione());
      }
      // senza rete, o con altre timbrature ancora da inviare: in coda (l'ordine conta)
      const metti = () => {
        const nuova = [...leggiCoda(chiave), { tipo, idLocale, orario, posizione }];
        scriviCoda(chiave, nuova);
        setCoda(nuova);
        setEsito({ ok: `${ETICHETTE_TIMBRATURA[tipo]} delle ${oraRoma(orario)} salvata sul telefono.`, inCoda: true });
      };
      if (!navigator.onLine || leggiCoda(chiave).length) {
        metti();
        void inviaCoda();
        setFase(null);
        return;
      }
      setFase("Timbro…");
      try {
        const r = await timbra(tipo, idLocale, posizione);
        if (r.errore && !r.definitivo) metti();
        else setEsito({ ...r, problema: r.ok ? problema : undefined });
      } catch {
        metti(); // la rete è caduta proprio adesso
      }
      setFase(null);
    });
  }

  const grande = "min-h-24 w-full rounded-2xl px-4 text-lg font-bold disabled:opacity-60";

  return (
    <div className="flex flex-col gap-4">
      {!online && (
        <p role="status" className="rounded-xl bg-slate-800 px-4 py-2 text-center text-sm font-semibold text-white">
          Senza rete: puoi timbrare lo stesso, la timbratura parte quando torna la rete.
        </p>
      )}

      <section className="flex flex-col items-center gap-1 rounded-2xl bg-slate-900 p-6 text-center text-white">
        <div className="text-sm text-slate-300 first-letter:uppercase">{GIORNO.format(adesso)}</div>
        <div className="text-5xl font-bold tabular-nums tracking-tight">{oraRoma(adesso)}</div>
        <div className="text-sm text-slate-300">
          {stato === "dentro" && `In servizio · ${durataTesto(lavoro)} lavorate oggi`}
          {stato === "pausa" && `In pausa dalle ${oraRoma(ultima!.orario)} · ${durataTesto(lavoro)} lavorate oggi`}
          {stato === "fuori" && (ultima ? `Fuori servizio dalle ${oraRoma(ultima.orario)} · ${durataTesto(lavoro)} lavorate oggi` : "Non hai ancora timbrato")}
        </div>
      </section>

      {daInviare.length > 0 && (
        <section role="status" className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">
            {daInviare.length === 1
              ? "1 timbratura ancora da inviare: parte da sola quando torna la rete."
              : `${daInviare.length} timbrature ancora da inviare: partono da sole quando torna la rete.`}{" "}
            Non cancellare i dati del browser finché non sono partite.
          </p>
          <ul className="mt-1">
            {daInviare.map((c) => (
              <li key={c.idLocale}>
                {oraRoma(c.orario)} {ETICHETTE_TIMBRATURA[c.tipo]}
              </li>
            ))}
          </ul>
          {online && (
            <button type="button" onClick={() => void inviaCoda()} className="mt-2 min-h-11 rounded-lg border border-amber-400 bg-white px-3 font-semibold">
              Invia adesso
            </button>
          )}
        </section>
      )}

      {respinte.map((x, i) => (
        <p key={i} role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{x}</p>
      ))}

      {esito.ok && !esito.inCoda && (
        <div role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-900">
          <p className="font-semibold">{esito.ok}</p>
          {esito.esito === "fuori_zona" && (
            <p className="mt-1">Sei a {distanzaTesto(esito.distanza)} dalla ditta: la timbratura vale, ma il titolare la vedrà segnata «fuori zona».</p>
          )}
          {esito.esito === "non_disponibile" && (
            <p className="mt-1">Timbratura registrata senza posizione ({esito.problema ?? "posizione non arrivata"}): il titolare la vedrà segnata.</p>
          )}
        </div>
      )}
      {esito.errore && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{esito.errore}</p>}

      {stato === "fuori" && (
        <button type="button" disabled={inCorso} onClick={() => premi("entrata")} className={`${grande} bg-green-700 text-white hover:bg-green-800`}>
          {inCorso ? fase : "Timbra entrata"}
        </button>
      )}

      {stato !== "fuori" && !confermaUscita && (
        <div className="grid grid-cols-2 gap-3">
          {stato === "dentro" ? (
            <button type="button" disabled={inCorso} onClick={() => premi("inizio_pausa")} className={`${grande} bg-amber-400 text-slate-900 hover:bg-amber-500`}>
              {inCorso ? fase : "Inizia pausa"}
            </button>
          ) : (
            <button type="button" disabled={inCorso} onClick={() => premi("fine_pausa")} className={`${grande} bg-blue-600 text-white hover:bg-blue-700`}>
              {inCorso ? fase : "Fine pausa"}
            </button>
          )}
          <button type="button" disabled={inCorso} onClick={() => setConfermaUscita(true)} className={`${grande} bg-red-700 text-white hover:bg-red-800`}>
            Timbra uscita
          </button>
        </div>
      )}

      {confermaUscita && (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-red-300 bg-red-50 p-4">
          <p className="text-center font-semibold text-red-900">Confermi l&apos;uscita? Dopo la può correggere solo l&apos;ufficio.</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setConfermaUscita(false)} className="min-h-14 rounded-xl border border-slate-300 bg-white font-semibold text-slate-700">
              Annulla
            </button>
            <button type="button" disabled={inCorso} onClick={() => premi("uscita")} className="min-h-14 rounded-xl bg-red-700 font-bold text-white hover:bg-red-800 disabled:opacity-60">
              {inCorso ? fase : "Sì, esco"}
            </button>
          </div>
        </div>
      )}

      {pausa > 0 && <p className="text-center text-xs text-slate-500">Pausa di oggi: {durataTesto(pausa)}</p>}
      {controllo && (
        <p className="text-center text-xs text-slate-500">
          Quando timbri, il telefono controlla se sei vicino alla ditta. Si salva solo se eri in zona e a che distanza, mai
          dove ti trovi.
        </p>
      )}
    </div>
  );
}
