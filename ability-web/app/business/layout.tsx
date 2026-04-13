import { DashboardSidebar } from '@/components/dashboard/sidebar';

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <DashboardSidebar variant="business" />
      <main className="ml-64">{children}</main>
    </div>
  );
}
