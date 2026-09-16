"use client";

import {
  BarChart3,
  Building2,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock,
  CreditCard,
  DoorOpen,
  FileText,
  FolderOpen,
  History,
  LayoutDashboard,
  List,
  ListChecks,
  MapPin,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Settings,
  Sparkles,
  StickyNote,
  Users,
  WalletCards,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

export type IconName =
  | "bar-chart-3"
  | "building-2"
  | "calendar-days"
  | "circle-alert"
  | "circle-check"
  | "circle-dashed"
  | "clock"
  | "credit-card"
  | "door-open"
  | "file-text"
  | "folder-open"
  | "history"
  | "layout-dashboard"
  | "list"
  | "list-checks"
  | "map-pin"
  | "message-circle"
  | "panel-left-close"
  | "panel-left-open"
  | "send"
  | "settings"
  | "sparkles"
  | "sticky-note"
  | "users"
  | "wallet-cards"
  | "wrench"
  | "x";

type AppIconProps = {
  className?: string;
  name: IconName;
  size?: number;
};

const icons: Record<IconName, LucideIcon> = {
  "bar-chart-3": BarChart3,
  "building-2": Building2,
  "calendar-days": CalendarDays,
  "circle-alert": CircleAlert,
  "circle-check": CircleCheck,
  "circle-dashed": CircleDashed,
  clock: Clock,
  "credit-card": CreditCard,
  "door-open": DoorOpen,
  "file-text": FileText,
  "folder-open": FolderOpen,
  history: History,
  "layout-dashboard": LayoutDashboard,
  list: List,
  "list-checks": ListChecks,
  "map-pin": MapPin,
  "message-circle": MessageCircle,
  "panel-left-close": PanelLeftClose,
  "panel-left-open": PanelLeftOpen,
  send: Send,
  settings: Settings,
  sparkles: Sparkles,
  "sticky-note": StickyNote,
  users: Users,
  "wallet-cards": WalletCards,
  wrench: Wrench,
  x: X,
};

export function AppIcon({ className = "", name, size = 17 }: AppIconProps) {
  const Icon = icons[name];

  return <Icon aria-hidden="true" className={className} size={size} strokeWidth={1.9} />;
}
