import { Globe, Inbox, LayoutDashboard, Users, type LucideIcon } from "lucide-react";

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  badge?: string | number;
  badgeColor?: string;
};

/** Only shipped application pages belong in the main navigation. */
export const NAVIGATION_GROUPS: { groupTitle: string; items: NavigationItem[] }[] = [
  { groupTitle: "Tổng quan", items: [
    { label: "Bàn làm việc", href: "/", icon: LayoutDashboard },
  ] },
  { groupTitle: "Hội thoại & CSKH", items: [
    { label: "Hộp thư đến", href: "/inbox", icon: Inbox },
  ] },
  { groupTitle: "Kênh kết nối", items: [
    { label: "Live Chat Widget", href: "/channels/widget", icon: Globe, adminOnly: true },
  ] },
  { groupTitle: "Quản trị", items: [
    { label: "Quản lý người dùng", href: "/users", icon: Users, adminOnly: true },
  ] },
];

export function navigationForRole(role?: string) {
  return NAVIGATION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || role === "admin"),
  })).filter((group) => group.items.length > 0);
}

export function isNavigationActive(href: string, pathname: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}
