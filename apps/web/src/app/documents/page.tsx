"use client";

import React, { useEffect } from "react";
import Header from "@/components/Header";
import { FolderOpen } from "lucide-react";
import { useRouter } from "next/navigation";

export default function DocumentsPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("action") === "upload") {
        alert("Upload document clicked! Integration with secure S3 storage compatible.");
        // Clear param
        const url = new URL(window.location.href);
        url.searchParams.delete("action");
        router.replace(url.pathname);
      }
    }
  }, [router]);

  return (
    <div className="flex flex-col bg-background min-h-screen text-foreground">
      <Header />
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans">
        <div className="pb-6 mb-8 border-b border-border">
          <h1 className="text-3xl font-serif font-semibold tracking-tight">Documents</h1>
          <p className="text-xs text-muted mt-0.5">Odyssey secure file storage</p>
        </div>
        <div className="bg-white border border-border p-12 rounded-md shadow-sm flex flex-col items-center justify-center text-center font-sans">
          <FolderOpen className="h-12 w-12 text-neutral-300 mb-3" />
          <h3 className="text-base font-semibold font-serif text-foreground">No Documents Lodged</h3>
          <p className="text-xs text-muted max-w-xs mt-1">
            Store lease PDFs, vendor invoices, and property titles here. Integration with S3 storage compatible.
          </p>
        </div>
      </main>
    </div>
  );
}
