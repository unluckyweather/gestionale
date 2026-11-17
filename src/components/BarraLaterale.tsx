"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const voci = [
  { href: "/", etichetta: "Dashboard" },
  { href: "/preventivi", etichetta: "Preventivi" },
  { href: "/produzione", etichetta: "Produzione" },
  { href: "/timbrature", etichetta: "Timbrature" },
  { href: "/anagrafiche", etichetta: "Anagrafiche" },
];

export default function BarraLaterale() {
  const percorso = usePathname();

  return (
    <nav className="w-56 shrink-0 bg-slate-900 text-slate-100 min-h-screen p-4">
      <div className="text-lg font-semibold mb-6 px-2">Gestionale</div>
      <ul className="space-y-1">
        {voci.map((voce) => {
          const attiva =
            voce.href === "/" ? percorso === "/" : percorso.startsWith(voce.href);
          return (
            <li key={voce.href}>
              <Link
                href={voce.href}
                className={`block rounded-md px-3 py-2 text-sm ${
                  attiva ? "bg-slate-700 font-medium" : "hover:bg-slate-800"
                }`}
              >
                {voce.etichetta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
