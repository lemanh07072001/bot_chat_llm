import { Clock, Globe, Inbox, LayoutDashboard, Users, type LucideIcon } from "lucide-react";

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
    { label: "Chờ phân công", href: "/inbox?filter=unassigned", icon: Clock },
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

export function isNavigationActive(href: string, pathname: string, params: URLSearchParams): boolean {
  const [path, query = ""] = href.split("?");
  if (pathname !== path && !(path !== "/" && pathname.startsWith(`${path}/`))) return false;
  if (path === "/inbox") {
    const expected = new URLSearchParams(query).get("filter");
    return expected ? params.get("filter") === expected : params.get("filter") !== "unassigned";
  }
  return true;
}
