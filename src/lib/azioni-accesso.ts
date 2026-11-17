"use server";
// Azioni di login e logout (girano sul server).
import { redirect } from "next/navigation";
import { creaClientServer } from "@/lib/supabase/server";

export type StatoLogin = { errore?: string };

export async function accedi(_precedente: StatoLogin, dati: FormData): Promise<StatoLogin> {
  const email = String(dati.get("email") ?? "").trim();
  const password = String(dati.get("password") ?? "");
  if (!email || !password) return { errore: "Inserisci email e password." };

  const supabase = await creaClientServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Messaggio volutamente generico: non diciamo se l'email esiste.
  if (error) return { errore: "Email o password non corretti." };

  redirect("/");
}

export async function esci() {
  const supabase = await creaClientServer();
  await supabase.auth.signOut();
  redirect("/login");
}
