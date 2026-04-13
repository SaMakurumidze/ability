'use client';

export default function GlobalError() {
  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground">Something went wrong</h1>
          <p className="mt-2 text-muted-foreground">Please refresh and try again.</p>
        </div>
      </body>
    </html>
  );
}
