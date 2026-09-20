"use client";

import { ErrorPanel, type RouteErrorProps } from "@/components/crm/ErrorPanel";

export default function AdminError(props: RouteErrorProps) {
  return <ErrorPanel {...props} homeHref="/admin" homeLabel="Tableau de bord" />;
}
