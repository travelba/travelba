"use client";

import { useState, type ReactNode } from "react";

/** Sous xl, une seule liste à la fois. Le bureau garde les deux colonnes. */
export function TransactionsPanels({
  receipts,
  expenses,
}: {
  receipts: ReactNode;
  expenses: ReactNode;
}) {
  const [tab, setTab] = useState<"receipts" | "expenses">("receipts");

  return (
    <div className="mt-6 min-w-0">
      <div
        className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-[#e9e8e5] p-1 xl:hidden"
        role="tablist"
        aria-label="Transactions"
      >
        {(
          [
            ["receipts", "Encaissements"],
            ["expenses", "Dépenses"],
          ] as const
        ).map(([id, label]) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`transactions-tab-${id}`}
              aria-controls={`transactions-panel-${id}`}
              aria-selected={selected}
              onClick={() => setTab(id)}
              className={`admin-tap rounded-full px-3 py-2 text-sm font-semibold ${
                selected ? "bg-[var(--admin-navy)] text-white" : "text-[var(--admin-navy)]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
        <section
          id="transactions-panel-receipts"
          role="tabpanel"
          aria-labelledby="transactions-tab-receipts"
          className={tab === "receipts" ? "min-w-0" : "hidden min-w-0 xl:block"}
        >
          {receipts}
        </section>
        <section
          id="transactions-panel-expenses"
          role="tabpanel"
          aria-labelledby="transactions-tab-expenses"
          className={tab === "expenses" ? "min-w-0" : "hidden min-w-0 xl:block"}
        >
          {expenses}
        </section>
      </div>
    </div>
  );
}
