import {
  Archive,
  Cable,
  FileJson2,
  History,
  LayoutDashboard,
  ListChecks,
  Mail,
  MonitorDot,
  PlaySquare,
  RefreshCcw,
  Settings2,
  SlidersHorizontal,
  Users,
} from "lucide-react";

export const navigationGroups = [
  {
    label: "工作台",
    items: [{ to: "/overview", label: "概览", shortLabel: "概览", icon: LayoutDashboard }],
  },
  {
    label: "注册中心",
    items: [
      { to: "/registration/new", label: "新建注册", shortLabel: "注册", icon: PlaySquare },
      { to: "/registration/runtime", label: "运行监控", shortLabel: "监控", icon: MonitorDot },
    ],
  },
  {
    label: "账号中心",
    items: [
      { to: "/accounts", label: "账号列表", shortLabel: "账号", icon: Users },
      { to: "/accounts/relogin", label: "重新登录", shortLabel: "重登", icon: RefreshCcw },
      { to: "/accounts/relogin/history", label: "登录历史", shortLabel: "历史", icon: History },
      { to: "/accounts/credentials", label: "授权文件", shortLabel: "授权", icon: Archive },
    ],
  },
  {
    label: "系统配置",
    items: [
      { to: "/settings/registration", label: "注册设置", shortLabel: "设置", icon: SlidersHorizontal },
      { to: "/settings/cpa", label: "CPA / Auth", shortLabel: "CPA", icon: ListChecks },
      { to: "/settings/grok2api", label: "Grok2API", shortLabel: "Grok2API", icon: Cable },
      { to: "/settings/mail", label: "邮箱服务", shortLabel: "邮箱", icon: Mail },
      { to: "/settings/outlook", label: "Outlook 邮箱池", shortLabel: "Outlook", icon: Settings2 },
      { to: "/settings/config", label: "配置文件", shortLabel: "配置", icon: FileJson2 },
    ],
  },
] as const;

export const navigationItems = navigationGroups.flatMap((group) => group.items);

export const mobilePrimaryItems = [
  navigationGroups[0].items[0],
  navigationGroups[1].items[0],
  navigationGroups[2].items[0],
] as const;

