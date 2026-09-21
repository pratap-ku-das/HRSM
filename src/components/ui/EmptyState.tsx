import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  compact?: boolean;
  action?: React.ReactNode;
};

export function EmptyState({ title, description, icon: Icon = Inbox, compact = false, action }: EmptyStateProps) {
  return (
    <div className={`neo-empty-state ${compact ? 'neo-empty-state--compact' : ''}`}>
      <span className="neo-empty-state__icon" aria-hidden="true"><Icon /></span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action && <div className="neo-empty-state__action">{action}</div>}
    </div>
  );
}
