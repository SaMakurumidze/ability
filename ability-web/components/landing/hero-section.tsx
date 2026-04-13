'use client';

import { ArrowRight, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';

type HeroSectionProps = {
  onLoginClick: () => void;
};

export function HeroSection({ onLoginClick }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden px-4 py-20 md:py-32">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      <div className="container relative mx-auto">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-8 flex justify-center">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg">
                <Wallet className="h-6 w-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-foreground">Ability Capital</span>
            </div>
          </div>
          <h1 className="mb-6 text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
            Ability Capital Wallet
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
            Capital infrastructure connecting investors, issuers, businesses, and institutions.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              onClick={onLoginClick}
              className="w-full bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/20 hover:from-primary/90 hover:to-primary/70 sm:w-auto"
            >
              Login
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
