import { DashboardSidebar } from '@/components/dashboard/sidebar';

export default function IssuerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <DashboardSidebar variant="issuer" />
      <main className="ml-64">{children}</main>
    </div>
  );
}
