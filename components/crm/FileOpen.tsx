import type { ReactNode } from "react";

export function fileHref(path: string) {
  return `/api/files?path=${encodeURIComponent(path)}`;
}

export function FileOpenLink({
  path,
  children,
  className,
}: {
  path: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={fileHref(path)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children ?? "Ouvrir"}
    </a>
  );
}

export function fileKindIcon(mime?: string | null, name?: string | null) {
  const hay = `${mime || ""} ${name || ""}`.toLowerCase();
  if (hay.includes("pdf")) return "picture_as_pdf";
  if (hay.includes("image") || /\.(jpe?g|png|webp|heic|gif)$/i.test(name || "")) {
    return "photo";
  }
  return "draft";
}
