// Quanto materiale del catalogo serve a un preventivo, nell'unità di MAGAZZINO, e quanto ce n'è.
//   lastre  → lastre intere necessarie per i pezzi (anche se al cliente si fanno pagare i m² usati)
//   bobine  → m² della riga ÷ m² di una bobina intera (serve la lunghezza della bobina nell'articolo)
//   altri   → la quantità della riga
// È solo un avviso: non prenota niente (l'impegno arriverà con le commesse).
import { unitaMagazzino } from "@/lib/magazzino";
import { calcolaMateriale, intero, pezziPerLastra } from "./calcoli";
import type { ArticoloScelto, BozzaFase, BozzaMateriale } from "./tipi";

export type Disponibilita = {
  articolo: ArticoloScelto;
  unita: string; // unità di magazzino
  servono: number | null; // null = non si riesce a convertire (es. bobina senza lunghezza)
  giacenza: number;
  inArrivo: number;
  mancano: number; // 0 se basta (o se servono è null)
};

/** Lastre intere che servono per i pezzi di una riga a lastra; null se mancano dati. */
function lastreNecessarie(r: BozzaMateriale): number | null {
  const L = intero(r.lastra_larghezza_cm, 1);
  const H = intero(r.lastra_altezza_cm, 1);
  const a = intero(r.pezzo_larghezza_cm, 1);
  const b = intero(r.pezzo_altezza_cm, 1);
  const pezzi = intero(r.pezzi, 0);
  if (!L || !H || !a || !b || !pezzi) return null;
  const perLastra = pezziPerLastra(L, H, a, b, intero(r.margine_taglio_cm, 1) ?? 0);
  return perLastra < 1 ? null : Math.ceil(pezzi / perLastra);
}

/** Quantità di una riga nell'unità di magazzino dell'articolo; null se non si può convertire. */
function quantitaMagazzino(r: BozzaMateriale, a: ArticoloScelto): number | null {
  const unita = unitaMagazzino({ ...a, bobina_lunghezza_m: a.bobina_lunghezza_m ?? null });
  if (r.formato === "lastra") return unita === "lastra" ? lastreNecessarie(r) : null;

  const calcolo = calcolaMateriale(r);
  if (calcolo.quantita === null) return null;
  if (unita === "bobina") {
    // m² della riga ÷ m² di una bobina intera (2 decimali, per eccesso)
    const m2 = r.formato === "bobina" || calcolo.unita === "m2" ? calcolo.quantita : null;
    if (m2 === null || !a.larghezza_bobina_m || !a.bobina_lunghezza_m) return null;
    return Math.ceil((m2 / (Number(a.larghezza_bobina_m) * Number(a.bobina_lunghezza_m))) * 100) / 100;
  }
  if (unita === "lastra") return calcolo.unita === "lastra" ? calcolo.quantita : null;
  return calcolo.quantita; // stessa unità dell'articolo
}

/** Un elemento per ogni articolo del catalogo usato nel preventivo (righe dello stesso articolo sommate). */
export function disponibilita(fasi: BozzaFase[], articoli: ArticoloScelto[]): Disponibilita[] {
  const perId = new Map(articoli.map((a) => [a.id, a]));
  const somme = new Map<string, number | null>();
  for (const f of fasi) {
    for (const r of f.materiali) {
      const a = r.articolo_id ? perId.get(r.articolo_id) : undefined;
      if (!a) continue;
      const q = quantitaMagazzino(r, a);
      const prima = somme.has(a.id) ? somme.get(a.id)! : 0;
      somme.set(a.id, prima === null || q === null ? null : Math.round((prima + q) * 1000) / 1000);
    }
  }
  return [...somme].map(([id, servono]) => {
    const a = perId.get(id)!;
    const giacenza = Number(a.giacenza ?? 0);
    return {
      articolo: a,
      unita: unitaMagazzino({ ...a, bobina_lunghezza_m: a.bobina_lunghezza_m ?? null }),
      servono,
      giacenza,
      inArrivo: Number(a.in_arrivo ?? 0),
      mancano: servono === null ? 0 : Math.max(Math.round((servono - Math.max(giacenza, 0)) * 1000) / 1000, 0),
    };
  });
}
