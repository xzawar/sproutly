"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Leaf, CheckCircle2 } from "lucide-react";
import { PasswordInput } from "./password-input";
import { requestPasswordReset, updatePassword } from "@/app/actions";
export function RecoveryForm({
  reset = false,
  configured,
}: {
  reset?: boolean;
  configured: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      if (reset && f.get("password") !== f.get("confirm")) {
        setError("Passwords do not match.");
        return;
      }
      const r = reset
        ? await updatePassword(String(f.get("password")))
        : await requestPasswordReset(String(f.get("email")));
      if (r.ok) setDone(true);
      else setError(r.error);
    } catch {
      setError("Unable to connect. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="recovery-page">
      <Link href="/login" className="brand">
        <span className="brand-mark">
          <Leaf size={24} />
        </span>
        <span>sproutly.</span>
      </Link>
      <section className="panel recovery-card">
        <h1>{reset ? "Reset password" : "Forgot password?"}</h1>
        {done ? (
          <div role="status" className="recovery-success">
            <CheckCircle2 size={32} aria-hidden="true" />
            <h2>{reset ? "Password updated." : "Check your inbox."}</h2>
            <p className="muted">
              {reset
                ? "Your new password is ready. You can sign in with it."
                : "If this address has an account, a recovery link will arrive shortly."}
            </p>
          </div>
        ) : (
          <>
            <p className="muted">
              {reset
                ? "Use at least 6 characters."
                : "Enter your email for a reset link."}
            </p>
            {!configured && (
              <p className="info-note">
                Connect Supabase to enable password recovery.
              </p>
            )}
            <form onSubmit={submit}>
              {reset ? (
                <>
                  <label className="field" htmlFor="new-password">
                    New password
                    <PasswordInput
                      id="new-password"
                      name="password"
                      required
                      minLength={6}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </label>
                  <label className="field" htmlFor="confirm-password">
                    Confirm password
                    <PasswordInput
                      id="confirm-password"
                      name="confirm"
                      required
                      minLength={6}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </label>
                </>
              ) : (
                <label className="field">
                  Email address
                  <input
                    type="email"
                    name="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    placeholder="you@example.com"
                  />
                </label>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button primary auth-submit"
                disabled={busy || !configured}
              >
                {busy
                  ? "Please wait…"
                  : reset
                    ? "Update password"
                    : "Send recovery link"}
              </button>
            </form>
          </>
        )}
        <Link href="/login" className="text-link">
          ← Back to sign in
        </Link>
      </section>
    </main>
  );
}
