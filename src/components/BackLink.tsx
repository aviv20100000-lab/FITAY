import Link from "next/link";

export default function BackLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold transition active:scale-[.98] ${className}`}
      style={{
        color: "var(--text)",
        background: "rgba(255,255,255,.055)",
        border: "1px solid rgba(224,190,147,.2)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)",
      }}
    >
      <span aria-hidden="true" className="text-lg leading-none wood-text">
        →
      </span>
      <span>{children}</span>
    </Link>
  );
}
