"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthScreen } from "@/components/AuthScreen";
import { Workspace } from "@/components/Workspace";
import { getSession, logout, type User } from "@/lib/api";

export const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getSession()
      .then(setUser)
      .catch(() => setError("Unable to connect to the server."))
      .finally(() => setCheckingSession(false));
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setUser(null);
  }, []);

  if (checkingSession) {
    return (
      <main className="grid min-h-screen place-items-center">
        <p className="text-sm font-semibold text-[var(--gray-text)]">
          {error || "Loading workspace..."}
        </p>
      </main>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={setUser} />;
  }

  return <Workspace user={user} onUserChange={setUser} onLogout={handleLogout} />;
};
