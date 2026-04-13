'use client';

import { useRef, useState } from 'react';
import { HeroSection } from '@/components/landing/hero-section';
import { LoginCard } from '@/components/login/login-card';

export default function HomePage() {
  const [showLogin, setShowLogin] = useState(false);
  const loginRef = useRef<HTMLDivElement>(null);

  const handleLoginClick = () => {
    setShowLogin(true);
    setTimeout(() => {
      loginRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  return (
    <main className="min-h-screen bg-background">
      <HeroSection onLoginClick={handleLoginClick} />

      <section
        ref={loginRef}
        className={`px-4 transition-all duration-500 ${
          showLogin ? 'py-16 opacity-100' : 'h-0 overflow-hidden py-0 opacity-0'
        }`}
      >
        <div className="container mx-auto flex justify-center">
          <LoginCard />
        </div>
      </section>

      <section className="bg-secondary/30 px-4 py-20">
        <div className="container mx-auto">
          <div className="grid gap-8 md:grid-cols-3">
            <FeatureCard
              title="For Issuers"
              description="Raise capital and monitor investment activity with one wallet view."
            />
            <FeatureCard
              title="For Businesses"
              description="Track incoming and outgoing settlements from your organization dashboard."
            />
            <FeatureCard
              title="API-Connected"
              description="Uses Ability API auth, wallet balances, and transaction endpoints."
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
      <h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
      <p className="leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
