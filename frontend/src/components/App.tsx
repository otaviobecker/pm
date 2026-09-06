"use client";

import { useEffect, useState, type FormEvent } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { BoardIcon, LockIcon, UserIcon } from "@/components/icons";
import {
  ApiError,
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
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setError("Invalid username or password.");
      } else if (error instanceof ApiError && error.detail) {
        setError(error.detail);
      } else {
        setError("Unable to reach the server. Please try again.");
      }
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
        <section className="grid w-full max-w-4xl overflow-hidden rounded-[28px] border border-[var(--stroke)] bg-white shadow-[var(--shadow)] md:grid-cols-2">
          <div className="hidden flex-col justify-between bg-[var(--navy-dark)] p-9 text-white md:flex">
            <span
              aria-hidden
              className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10"
            >
              <BoardIcon width={22} height={22} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--accent-yellow)]">
                Project workspace
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold leading-tight">
                One board.
                <br />
                Five columns.
                <br />
                Zero clutter.
              </h2>
              <p className="mt-4 max-w-xs text-sm leading-6 text-white/70">
                Drag cards between stages, rename columns inline, and let the
                board assistant handle the busywork.
              </p>
            </div>
            <div className="flex gap-1.5" aria-hidden>
              <span className="h-1.5 w-10 rounded-full bg-[var(--gray-text)]" />
              <span className="h-1.5 w-10 rounded-full bg-[var(--accent-yellow)]" />
              <span className="h-1.5 w-10 rounded-full bg-[var(--primary-blue)]" />
              <span className="h-1.5 w-10 rounded-full bg-[var(--secondary-purple)]" />
              <span className="h-1.5 w-10 rounded-full bg-white/40" />
            </div>
          </div>

          <div className="p-8 sm:p-10">
            <div className="mb-6 h-1 w-14 rounded-full bg-[var(--accent-yellow)]" />
            <h1 className="font-display text-3xl font-semibold text-[var(--navy-dark)]">
              Welcome back
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
              Sign in to open your Kanban board.
            </p>

            <form className="mt-7 space-y-4" onSubmit={handleLogin}>
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gray-text)]">
                Username
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-[var(--stroke)] px-3 transition focus-within:border-[var(--primary-blue)]">
                  <span aria-hidden className="text-[var(--gray-text)]">
                    <UserIcon width={16} height={16} />
                  </span>
                  <input
                    name="username"
                    autoComplete="username"
                    className="w-full bg-transparent py-3 text-sm font-semibold normal-case tracking-normal text-[var(--navy-dark)] outline-none"
                    required
                  />
                </div>
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gray-text)]">
                Password
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-[var(--stroke)] px-3 transition focus-within:border-[var(--primary-blue)]">
                  <span aria-hidden className="text-[var(--gray-text)]">
                    <LockIcon width={16} height={16} />
                  </span>
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    className="w-full bg-transparent py-3 text-sm font-semibold normal-case tracking-normal text-[var(--navy-dark)] outline-none"
                    required
                  />
                </div>
              </label>
              {error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                >
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
          </div>
        </section>
      </main>
    );
  }

  return <KanbanBoard user={user} onLogout={handleLogout} />;
};
