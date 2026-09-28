import { createFileRoute } from "@tanstack/react-router";

// Login/register (REQUIREMENTS.md §4/§5.2, DESIGN-BRIEF.md §7.1).
export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg text-fg">
      <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-8">
        <h1 className="mb-6 text-2xl font-medium">С возвращением</h1>
        <p className="font-mono text-xs text-mute">// вход и регистрация — TODO</p>
      </div>
    </main>
  );
}
