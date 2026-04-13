'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  LayoutDashboard,
  LogOut,
  PiggyBank,
  Settings,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearStoredToken } from '@/lib/session';
import { cn } from '@/lib/utils';

type SidebarProps = {
  variant: 'issuer' | 'business';
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const issuerNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/issuer', icon: LayoutDashboard },
  { label: 'Wallet', href: '/issuer/wallet', icon: Wallet },
  { label: 'Capital Raised', href: '/issuer/capital', icon: TrendingUp },
  { label: 'Investments', href: '/issuer/investments', icon: PiggyBank },
  { label: 'Transactions', href: '/issuer/transactions', icon: ArrowRightLeft },
  { label: 'Settings', href: '/issuer/settings', icon: Settings },
];

const businessNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/business', icon: LayoutDashboard },
  { label: 'Wallet', href: '/business/wallet', icon: Wallet },
  { label: 'Incoming Payments', href: '/business/incoming', icon: ArrowDownLeft },
  { label: 'Outgoing Payments', href: '/business/outgoing', icon: ArrowUpRight },
  { label: 'Transactions', href: '/business/transactions', icon: ArrowRightLeft },
  { label: 'Settings', href: '/business/settings', icon: Settings },
];

export function DashboardSidebar({ variant }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navItems = variant === 'issuer' ? issuerNavItems : businessNavItems;

  const handleSignOut = () => {
    clearStoredToken();
    router.push('/');
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-sidebar-border px-6 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
            <Wallet className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-semibold">Ability Capital</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </aside>
  );
}
