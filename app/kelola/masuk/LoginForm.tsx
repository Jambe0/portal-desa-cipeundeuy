"use client";

import { FormEvent, useState } from "react";

type LoginPayload = {
  error?: string;
  redirectTo?: string;
};

export default function LoginForm({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, accessKey, returnTo }),
      });
      const payload = (await response.json()) as LoginPayload;
      if (!response.ok || !payload.redirectTo) {
        throw new Error(payload.error || "Login pengelola gagal.");
      }

      window.location.assign(payload.redirectTo);
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Login pengelola gagal.",
      );
      setLoading(false);
    }
  };

  return (
    <form className="admin-login-form" onSubmit={submit}>
      <label>
        <span>Email pengelola</span>
        <input
          autoComplete="username"
          inputMode="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label>
        <span>Kunci akses</span>
        <input
          autoComplete="current-password"
          minLength={43}
          maxLength={43}
          name="accessKey"
          pattern="[A-Za-z0-9_-]{43}"
          type="password"
          value={accessKey}
          onChange={(event) => setAccessKey(event.target.value)}
          required
        />
      </label>
      {error && (
        <p className="admin-alert error" role="alert">
          {error}
        </p>
      )}
      <button className="admin-primary" type="submit" disabled={loading}>
        {loading ? "Memeriksa\u2026" : "Masuk ke panel"}
      </button>
    </form>
  );
}
