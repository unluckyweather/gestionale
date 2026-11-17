// Usato da src/proxy.ts: a ogni richiesta rinnova la sessione (i cookie del login)
// e manda alla pagina di login chi non è collegato.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PAGINE_PUBBLICHE = ["/login"];

export async function aggiornaSessione(request: NextRequest) {
  let risposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          risposta = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            risposta.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Importante: nessun codice tra createServerClient e questa riga.
  const { data } = await supabase.auth.getClaims();
  const collegato = Boolean(data?.claims);

  const percorso = request.nextUrl.pathname;
  const pubblica = PAGINE_PUBBLICHE.some((p) => percorso === p || percorso.startsWith(p + "/"));

  if (!collegato && !pubblica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return risposta;
}
