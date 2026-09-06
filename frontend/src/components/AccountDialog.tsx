"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Dialog,
  Field,
  dangerButtonClass,
  dialogInputClass,
  primaryButtonClass,
  subtleButtonClass,
} from "@/components/Dialog";
import { ShieldIcon, SignOutIcon, TrashIcon } from "@/components/icons";
import {
  ApiError,
  administerUser,
  changePassword,
  deleteUser,
  getAllUsers,
  updateProfile,
  type User,
} from "@/lib/api";

type AccountDialogProps = {
  user: User;
  onUserChange: (user: User) => void;
  onClose: () => void;
  onLogout: () => void | Promise<void>;
};

export const AccountDialog = ({
  user,
  onUserChange,
  onClose,
  onLogout,
}: AccountDialogProps) => {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [people, setPeople] = useState<User[]>([]);

  const isAdmin = user.role === "admin";

  const loadPeople = () => {
    getAllUsers()
      .then(setPeople)
      .catch(() => setError("Unable to load the account list."));
  };

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    loadPeople();
  }, [isAdmin]);

  const report = (caught: unknown, fallback: string) => {
    setStatus("");
    setError(
      caught instanceof ApiError && caught.detail ? caught.detail : fallback
    );
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      onUserChange(await updateProfile(displayName.trim(), email.trim()));
      setError("");
      setStatus("Profile saved.");
    } catch (caught) {
      report(caught, "Unable to save your profile.");
    }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setError("");
      setStatus("Password changed. Sign in again to continue.");
      await onLogout();
    } catch (caught) {
      report(caught, "Unable to change your password.");
    }
  };

  const administer = async (target: User, changes: Parameters<typeof administerUser>[1]) => {
    try {
      await administerUser(target.id, changes);
      setError("");
      setStatus(`Updated ${target.username}.`);
      loadPeople();
    } catch (caught) {
      report(caught, "Unable to update that account.");
    }
  };

  const remove = async (target: User) => {
    try {
      await deleteUser(target.id);
      setError("");
      setStatus(`Deleted ${target.username}.`);
      loadPeople();
    } catch (caught) {
      report(caught, "Unable to delete that account.");
    }
  };

  return (
    <Dialog title="Account" onClose={onClose}>
      {status ? (
        <p className="rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--navy-dark)]">
          {status}
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

      <form onSubmit={saveProfile} className="space-y-3">
        <Field label="Signed in as">
          <p className="text-sm font-semibold text-[var(--navy-dark)]">
            @{user.username}
            <span className="ml-2 text-xs uppercase tracking-[0.14em] text-[var(--gray-text)]">
              {user.role}
            </span>
          </p>
        </Field>
        <Field label="Display name">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className={dialogInputClass}
            aria-label="Display name"
            required
          />
        </Field>
        <Field label="Email">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={dialogInputClass}
            aria-label="Email"
            type="email"
          />
        </Field>
        <button type="submit" className={primaryButtonClass}>
          Save profile
        </button>
      </form>

      <form
        onSubmit={savePassword}
        className="space-y-3 border-t border-[var(--stroke)] pt-5"
      >
        <h3 className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-[var(--navy-dark)]">
          Change password
        </h3>
        <Field label="Current password">
          <input
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            className={dialogInputClass}
            aria-label="Current password"
            required
          />
        </Field>
        <Field label="New password">
          <input
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            type="password"
            autoComplete="new-password"
            minLength={8}
            className={dialogInputClass}
            aria-label="New password"
            required
          />
        </Field>
        <button type="submit" className={primaryButtonClass}>
          Change password
        </button>
      </form>

      {isAdmin ? (
        <section className="space-y-3 border-t border-[var(--stroke)] pt-5">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.14em] text-[var(--navy-dark)]">
            <ShieldIcon width={14} height={14} />
            Workspace accounts
          </h3>
          <ul className="space-y-2">
            {people.map((person) => (
              <li
                key={person.id}
                className="flex items-center gap-2 rounded-xl border border-[var(--stroke)] px-3 py-2"
                data-testid={`account-${person.username}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--navy-dark)]">
                    {person.displayName || person.username}
                  </p>
                  <p className="truncate text-xs text-[var(--gray-text)]">
                    @{person.username}
                    {person.isActive ? "" : " · deactivated"}
                  </p>
                </div>
                <select
                  value={person.role}
                  onChange={(event) =>
                    void administer(person, {
                      role: event.target.value as User["role"],
                    })
                  }
                  aria-label={`Role for ${person.username}`}
                  className="rounded-lg border border-[var(--stroke)] px-2 py-1 text-xs font-semibold"
                >
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    void administer(person, { isActive: !person.isActive })
                  }
                  className="rounded-full border border-[var(--stroke)] px-2.5 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                  aria-label={
                    person.isActive
                      ? `Deactivate ${person.username}`
                      : `Activate ${person.username}`
                  }
                >
                  {person.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(person)}
                  className="icon-button icon-button-danger h-7 w-7"
                  aria-label={`Delete ${person.username}`}
                >
                  <TrashIcon width={14} height={14} />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-5 text-[var(--gray-text)]">
            Deleting an account also deletes the boards it owns.
          </p>
        </section>
      ) : null}

      <div className="flex justify-between border-t border-[var(--stroke)] pt-5">
        <button type="button" onClick={onClose} className={subtleButtonClass}>
          Close
        </button>
        <button
          type="button"
          onClick={() => void onLogout()}
          className={`${dangerButtonClass} inline-flex items-center gap-2`}
        >
          <SignOutIcon width={14} height={14} />
          Sign out
        </button>
      </div>
    </Dialog>
  );
};
