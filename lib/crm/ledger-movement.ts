export type LedgerMovementRow = {
  id: string;
  credit: boolean;
  title: string;
  amountLabel: string;
  occurredLabel: string;
  kindLabel: string;
  whenWhere: string | null;
  reference: string | null;
  carnetHref: string | null;
  carnetLabel?: string | null;
};
