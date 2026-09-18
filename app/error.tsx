"use client";

import { ErrorPanel, type RouteErrorProps } from "@/components/crm/ErrorPanel";

export default function RootError(props: RouteErrorProps) {
  return <ErrorPanel {...props} homeHref="/" homeLabel="Retour à l’accueil" />;
}
