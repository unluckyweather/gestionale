// Next.js esegue questo file prima di ogni pagina (in Next 16 si chiama "proxy",
// prima "middleware").
import type { NextRequest } from "next/server";
import { aggiornaSessione } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return aggiornaSessione(request);
}

export const config = {
  // Tutte le pagine tranne file statici e immagini.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
