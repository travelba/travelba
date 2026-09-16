"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RefreshTasksButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function refresh() {
    setPending(true);
    const { data, error } = await createClient().rpc("crm_refresh_operational_tasks");
    setPending(false);
    setMessage(error ? error.message : `${data || 0} relance(s) vérifiée(s).`);
    if (!error) router.refresh();
  }
  return <div className="text-right"><button type="button" onClick={refresh} disabled={pending} className="admin-af-btn rounded-full px-4 py-2.5 text-sm disabled:opacity-50">{pending ? "Analyse…" : "Générer les relances"}</button>{message ? <p role="status" className="mt-1 text-xs text-muted">{message}</p> : null}</div>;
}
