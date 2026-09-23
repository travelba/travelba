import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Bus,
  Calendar,
  Car,
  ChevronDown,
  Compass,
  CreditCard,
  File,
  FileText,
  Headset,
  History,
  Hotel,
  IdCard,
  Image as ImageIcon,
  Landmark,
  LayoutGrid,
  ListChecks,
  LogOut,
  Mail,
  Luggage,
  MessageCircle,
  Minus,
  Phone,
  Plane,
  PlaneTakeoff,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  Ship,
  Sparkles,
  Ticket,
  Timer,
  TrainFront,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  explore: Compass,
  luggage: Luggage,
  receipt_long: Receipt,
  badge: IdCard,
  chat: MessageCircle,
  timer: Timer,
  flight_takeoff: PlaneTakeoff,
  menu_book: BookOpen,
  arrow_forward: ArrowRight,
  task_alt: ListChecks,
  airlines: Plane,
  hotel: Hotel,
  airplane_ticket: Ticket,
  support_agent: Headset,
  history_edu: History,
  account_balance_wallet: Wallet,
  south_west: ArrowDownLeft,
  verified_user: ShieldCheck,
  verified: BadgeCheck,
  flight: Plane,
  description: FileText,
  picture_as_pdf: FileText,
  photo: ImageIcon,
  draft: File,
  grid_view: LayoutGrid,
  group: Users,
  account_balance: Landmark,
  sync_alt: ArrowLeftRight,
  search: Search,
  person: User,
  credit_card: CreditCard,
  add: Plus,
  payments: Landmark,
  logout: LogOut,
  call: Phone,
  id_card: IdCard,
  health_and_safety: ShieldCheck,
  airport_shuttle: Bus,
  train: TrainFront,
  directions_car: Car,
  directions_boat: Ship,
  local_activity: Sparkles,
  event: Calendar,
  minus: Minus,
  close: X,
  expand_more: ChevronDown,
  mail: Mail,
};

export function Icon({
  name,
  className,
  filled = false,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  const Cmp = ICONS[name] || File;
  return (
    <Cmp
      aria-hidden
      className={className}
      strokeWidth={filled ? 2.4 : 1.75}
    />
  );
}
