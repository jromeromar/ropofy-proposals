import { redirect } from "next/navigation";

// El área del consultor es el único punto de entrada por ahora.
// Las pantallas del cliente vivirán bajo /p/ (aún no existen).
export default function Home() {
  redirect("/consultor");
}
