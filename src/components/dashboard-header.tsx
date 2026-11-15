"use client";

import { NotificationCenter } from "@/components/notification-center";

export interface DashboardHeaderProps {
  recipientUserId: string;
  userEmail?: string | null;
}

export function DashboardHeader({ recipientUserId }: DashboardHeaderProps) {
  return (
    <header className="dashboard-top-header" role="banner">
      <div className="dashboard-top-header-inner">
        <div className="dashboard-top-header-left">
          <span className="dashboard-header-brand-badge" aria-hidden="true">
            <span className="dashboard-header-brand-dot" />
            <span>WORKSPACE</span>
          </span>
          <span className="dashboard-header-divider" aria-hidden="true">/</span>
          <span className="dashboard-header-title">Business Portal</span>
        </div>
        <div className="dashboard-top-header-right">
          <NotificationCenter recipientUserId={recipientUserId} />
        </div>
      </div>
    </header>
  );
}
