"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import {
  LayoutDashboard,
  Building2,
  Users,
  DollarSign,
  Receipt,
  FolderOpen,
  Settings as SettingsIcon,
  LogOut,
  User,
  ShieldCheck,
  Upload,
  RefreshCw,
  CheckSquare,
} from "lucide-react";
import AssistantPanel from "./AssistantPanel";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const roleLabels: Record<string, string> = {
    owner: "Portfolio Owner",
    manager: "Portfolio Manager",
    accountant: "Accountant",
    maintenance: "Maintenance Lead",
    read_only: "Investor (Read-only)",
  };

  const navItems = [
    {
      name: "Portfolio",
      href: "/",
      icon: LayoutDashboard,
      roles: ["owner", "manager", "maintenance", "read_only"],
    },
    {
      name: "Tasks",
      href: "/tasks",
      icon: CheckSquare,
      roles: ["owner", "manager", "accountant", "maintenance", "read_only"],
    },
    {
      name: "Properties",
      href: "/properties",
      icon: Building2,
      roles: ["owner", "manager", "maintenance", "read_only"],
    },
    {
      name: "Tenants",
      href: "/leases",
      icon: Users,
      roles: ["owner", "manager", "read_only"],
    },
    {
      name: "Cash Flow",
      href: "/cashflow",
      icon: DollarSign,
      roles: ["owner", "manager", "read_only"],
    },
    {
      name: "Expenses",
      href: "/expenses",
      icon: Receipt,
      roles: ["owner", "manager", "read_only"],
    },
    {
      name: "Import",
      href: "/import",
      icon: Upload,
      roles: ["owner", "manager"],
    },
    {
      name: "Reconciliation",
      href: "/reconciliation",
      icon: RefreshCw,
      roles: ["owner", "manager", "read_only"],
    },
    {
      name: "Documents",
      href: "/documents",
      icon: FolderOpen,
      roles: ["owner", "manager", "read_only"],
    },
    {
      name: "Settings",
      href: "/settings",
      icon: SettingsIcon,
      roles: ["owner", "manager", "read_only"],
    },
  ];

  const allowedNavItems = navItems.filter((item) => item.roles.includes(user.role));

  return (
    <aside className="w-64 bg-white border-r border-border min-h-screen flex flex-col justify-between sticky top-0">
      <div className="flex-1">
        {/* Brand Header */}
        <div className="p-6 border-b border-border flex items-center gap-2">
          <div className="bg-primary text-white p-2 rounded-md">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-serif font-bold tracking-tight text-primary">Odyssey</h1>
            <p className="text-[10px] text-muted uppercase tracking-wider font-semibold font-sans">Operating System</p>
          </div>
        </div>

        {/* Organization Switcher Preview */}
        <div className="mx-4 my-4 p-3 bg-background border border-border rounded-md">
          <p className="text-[10px] uppercase font-bold text-muted tracking-wider font-sans">Active Workspace</p>
          <p className="text-sm font-semibold text-foreground truncate mt-1 font-sans">Odyssey Capital LLC</p>
        </div>

        {/* Nav Links */}
        <nav className="px-3 py-2 space-y-1">
          {allowedNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors font-sans ${
                  isActive
                    ? "bg-primary text-white"
                    : "text-foreground hover:bg-background"
                }`}
              >
                <Icon className={`h-4.5 w-4.5 ${isActive ? "text-white" : "text-primary"}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User Footer Profile */}
      <div className="p-4 border-t border-border bg-background/50 space-y-3">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 text-primary p-2 rounded-full">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate font-sans">{user.name}</p>
            <p className="text-[11px] text-muted truncate font-medium font-sans">{roleLabels[user.role]}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-danger border border-danger/20 bg-danger/5 hover:bg-danger hover:text-white rounded-md transition-colors font-sans"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>
      <AssistantPanel />
    </aside>
  );
}
