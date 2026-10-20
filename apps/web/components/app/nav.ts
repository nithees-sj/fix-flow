import {
  BarChart3,
  Bell,
  Boxes,
  CalendarClock,
  ClipboardList,
  HardHat,
  Inbox,
  LayoutDashboard,
  MapPin,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Permission, Role } from '@fixflow/shared';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  roles?: Role[];
  mobile?: boolean; // include in the bottom tab bar
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ORG_ADMIN', 'MANAGER'], mobile: true },
      { href: '/my-work', label: 'My work', icon: HardHat, roles: ['TECHNICIAN'], mobile: true },
      { href: '/my-requests', label: 'My requests', icon: Inbox, roles: ['REQUESTER', 'TECHNICIAN', 'MANAGER', 'ORG_ADMIN'], mobile: true },
      { href: '/work-orders', label: 'Work orders', icon: ClipboardList, roles: ['ORG_ADMIN', 'MANAGER', 'TECHNICIAN'], mobile: true },
      { href: '/notifications', label: 'Notifications', icon: Bell, mobile: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/assets', label: 'Assets', icon: Boxes, permission: 'asset.read', roles: ['ORG_ADMIN', 'MANAGER', 'TECHNICIAN'] },
      { href: '/locations', label: 'Locations', icon: MapPin, roles: ['ORG_ADMIN', 'MANAGER', 'TECHNICIAN'] },
      { href: '/schedules', label: 'Preventive maintenance', icon: CalendarClock, permission: 'schedule.read' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart3, permission: 'analytics.read' },
      { href: '/team', label: 'Team', icon: Users, permission: 'team.read' },
    ],
  },
  {
    items: [{ href: '/settings', label: 'Settings', icon: Settings }],
  },
];

export function visibleNav(role: Role, can: (p: Permission) => boolean): NavSection[] {
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => (!i.roles || i.roles.includes(role)) && (!i.permission || can(i.permission))) })).filter((s) => s.items.length);
}
