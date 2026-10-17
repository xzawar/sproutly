"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Leaf } from "lucide-react";
import { PasswordInput } from "./password-input";
import { authenticate } from "@/app/actions";
export function AuthForm({
  mode,
  configured,
  error: initialError,
}: {
  mode: "login" | "register";
  configured: boolean;
  error?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const [registered, setRegistered] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const r = await authenticate(mode, {
        email: String(f.get("email")),
        password: String(f.get("password")),
        ...(mode === "register" ? { name: String(f.get("name")) } : {}),
      });
      if (!r.ok) setError(r.error);
      else if (mode === "register") setRegistered(true);
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-visual">
        <img src="/monstera.webp" alt="Monstera plant in soft natural light" />
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Leaf size={24} />
          </span>
          <span>sproutly.</span>
        </Link>
        <div className="auth-quote">
          <p className="eyebrow">A LITTLE CARE GOES A LONG WAY</p>
          <h1>
            Make room
            <br />
            for growing.
          </h1>
          <p>
            Your plants. Your rhythms.
            <br />
            One calmer place to care for them.
          </p>
        </div>
        <span className="auth-caption">PLANT CARE, SIMPLIFIED.</span>
      </section>
      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <Link href="/" className="brand mobile-brand">
            <span className="brand-mark">
              <Leaf size={24} />
            </span>
            <span>sproutly.</span>
          </Link>
          {registered ? (
            <>
              <CheckCircle2 size={36} className="success-icon" />
              <h2>Check your inbox.</h2>
              <p className="muted">
                If sign-up is available for this address, you’ll receive a
                confirmation email. Confirm your account, then sign in. If email
                confirmation is disabled in your Supabase project, you can sign
                in now.
              </p>
              <Link className="button primary auth-submit" href="/login">
                Back to sign in <ArrowRight size={17} />
              </Link>
            </>
          ) : (
            <>
              <span className="eyebrow">YOUR PERSONAL GARDEN AWAITS</span>
              <h2>
                {mode === "login" ? "Welcome back." : "Let’s grow something."}
              </h2>
              <p className="muted">
                {mode === "login"
                  ? "Sign in and pick up where you left off."
                  : "A little more organized. A little greener."}
              </p>
              {!configured && (
                <div className="setup-notice">
                  <strong>Ready when you are.</strong>
                  <p>
                    Supabase isn’t connected yet. Explore the local demo, or
                    follow the README to connect your project.
                  </p>
                </div>
              )}
              <form onSubmit={submit}>
                {mode === "register" && (
                  <label className="field">
                    Your name
                    <input
                      name="name"
                      autoComplete="name"
                      maxLength={100}
                      required
                      placeholder="Alex Morgan"
                    />
                  </label>
                )}
                <label className="field">
                  Email address
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    maxLength={254}
                    required
                    placeholder="you@example.com"
                  />
                </label>
                <label className="field">
                  Password
                  <PasswordInput
                    name="password"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={6}
                    maxLength={128}
                    required
                    placeholder={
                      mode === "register"
                        ? "At least 6 characters"
                        : "Your password"
                    }
                  />
                  {mode === "register" && (
                    <span className="hint">
                      Use at least 6 characters. A unique passphrase works
                      well.
                    </span>
                  )}
                </label>
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
                    : mode === "login"
                      ? "Sign in"
                      : "Create account"}
                  <ArrowRight size={17} />
                </button>
              </form>
              {mode === "login" && (
                <Link className="text-link forgot-link" href="/forgot-password">
                  Forgot password?
                </Link>
              )}
              <p className="auth-switch">
                {mode === "login"
                  ? "New to Sproutly?"
                  : "Already growing with us?"}{" "}
                <Link href={mode === "login" ? "/register" : "/login"}>
                  {mode === "login" ? "Create an account" : "Sign in"}
                </Link>
              </p>
              <div className="auth-divider">
                <span>or take a look around</span>
              </div>
              <Link
                href="/demo/dashboard"
                className="button secondary auth-submit"
              >
                Explore the local demo <Leaf size={17} />
              </Link>
              <p className="auth-fineprint">
                No account needed for the demo.
                <br />
                Your real garden stays private to you.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
