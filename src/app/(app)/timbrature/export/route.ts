// Export delle ore del mese per il consulente del lavoro (CSV che si apre in Excel).
// Solo titolare, ufficio e contabilità.
//   /timbrature/export?mese=2026-11&tipo=giorni  → una riga per persona e giorno
//   /timbrature/export?mese=2026-11&tipo=totali  → una riga per persona
// Formato «italiano»: punto e virgola tra le colonne, virgola nei decimali, UTF-8 con BOM.
import { NextResponse, type NextRequest } from "next/server";
import { leggiUtente } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { dataIt } from "@/lib/produzione";
import { leggiMese, meseValido } from "../datiMese";

/** minuti → ore con due decimali e la virgola: 465 → "7,75" */
function ore(min: number): string {
  return (Math.round((min / 60) * 100) / 100).toFixed(2).replace(".", ",");
}

/** un valore CSV, tra virgolette se serve */
function cella(v: string | number | null | undefined): string {
  const t = v === null || v === undefined ? "" : String(v);
  // niente formule: un testo che inizia con = + - @ resta testo
  const numero = /^-?\d+(,\d+)?$/.test(t);
  const sicuro = !numero && /^[=+\-@]/.test(t) ? `'${t}` : t;
  return /[;"\n\r]/.test(sicuro) ? `"${sicuro.replace(/"/g, '""')}"` : sicuro;
}

const GIORNI = ["", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

export async function GET(richiesta: NextRequest) {
  const utente = await leggiUtente();
  if (!utente || !utente.attivo) return new NextResponse("Non autorizzato", { status: 401 });
  if (!["titolare", "ufficio", "contabilita"].includes(utente.ruolo)) return new NextResponse("Non autorizzato", { status: 403 });

  const mese = meseValido(richiesta.nextUrl.searchParams.get("mese") ?? undefined);
  const tipo = richiesta.nextUrl.searchParams.get("tipo") === "totali" ? "totali" : "giorni";

  const supabase = await creaClientServer();
  const dati = await leggiMese(supabase, mese);
  if (dati.errore) return new NextResponse("Errore nella lettura delle timbrature", { status: 500 });

  const righe: string[][] = [];
  if (tipo === "giorni") {
    righe.push(["Persona", "Data", "Giorno", "Entrata", "Uscita", "Pausa (ore)", "Ore lavorate", "Ore previste", "Differenza", "Assenza", "Avvisi"]);
    for (const r of dati.righe) {
      for (const g of r.giorni) {
        const gs = new Date(`${g.giorno}T12:00:00Z`).getUTCDay() || 7;
        righe.push([
          r.persona.nome_completo,
          dataIt(g.giorno),
          GIORNI[gs],
          g.entrata ?? "",
          g.uscita ?? "",
          g.minutiPausa ? ore(g.minutiPausa) : "",
          ore(g.minutiLavorati),
          ore(g.minutiPrevisti),
          g.passato ? ore(g.minutiLavorati - g.minutiPrevisti) : "",
          g.assenza ?? "",
          g.avvisi.join(", "),
        ]);
      }
    }
  } else {
    righe.push(["Persona", "Giorni lavorati", "Ore lavorate", "Ore previste", "Differenza", "Giorni di ferie", "Ore di permesso", "Giorni di malattia o assenza", "Giorni da controllare"]);
    for (const r of dati.righe) {
      const t = r.totali;
      righe.push([
        r.persona.nome_completo,
        String(t.giorniLavorati),
        ore(t.minutiLavorati),
        ore(t.minutiPrevisti),
        ore(t.minutiLavorati - t.minutiPrevisti),
        String(t.giorniFerie),
        ore(t.minutiPermesso),
        String(t.giorniMalattia),
        String(t.giorniAnomalie),
      ]);
    }
  }

  const csv = "﻿" + righe.map((r) => r.map(cella).join(";")).join("\r\n") + "\r\n";
  const nome = `Ore ${mese}${tipo === "totali" ? " totali" : ""}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
