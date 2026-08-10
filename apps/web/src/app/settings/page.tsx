"use client";

import React from "react";
import Header from "@/components/Header";
import { Settings as SettingsIcon } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="flex flex-col bg-background min-h-screen text-foreground">
      <Header />
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans">
        <div className="pb-6 mb-8 border-b border-border">
          <h1 className="text-3xl font-serif font-semibold tracking-tight">Settings</h1>
          <p className="text-xs text-muted mt-0.5">Odyssey system configuration</p>
        </div>
        <div className="bg-white border border-border p-12 rounded-md shadow-sm flex flex-col items-center justify-center text-center">
          <SettingsIcon className="h-12 w-12 text-neutral-300 mb-3" />
          <h3 className="text-base font-semibold font-serif text-foreground">Workspace Configuration</h3>
          <p className="text-xs text-muted max-w-xs mt-1">
            Manage your organization roles, Clerk auth integrations, API webhooks, and billing details.
          </p>
        </div>
      </main>
    </div>
  );
}
