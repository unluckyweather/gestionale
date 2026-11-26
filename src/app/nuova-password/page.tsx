import type { Metadata } from "next";
import { redirect } from "next/navigation";
import RiquadroAccesso from "@/components/RiquadroAccesso";
import { creaClientServer } from "@/lib/supabase/server";
import ModuloNuovaPassword from "./ModuloNuovaPassword";

export const metadata: Metadata = { title: "Nuova password · Gestionale" };

// Ci si arriva dal link dell'email (che collega l'utente) o, da collegati,
// per cambiare la propria password. Senza login il proxy manda a /login.
export default async function PaginaNuovaPassword() {
  const supabase = await creaClientServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?errore=link");

  return (
    <RiquadroAccesso
      titolo="Scegli la nuova password"
      sottotitolo={
        <>
          Per <strong className="font-medium text-slate-700">{data.user.email}</strong>. Almeno 8 caratteri.
        </>
      }
    >
      <ModuloNuovaPassword />
    </RiquadroAccesso>
  );
}
