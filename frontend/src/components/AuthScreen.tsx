"use client";

import { useState, type FormEvent } from "react";
import { BoardIcon, LockIcon, UserIcon } from "@/components/icons";
import { ApiError, login, register, type User } from "@/lib/api";

type AuthScreenProps = {
  onAuthenticated: (user: User) => void;
};

type Mode = "signIn" | "register";

const copy: Record<Mode, { heading: string; hint: string; action: string }> = {
  signIn: {
    heading: "Welcome back",
    hint: "Sign in to open your boards.",
    action: "Sign in",
  },
  register: {
    heading: "Create your account",
    hint: "Your workspace starts with a board you can rename.",
    action: "Create account",
  },
};

const fieldClass =
  "w-full bg-transparent py-3 text-sm font-semibold normal-case tracking-normal text-[var(--navy-dark)] outline-none";
const wrapClass =
  "mt-2 flex items-center gap-2 rounded-xl border border-[var(--stroke)] px-3 transition focus-within:border-[var(--primary-blue)]";
const labelClass =
  "block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gray-text)]";

export const AuthScreen = ({ onAuthenticated }: AuthScreenProps) => {
  const [mode, setMode] = useState<Mode>("signIn");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "");
    const password = String(form.get("password") ?? "");

    try {
      const user =
        mode === "signIn"
          ? await login(username, password)
          : await register(
              username,
              password,
              String(form.get("displayName") ?? "")
            );
      onAuthenticated(user);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setError("Invalid username or password.");
      } else if (caught instanceof ApiError && caught.detail) {
        setError(caught.detail);
      } else {
        setError("Unable to reach the server. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
  };

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
              Many boards.
              <br />
              One team.
              <br />
              Zero clutter.
            </h2>
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/70">
              Create boards, invite collaborators, track priorities and due
              dates, and let the assistant handle the busywork.
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
            {copy[mode].heading}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
            {copy[mode].hint}
          </p>

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            <label className={labelClass}>
              Username
              <div className={wrapClass}>
                <span aria-hidden className="text-[var(--gray-text)]">
                  <UserIcon width={16} height={16} />
                </span>
                <input
                  name="username"
                  autoComplete="username"
                  className={fieldClass}
                  required
                />
              </div>
            </label>
            {mode === "register" ? (
              <label className={labelClass}>
                Display name
                <div className={wrapClass}>
                  <span aria-hidden className="text-[var(--gray-text)]">
                    <UserIcon width={16} height={16} />
                  </span>
                  <input
                    name="displayName"
                    autoComplete="name"
                    className={fieldClass}
                  />
                </div>
              </label>
            ) : null}
            <label className={labelClass}>
              Password
              <div className={wrapClass}>
                <span aria-hidden className="text-[var(--gray-text)]">
                  <LockIcon width={16} height={16} />
                </span>
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "signIn" ? "current-password" : "new-password"
                  }
                  minLength={mode === "register" ? 8 : undefined}
                  className={fieldClass}
                  required
                />
              </div>
            </label>
            {mode === "register" ? (
              <p className="text-xs leading-5 text-[var(--gray-text)]">
                Use at least 8 characters.
              </p>
            ) : null}
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
              {submitting ? "Working..." : copy[mode].action}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--gray-text)]">
            {mode === "signIn" ? (
              <>
                No account yet?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="font-semibold text-[var(--primary-blue)] hover:underline"
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signIn")}
                  className="font-semibold text-[var(--primary-blue)] hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </section>
    </main>
  );
};
