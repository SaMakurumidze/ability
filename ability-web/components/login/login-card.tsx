'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { login } from '@/lib/api';
import { setStoredToken } from '@/lib/session';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserTypeToggle } from './user-type-toggle';

export function LoginCard() {
  const router = useRouter();
  const [userType, setUserType] = useState<'issuer' | 'business'>('issuer');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await login(phone, password);
      setStoredToken(response.token);
      router.push(userType === 'issuer' ? '/issuer' : '/business');
    } catch (err: any) {
      setError(err?.message || 'Login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-border/50 shadow-xl">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-center text-2xl font-bold">Welcome Back</CardTitle>
        <p className="text-center text-sm text-muted-foreground">Sign in to access your wallet</p>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Account Type</Label>
            <UserTypeToggle value={userType} onChange={setUserType} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+263..."
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
              className="border-border bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="border-border bg-secondary/50"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Login
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
