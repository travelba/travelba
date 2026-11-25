import type { LucideIcon } from "lucide-react";
import { Compass, Hotel, IdCard, LogOut, Luggage, MessageCircle, Receipt } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  explore: Compass,
  luggage: Luggage,
  hotel: Hotel,
  receipt_long: Receipt,
  badge: IdCard,
  chat: MessageCircle,
  logout: LogOut,
};

/** Icônes de la barre client. Le jeu complet de l’agence reste hors de cet écran. */
export function AccountIcon({
  name,
  className,
  filled = false,
  strokeWidth,
}: {
  name: string;
  className?: string;
  filled?: boolean;
  strokeWidth?: number;
}) {
  const Cmp = ICONS[name] || IdCard;
  return <Cmp aria-hidden className={className} strokeWidth={strokeWidth ?? (filled ? 2.4 : 1.75)} />;
}
