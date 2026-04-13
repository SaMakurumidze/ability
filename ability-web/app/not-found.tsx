export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-foreground">Page not found</h1>
        <p className="mt-2 text-muted-foreground">The page you are looking for does not exist.</p>
      </div>
    </main>
  );
}
