"use client";

import { ErrorPanel, type RouteErrorProps } from "@/components/crm/ErrorPanel";

export default function AccountError(props: RouteErrorProps) {
  return <ErrorPanel {...props} homeHref="/mon-compte" homeLabel="Retour à mon espace" />;
}
