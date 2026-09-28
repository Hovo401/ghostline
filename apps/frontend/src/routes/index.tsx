import { createFileRoute, Link } from "@tanstack/react-router";

// Home page (REQUIREMENTS.md §4/§5.1, DESIGN-BRIEF.md §6). The 3D scene,
// hero variant and marketing copy land as their own feature — this is
// the routing + layout scaffold it plugs into.
export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-6 text-center text-fg">
      <p className="font-mono text-xs uppercase tracking-widest text-mute">
        Веб-мессенджер · без номера телефона
      </p>
      <h1 className="text-4xl font-medium tracking-tight">Ghostline</h1>
      <div className="flex gap-3">
        <Link to="/login" className="rounded-xl bg-accent px-6 py-3 font-semibold text-ink">
          Создать аккаунт
        </Link>
      </div>
    </main>
  );
}
