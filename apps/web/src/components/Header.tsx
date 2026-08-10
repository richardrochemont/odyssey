"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useQuery } from "@tanstack/react-query";
import {
  Menu,
  X,
  Search,
  Plus,
  Sparkles,
  Bell,
  LogOut,
  Settings as SettingsIcon,
  ChevronDown,
  Building2,
  Users,
  DollarSign,
  Receipt,
  FolderOpen,
} from "lucide-react";
import SearchPalette from "./SearchPalette";
import AssistantPanel from "./AssistantPanel";

export default function Header() {
  const { user, logout, token } = useAuth();
  const pathname = usePathname();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const addMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click or ESC key
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setIsAddMenuOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsAddMenuOpen(false);
        setIsProfileMenuOpen(false);
        setIsMobileMenuOpen(false);
      }
      // Cmd/Ctrl + K shortcut for Search Palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const roleLabels: Record<string, string> = {
    owner: "Portfolio Owner",
    manager: "Portfolio Manager",
    maintenance: "Maintenance Lead",
    read_only: "Investor (Read-only)",
  };

  const navItems = [
    {
      name: "Portfolio",
      href: "/",
      roles: ["owner", "manager", "maintenance", "read_only"],
    },
    {
      name: "Properties",
      href: "/properties",
      roles: ["owner", "manager", "maintenance", "read_only"],
    },
    {
      name: "Tenants",
      href: "/leases",
      roles: ["owner", "manager", "read_only"],
    },
    {
      name: "Cash Flow",
      href: "/cashflow",
      roles: ["owner", "manager", "read_only"],
    },
    {
      name: "Expenses",
      href: "/expenses",
      roles: ["owner", "manager", "read_only"],
    },
    {
      name: "Documents",
      href: "/documents",
      roles: ["owner", "manager", "read_only"],
    },
  ];

  const allowedNavItems = user ? navItems.filter((item) => item.roles.includes(user.role)) : [];

  // Determine decisions count for indicator
  const fetchWithAuth = async (path: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  };

  const { data: leases = [] } = useQuery<any[]>({
    queryKey: ["leases", token],
    queryFn: () => fetchWithAuth("/leases"),
    enabled: !!token,
  });

  const { data: payments = [] } = useQuery<any[]>({
    queryKey: ["payments", token],
    queryFn: () => fetchWithAuth("/payments"),
    enabled: !!token,
  });

  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["properties", token],
    queryFn: () => fetchWithAuth("/properties"),
    enabled: !!token,
  });

  // Calculate decisions
  const overdueRents = payments.filter((p) => p.status === "overdue");
  const expiringLeases = leases.filter((l) => l.status === "active" && l.daysUntilExpiry <= 90);
  const vacantUnits = properties.flatMap((p) => p.units || []).filter((u) => u.status === "vacant");
  const decisionsCount = overdueRents.length + expiringLeases.length + vacantUnits.length;

  const triggerAskOdyssey = () => {
    window.dispatchEvent(new CustomEvent("toggle-assistant"));
  };

  // Check if role is authorized to use "+ Add" dropdown (owners and managers)
  const isAuthorizedToCreate = user ? (user.role === "owner" || user.role === "manager") : false;

  if (!user) return null;

  return (
    <>
      <header className="sticky top-0 z-40 w-full h-[68px] bg-white border-b border-border flex items-center justify-between px-6 font-sans">
        {/* Brand wordmark / Icon */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-85 transition-opacity focus:outline-none focus:ring-1 focus:ring-primary rounded"
            aria-label="Odyssey Portfolio Overview"
            data-testid="brand-logo"
          >
            {/* Elegant luxury vector icon */}
            <div className="h-6 w-6 rounded bg-primary text-white flex items-center justify-center font-serif font-bold text-xs tracking-tighter">
              Ω
            </div>
            <span className="text-lg font-serif font-bold tracking-tight text-primary">Odyssey</span>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-5 h-[68px] overflow-x-auto scrollbar-none max-w-[500px] xl:max-w-none">
            {allowedNavItems.map((item) => {
              const isActive =
                pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`text-xs font-semibold uppercase tracking-wider relative flex items-center h-full px-1 border-b-[2px] transition-colors focus:outline-none focus:border-primary ${
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted hover:text-foreground"
                  }`}
                  data-testid={`nav-link-${item.name.toLowerCase()}`}
                  data-active={isActive ? "true" : "false"}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-3">
          {/* Global Search Button */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 border border-border rounded bg-background hover:bg-neutral-100 transition-colors text-xs text-muted font-sans focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            aria-label="Open global search palette"
            data-testid="search-palette-btn"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search...</span>
            <kbd className="text-[10px] bg-white border border-border px-1.5 py-0.5 rounded font-mono font-semibold ml-4">
              ⌘K
            </kbd>
          </button>

          {/* Mobile-only Search Trigger */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="sm:hidden p-2 text-muted hover:text-foreground hover:bg-neutral-100 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Open search"
          >
            <Search className="h-4.5 w-4.5" />
          </button>

          {/* Add Dropdown Menu (Restricted to owner/manager) */}
          {isAuthorizedToCreate && (
            <div className="relative" ref={addMenuRef} data-testid="add-menu-container">
              <button
                onClick={() => setIsAddMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-primary hover:bg-neutral-800 rounded shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
                aria-haspopup="true"
                aria-expanded={isAddMenuOpen}
                aria-label="Quick actions add menu"
                data-testid="add-btn"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Add</span>
                <ChevronDown className="h-3 w-3" />
              </button>

              {isAddMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white border border-border rounded shadow-lg py-1 z-50 text-xs font-medium font-sans animate-fade-in" role="menu">
                  <Link
                    href="/"
                    onClick={() => {
                      setIsAddMenuOpen(false);
                      // Custom event to trigger quick expense modal on page
                      window.dispatchEvent(new CustomEvent("open-add-expense-modal"));
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-foreground hover:bg-neutral-50 transition-colors"
                    role="menuitem"
                  >
                    <Receipt className="h-3.5 w-3.5 text-muted" />
                    Add expense
                  </Link>
                  <Link
                    href="/cashflow?action=record-payment"
                    onClick={() => setIsAddMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-foreground hover:bg-neutral-50 transition-colors"
                    role="menuitem"
                  >
                    <DollarSign className="h-3.5 w-3.5 text-muted" />
                    Record payment
                  </Link>
                  <Link
                    href="/leases?action=add-tenant"
                    onClick={() => setIsAddMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-foreground hover:bg-neutral-50 transition-colors"
                    role="menuitem"
                  >
                    <Users className="h-3.5 w-3.5 text-muted" />
                    Add tenant
                  </Link>
                  <Link
                    href="/properties?action=add-property"
                    onClick={() => setIsAddMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-foreground hover:bg-neutral-50 transition-colors"
                    role="menuitem"
                  >
                    <Building2 className="h-3.5 w-3.5 text-muted" />
                    Add property
                  </Link>
                  <Link
                    href="/documents?action=upload"
                    onClick={() => setIsAddMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-foreground hover:bg-neutral-50 transition-colors"
                    role="menuitem"
                  >
                    <FolderOpen className="h-3.5 w-3.5 text-muted" />
                    Upload document
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Ask Odyssey AI control */}
          <button
            onClick={triggerAskOdyssey}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-primary bg-white border border-border hover:bg-neutral-50 rounded transition-all focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Ask Odyssey AI Assistant"
            data-testid="ask-odyssey-btn"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">Ask Odyssey</span>
          </button>

          {/* Decisions Needed / Notifications indicator */}
          <Link
            href="/"
            className="relative p-2 text-muted hover:text-foreground hover:bg-neutral-100 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label={`${decisionsCount} decisions needed`}
            data-testid="decisions-indicator"
          >
            <Bell className="h-4.5 w-4.5" />
            {decisionsCount > 0 && (
              <span className="absolute top-1 right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-danger"></span>
              </span>
            )}
          </Link>

          {/* Profile Dropdown */}
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setIsProfileMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 p-1 rounded hover:bg-neutral-50 transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
              aria-haspopup="true"
              aria-expanded={isProfileMenuOpen}
              aria-label="Account and workspace menu"
              data-testid="profile-btn"
            >
              <div className="h-7 w-7 rounded-full bg-neutral-200 text-primary flex items-center justify-center font-bold text-xs">
                {user.name.charAt(0)}
              </div>
              <ChevronDown className="h-3 w-3 text-muted hidden md:block" />
            </button>

            {isProfileMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-56 bg-white border border-border rounded shadow-lg py-1 z-50 text-xs font-sans animate-fade-in" role="menu">
                {/* User details */}
                <div className="px-3 py-2 border-b border-border bg-neutral-50">
                  <p className="font-bold text-foreground truncate">{user.name}</p>
                  <p className="text-[10px] text-muted truncate mt-0.5">{roleLabels[user.role]}</p>
                </div>
                {/* Active Workspace */}
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-[9px] uppercase font-bold text-muted tracking-wider">Active Workspace</p>
                  <p className="font-semibold text-foreground truncate mt-0.5">Odyssey Capital LLC</p>
                </div>
                {/* Menu items */}
                <Link
                  href="/settings"
                  onClick={() => setIsProfileMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-foreground hover:bg-neutral-50 transition-colors"
                  role="menuitem"
                >
                  <SettingsIcon className="h-3.5 w-3.5 text-muted" />
                  Workspace Settings
                </Link>
                <button
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-danger hover:bg-danger/5 transition-colors border-t border-border mt-1"
                  role="menuitem"
                >
                  <LogOut className="h-3.5 w-3.5 text-danger" />
                  Sign Out
                </button>
              </div>
            )}
          </div>

          {/* Mobile hamburger menu button */}
          <button
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="lg:hidden p-2 text-muted hover:text-foreground hover:bg-neutral-100 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Toggle mobile navigation menu"
            data-testid="mobile-menu-btn"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Mobile/Tablet Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-foreground/20 backdrop-blur-sm pt-[68px]" onClick={() => setIsMobileMenuOpen(false)}>
          <div
            className="w-72 h-full bg-white border-r border-border shadow-xl flex flex-col justify-between py-4 px-3 animate-slide-in"
            onClick={(e) => e.stopPropagation()}
            data-testid="mobile-drawer"
          >
            <div className="space-y-4">
              {/* Workspace details inside mobile drawer */}
              <div className="px-3 py-2 bg-neutral-50 rounded border border-border">
                <p className="text-[9px] uppercase font-bold text-muted tracking-wider">Active Workspace</p>
                <p className="font-bold text-foreground truncate mt-0.5">Odyssey Capital LLC</p>
              </div>

              {/* Navigation links */}
              <nav className="space-y-1">
                {allowedNavItems.map((item) => {
                  const isActive =
                    pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded text-xs font-semibold uppercase tracking-wider transition-colors ${
                        isActive
                          ? "bg-neutral-100 text-foreground"
                          : "text-muted hover:bg-neutral-50 hover:text-foreground"
                      }`}
                      data-testid={`mobile-nav-link-${item.name.toLowerCase()}`}
                    >
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Mobile Footer */}
            <div className="pt-4 border-t border-border space-y-3">
              <div className="flex items-center gap-3 px-3">
                <div className="h-8 w-8 rounded-full bg-neutral-200 text-primary flex items-center justify-center font-bold text-xs">
                  {user.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-foreground truncate">{user.name}</p>
                  <p className="text-[10px] text-muted truncate">{roleLabels[user.role]}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-danger border border-danger/20 bg-danger/5 hover:bg-danger hover:text-white rounded transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Search command palette */}
      <SearchPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      {/* Expose AssistantPanel globally under Header so it remains accessible from all routes */}
      <AssistantPanel />
    </>
  );
}
