"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-screen">
      <h1>Let’s try that again.</h1>
      <p>
        Your garden couldn’t load. Check the Supabase connection and database
        setup.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
      <Link className="button secondary" href="/login">
        Back to sign in
      </Link>
    </main>
  );
}
