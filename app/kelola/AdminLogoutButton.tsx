"use client";

import { useState } from "react";
import { adminFetch } from "./admin-fetch";

export default function AdminLogoutButton() {
  const [loading, setLoading] = useState(false);

  const logout = async () => {
    setLoading(true);
    try {
      const response = await adminFetch("/api/auth/logout", {
        method: "POST",
      });
      if (!response.ok && response.status !== 401) {
        throw new Error("Logout gagal.");
      }
      window.location.assign("/");
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      className="admin-logout"
      type="button"
      disabled={loading}
      onClick={logout}
    >
      {loading ? "Keluar\u2026" : "Keluar"}
    </button>
  );
}
