"use client";

import { useEffect, useState, type FormEvent } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import {
  getSession,
  login,
  logout,
  type User,
} from "@/lib/api";

export const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getSession()
      .then(setUser)
      .catch(() => setError("Unable to connect to the server."))
      .finally(() => setCheckingSession(false));
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const authenticatedUser = await login(
        String(form.get("username")),
        String(form.get("password"))
      );
      setUser(authenticatedUser);
    } catch {
      setError("Invalid username or password.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  if (checkingSession) {
    return (
      <main className="grid min-h-screen place-items-center">
        <p className="text-sm font-semibold text-[var(--gray-text)]">
          Loading workspace...
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center px-6 py-12">
        <section className="w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
          <div className="mb-8 h-1 w-16 rounded-full bg-[var(--accent-yellow)]" />
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--primary-blue)]">
            Project workspace
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
            Welcome back
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
            Sign in to open your Kanban board.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleLogin}>
            <label className="block text-sm font-semibold text-[var(--navy-dark)]">
              Username
              <input
                name="username"
                autoComplete="username"
                className="mt-2 w-full rounded-xl border border-[var(--stroke)] px-4 py-3 outline-none transition focus:border-[var(--primary-blue)]"
                required
              />
            </label>
            <label className="block text-sm font-semibold text-[var(--navy-dark)]">
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                className="mt-2 w-full rounded-xl border border-[var(--stroke)] px-4 py-3 outline-none transition focus:border-[var(--primary-blue)]"
                required
              />
            </label>
            {error ? (
              <p role="alert" className="text-sm font-semibold text-red-700">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div>
      <div className="fixed right-6 top-6 z-20 flex items-center gap-3 rounded-full border border-[var(--stroke)] bg-white/90 px-4 py-2 shadow-[var(--shadow)] backdrop-blur">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
          {user.username}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          className="text-sm font-semibold text-[var(--secondary-purple)]"
        >
          Sign out
        </button>
      </div>
      <KanbanBoard />
    </div>
  );
};
