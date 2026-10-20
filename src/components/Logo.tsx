import Link from "next/link";

export function Logo({ size = "md", href = "/" }: { size?: "md" | "xl"; href?: string }) {
  const text = size === "xl" ? "text-6xl sm:text-7xl" : "text-2xl";
  return (
    <Link href={href} className={`font-display uppercase leading-none tracking-wide ${text}`}>
      Rhyme<span className="text-gold">Tyme</span>
    </Link>
  );
}
