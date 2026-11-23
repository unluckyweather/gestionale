// Giacenza di un articolo con il colore dell'avviso:
// rossa se sotto zero, arancione se sotto la scorta minima.
import { livelloGiacenza, quantitaConUnita } from "@/lib/magazzino";

type Props = { giacenza: number | string; unita: string; sottoScorta: boolean };

export default function Giacenza({ giacenza, unita, sottoScorta }: Props) {
  const livello = livelloGiacenza(giacenza, sottoScorta);
  const testo = quantitaConUnita(giacenza, unita);
  if (livello === "ok") return <span>{testo}</span>;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md whitespace-nowrap px-1.5 py-0.5 font-semibold ${
        livello === "negativa" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"
      }`}
      title={livello === "negativa" ? "Giacenza sotto zero: controlla i movimenti o fai un inventario" : "Sotto la scorta minima: da riordinare"}
    >
      <span aria-hidden="true">⚠</span>
      {testo}
      <span className="sr-only">{livello === "negativa" ? "(sotto zero)" : "(sotto scorta)"}</span>
    </span>
  );
}
