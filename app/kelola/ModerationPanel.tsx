"use client";

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { adminFetch } from "./admin-fetch";
import {
  isServiceIconKey,
  SERVICE_ICON_CATALOG,
  ServiceCategoryIcon,
  type ServiceIconKey,
} from "../service-icons";

type DirectoryStatus = "pending" | "published" | "archived";
type DirectoryFilter = DirectoryStatus | "all";

type DirectoryEntry = {
  id: string;
  kind: "umkm" | "service";
  name: string;
  category: string;
  title: string;
  description: string;
  meta: string;
  phone: string;
  publicLocation: string | null;
  imageUrl: string | null;
  iconKey: string | null;
  status: DirectoryStatus;
  source: string;
  whatsappUniqueVisitors30d: number;
  whatsappClicks30d: number;
  autoFeatured: boolean;
  createdAt: string;
  updatedAt: string;
};

type Pagination = {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

type DirectoryCounts = Record<DirectoryFilter, number>;

type ModerationPayload = {
  entries?: DirectoryEntry[];
  pagination?: Pagination;
  counts?: DirectoryCounts;
  error?: string;
};

const PAGE_LIMIT = 12;

const statusLabels: Record<DirectoryStatus, string> = {
  pending: "Menunggu",
  published: "Tayang",
  archived: "Diarsipkan",
};

export default function ModerationPanel({
  onChanged,
}: {
  onChanged?: () => void;
}) {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [filter, setFilter] = useState<DirectoryFilter>("pending");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [pagination, setPagination] = useState<Pagination>({
    offset: 0,
    limit: PAGE_LIMIT,
    total: 0,
    hasMore: false,
  });
  const [counts, setCounts] = useState<DirectoryCounts>({
    pending: 0,
    published: 0,
    archived: 0,
    all: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingAction, setUpdatingAction] = useState<
    "published" | "archived" | "delete" | null
  >(null);
  const [iconDrafts, setIconDrafts] = useState<
    Record<string, ServiceIconKey | "">
  >({});
  const [savingIconId, setSavingIconId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const deleteTriggerRefs = useRef<
    Record<string, HTMLButtonElement | null>
  >({});

  const loadEntries = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);

    try {
      const searchParams = new URLSearchParams({
        scope: "moderation",
        status: filter,
        offset: String(offset),
        limit: String(PAGE_LIMIT),
      });
      if (query) searchParams.set("q", query);

      const response = await adminFetch(`/api/directory?${searchParams}`, {
        cache: "no-store",
        signal,
      });
      const payload = (await response.json()) as ModerationPayload;

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            "Sesi pengelola telah berakhir. Muat ulang halaman untuk masuk kembali.",
          );
        }
        throw new Error(payload.error || "Data pendaftaran gagal dimuat.");
      }
      const nextEntries = payload.entries || [];
      const nextPagination = payload.pagination || {
        offset,
        limit: PAGE_LIMIT,
        total: nextEntries.length,
        hasMore: false,
      };

      setEntries(nextEntries);
      setPagination(nextPagination);
      if (payload.counts) setCounts(payload.counts);
      setError("");

      if (
        nextEntries.length === 0 &&
        nextPagination.total > 0 &&
        offset > 0
      ) {
        setOffset(Math.max(0, offset - PAGE_LIMIT));
      }
      return true;
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return false;
      }

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Data pendaftaran gagal dimuat.",
      );
      return false;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [filter, offset, query]);

  const closeDeleteConfirmation = (id: string) => {
    setConfirmingDeleteId(null);
    window.requestAnimationFrame(() => deleteTriggerRefs.current[id]?.focus());
  };

  const keepFocusInDeleteDialog = (
    event: KeyboardEvent<HTMLDivElement>,
    id: string,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDeleteConfirmation(id);
      return;
    }

    if (event.key !== "Tab") return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ),
    );
    if (controls.length < 2) return;

    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  useEffect(() => {
    const searchTimer = window.setTimeout(() => {
      setOffset(0);
      setQuery(searchInput.trim());
    }, 350);

    return () => window.clearTimeout(searchTimer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    const loadTimer = window.setTimeout(
      () => void loadEntries(controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(loadTimer);
      controller.abort();
    };
  }, [loadEntries]);

  const updateStatus = async (id: string, status: "published" | "archived") => {
    setUpdatingId(id);
    setUpdatingAction(status);
    setConfirmingDeleteId(null);
    setError("");
    setSuccess("");

    try {
      const response = await adminFetch("/api/directory", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const payload = (await response.json()) as {
        entry?: DirectoryEntry;
        error?: string;
      };

      if (!response.ok || !payload.entry) {
        throw new Error(payload.error || "Status gagal diperbarui.");
      }

      onChanged?.();
      const refreshed = await loadEntries();
      if (!refreshed) {
        setError(
          "Status berhasil diubah, tetapi daftar belum dapat dimuat ulang. Tekan Muat ulang.",
        );
        window.requestAnimationFrame(() => feedbackRef.current?.focus());
        return;
      }
      setSuccess(
        status === "published"
          ? "Pendaftaran berhasil ditayangkan di portal."
          : "Pendaftaran berhasil dipindahkan ke arsip.",
      );
      window.requestAnimationFrame(() => feedbackRef.current?.focus());
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Status gagal diperbarui.",
      );
      window.requestAnimationFrame(() => feedbackRef.current?.focus());
    } finally {
      setUpdatingId(null);
      setUpdatingAction(null);
    }
  };

  const saveServiceIcon = async (entry: DirectoryEntry) => {
    if (entry.kind !== "service") return;

    const storedIconKey = isServiceIconKey(entry.iconKey) ? entry.iconKey : "";
    const iconKey = iconDrafts[entry.id] ?? storedIconKey;
    if (iconKey === storedIconKey) return;

    setSavingIconId(entry.id);
    setConfirmingDeleteId(null);
    setError("");
    setSuccess("");

    try {
      const response = await adminFetch("/api/directory", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: entry.id, iconKey: iconKey || null }),
      });
      const payload = (await response.json()) as {
        entry?: DirectoryEntry;
        error?: string;
      };

      if (!response.ok || !payload.entry) {
        throw new Error(payload.error || "Ikon layanan gagal disimpan.");
      }

      const savedIconKey = isServiceIconKey(payload.entry.iconKey)
        ? payload.entry.iconKey
        : "";
      setIconDrafts((current) => ({
        ...current,
        [entry.id]: savedIconKey,
      }));
      onChanged?.();
      const refreshed = await loadEntries();
      if (!refreshed) {
        setError(
          "Ikon sudah disimpan, tetapi daftar belum dapat dimuat ulang. Tekan Muat ulang.",
        );
        window.requestAnimationFrame(() => feedbackRef.current?.focus());
        return;
      }
      setSuccess(`Ikon untuk “${entry.title}” berhasil disimpan.`);
      window.requestAnimationFrame(() => feedbackRef.current?.focus());
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Ikon layanan gagal disimpan.",
      );
      window.requestAnimationFrame(() => feedbackRef.current?.focus());
    } finally {
      setSavingIconId(null);
    }
  };

  const deleteEntry = async (entry: DirectoryEntry) => {
    setUpdatingId(entry.id);
    setUpdatingAction("delete");
    setError("");
    setSuccess("");

    try {
      const response = await adminFetch(
        `/api/directory?id=${encodeURIComponent(entry.id)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as {
        deleted?: { id: string };
        error?: string;
      };

      if (!response.ok || !payload.deleted) {
        throw new Error(payload.error || "Data gagal dihapus.");
      }

      setConfirmingDeleteId(null);
      onChanged?.();
      const refreshed = await loadEntries();
      if (!refreshed) {
        setError(
          "Data sudah dihapus, tetapi daftar belum dapat dimuat ulang. Tekan Muat ulang.",
        );
        window.requestAnimationFrame(() => feedbackRef.current?.focus());
        return;
      }
      setSuccess(
        `“${entry.title}” dan riwayat kliknya telah dihapus permanen.`,
      );
      window.requestAnimationFrame(() => feedbackRef.current?.focus());
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Data gagal dihapus.",
      );
      window.requestAnimationFrame(() => feedbackRef.current?.focus());
    } finally {
      setUpdatingId(null);
      setUpdatingAction(null);
    }
  };

  const firstVisible = pagination.total === 0 ? 0 : pagination.offset + 1;
  const lastVisible = Math.min(
    pagination.offset + entries.length,
    pagination.total,
  );

  return (
    <div className="moderation-panel">
      <div className="admin-form-grid">
        <label className="wide">
          <span>Cari pendaftaran</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setConfirmingDeleteId(null);
              setSuccess("");
            }}
            placeholder="Cari nama, produk, layanan, atau kategori…"
            aria-label="Cari data pendaftaran"
            aria-controls="registration-table"
            disabled={updatingId !== null || savingIconId !== null}
          />
        </label>
      </div>

      <div className="moderation-toolbar">
        <div
          className="moderation-filters"
          role="group"
          aria-label="Filter status"
        >
          {(["pending", "published", "archived", "all"] as const).map(
            (status) => (
              <button
                type="button"
                className={filter === status ? "active" : ""}
                aria-pressed={filter === status}
                aria-controls="registration-table"
                disabled={loading || updatingId !== null || savingIconId !== null}
                onClick={() => {
                  setSuccess("");
                  setConfirmingDeleteId(null);
                  setFilter(status);
                  setOffset(0);
                }}
                key={status}
              >
                {status === "all" ? "Semua" : statusLabels[status]}
                <span>{counts[status]}</span>
              </button>
            ),
          )}
        </div>
        <button
          type="button"
          className="refresh-directory"
          onClick={() => {
            setSuccess("");
            void loadEntries();
          }}
          disabled={loading || updatingId !== null || savingIconId !== null}
        >
          {loading ? "Memuat…" : "Muat ulang"}
        </button>
      </div>

      {error && (
        <p
          className="admin-alert error"
          role="alert"
          tabIndex={-1}
          ref={feedbackRef}
        >
          {error}
        </p>
      )}
      {success && (
        <p
          className="admin-alert success"
          role="status"
          tabIndex={-1}
          ref={feedbackRef}
        >
          {success}
        </p>
      )}
      {loading && (
        <p className="admin-empty" role="status">
          Memuat data pendaftaran…
        </p>
      )}
      {!loading && entries.length === 0 && (
        <p className="admin-empty" role="status">
          {query
            ? "Tidak ada data yang cocok dengan pencarian."
            : "Belum ada data pada status ini."}
        </p>
      )}

      <div
        id="registration-table"
        className={`registration-table-wrap${loading ? " is-busy" : ""}`}
        aria-busy={loading}
        inert={loading}
      >
        {entries.length > 0 && (
          <table className="registration-table">
            <caption className="sr-only">
              Daftar pendaftaran UMKM dan layanan warga
            </caption>
            <thead>
              <tr>
                <th scope="col">Pendaftaran</th>
                <th scope="col">Kontak &amp; detail</th>
                <th scope="col">Aktivitas</th>
                <th scope="col">Status</th>
                <th scope="col">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const storedIconKey = isServiceIconKey(entry.iconKey)
                  ? entry.iconKey
                  : "";
                const selectedIconKey =
                  iconDrafts[entry.id] ?? storedIconKey;
                const iconChanged = selectedIconKey !== storedIconKey;
                const iconPreviewService = {
                  type: entry.category,
                  name: entry.title,
                  detail: entry.description,
                  extra: `${entry.name} ${entry.meta}`,
                  iconKey: selectedIconKey || null,
                };

                return (
                  <tr key={entry.id}>
                  <td className="registration-identity-cell" data-label="Pendaftaran">
                    <div className="registration-identity">
                      {entry.imageUrl ? (
                        <a
                          className="registration-thumb-link"
                          href={entry.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Buka foto ${entry.title} dalam ukuran penuh`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className="registration-thumb"
                            src={entry.imageUrl}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        </a>
                      ) : (
                        <span
                          className={`registration-thumb-placeholder ${entry.kind}`}
                          aria-hidden="true"
                        >
                          {entry.kind === "umkm" ? "UM" : "JA"}
                        </span>
                      )}
                      <div>
                        <span className="moderation-kind">
                          {entry.kind === "umkm" ? "UMKM" : "Layanan"} ·{" "}
                          {entry.category}
                        </span>
                        <h3>{entry.title}</h3>
                        <p className="moderation-owner">{entry.name}</p>
                      </div>
                    </div>
                    <p className="registration-description">
                      {entry.description}
                    </p>
                    {entry.kind === "service" && (
                      <div
                        className="service-icon-editor"
                        role="group"
                        aria-labelledby={`service-icon-label-${entry.id}`}
                      >
                        <div className="service-icon-editor-heading">
                          <span
                            className="service-icon-editor-preview"
                            aria-hidden="true"
                          >
                            <ServiceCategoryIcon
                              service={iconPreviewService}
                            />
                          </span>
                          <div>
                            <label
                              id={`service-icon-label-${entry.id}`}
                              htmlFor={`service-icon-${entry.id}`}
                            >
                              Ikon layanan
                            </label>
                            <small id={`service-icon-help-${entry.id}`}>
                              {selectedIconKey
                                ? "Pilihan pengelola menggantikan ikon otomatis."
                                : "Otomatis dipilih dari kategori dan deskripsi."}
                            </small>
                          </div>
                        </div>
                        <div className="service-icon-editor-controls">
                          <select
                            id={`service-icon-${entry.id}`}
                            value={selectedIconKey}
                            aria-describedby={`service-icon-help-${entry.id}`}
                            disabled={
                              loading ||
                              updatingId !== null ||
                              savingIconId !== null
                            }
                            onChange={(event) => {
                              const nextIconKey = event.target.value;
                              if (
                                nextIconKey === "" ||
                                isServiceIconKey(nextIconKey)
                              ) {
                                setIconDrafts((current) => ({
                                  ...current,
                                  [entry.id]: nextIconKey,
                                }));
                                setSuccess("");
                              }
                            }}
                          >
                            <option value="">
                              Otomatis dari data layanan
                            </option>
                            {SERVICE_ICON_CATALOG.map((item) => (
                              <option value={item.key} key={item.key}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="save-service-icon"
                            disabled={
                              loading ||
                              updatingId !== null ||
                              savingIconId !== null ||
                              !iconChanged
                            }
                            onClick={() => void saveServiceIcon(entry)}
                          >
                            {savingIconId === entry.id
                              ? "Menyimpan…"
                              : "Simpan ikon"}
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                  <td data-label="Kontak & detail">
                    <dl className="registration-data-list">
                      <div>
                        <dt>{entry.kind === "umkm" ? "Harga" : "Jam layanan"}</dt>
                        <dd>{entry.meta}</dd>
                      </div>
                      <div>
                        <dt>WhatsApp</dt>
                        <dd>{entry.phone}</dd>
                      </div>
                      <div>
                        <dt>Lokasi</dt>
                        <dd>{entry.publicLocation || "Tidak dicantumkan"}</dd>
                      </div>
                    </dl>
                  </td>
                  <td data-label="Aktivitas">
                    <dl className="registration-data-list">
                      <div>
                        <dt>Didaftarkan</dt>
                        <dd>
                          {new Date(entry.createdAt).toLocaleDateString("id-ID", {
                            dateStyle: "medium",
                          })}
                        </dd>
                      </div>
                      <div>
                        <dt>Pembukaan WhatsApp (30 hari)</dt>
                        <dd>
                          {entry.whatsappUniqueVisitors30d} pengunjung ·{" "}
                          {entry.whatsappClicks30d} pembukaan
                        </dd>
                      </div>
                    </dl>
                  </td>
                  <td className="registration-status-cell" data-label="Status">
                    <div className="moderation-badges">
                      {entry.autoFeatured && (
                        <span className="status-badge featured">
                          Sering dibuka
                        </span>
                      )}
                      <span className={`status-badge ${entry.status}`}>
                        {statusLabels[entry.status]}
                      </span>
                    </div>
                  </td>
                  <td className="registration-actions-cell" data-label="Tindakan">
                    <div className="moderation-actions">
                      {entry.status !== "published" && (
                        <button
                          type="button"
                          className="approve"
                          disabled={loading || updatingId !== null || savingIconId !== null}
                          onClick={() => void updateStatus(entry.id, "published")}
                        >
                          {updatingId === entry.id && updatingAction === "published"
                            ? "Menayangkan…"
                            : entry.status === "archived"
                              ? "Tayangkan kembali"
                              : "Tayangkan"}
                        </button>
                      )}
                      {entry.status !== "archived" && (
                        <button
                          type="button"
                          className="archive"
                          disabled={loading || updatingId !== null || savingIconId !== null}
                          onClick={() => void updateStatus(entry.id, "archived")}
                        >
                          {updatingId === entry.id && updatingAction === "archived"
                            ? "Mengarsipkan…"
                            : "Arsipkan"}
                        </button>
                      )}
                      {entry.status === "archived" &&
                        confirmingDeleteId !== entry.id && (
                          <button
                            ref={(element) => {
                              deleteTriggerRefs.current[entry.id] = element;
                            }}
                            type="button"
                            className="delete"
                            disabled={loading || updatingId !== null || savingIconId !== null}
                            onClick={() => setConfirmingDeleteId(entry.id)}
                          >
                            Hapus permanen
                          </button>
                        )}
                    </div>
                    {entry.status === "archived" &&
                      confirmingDeleteId === entry.id && (
                        <div
                          className="registration-delete-backdrop"
                          role="presentation"
                          onMouseDown={(event) => {
                            if (event.target === event.currentTarget) {
                              closeDeleteConfirmation(entry.id);
                            }
                          }}
                        >
                          <div
                            className="registration-delete-confirm"
                            role="alertdialog"
                            aria-modal="true"
                            aria-labelledby={`delete-title-${entry.id}`}
                            aria-describedby={`delete-description-${entry.id}`}
                            onKeyDown={(event) =>
                              keepFocusInDeleteDialog(event, entry.id)
                            }
                          >
                            <strong id={`delete-title-${entry.id}`}>
                              Hapus data secara permanen?
                            </strong>
                            <p id={`delete-description-${entry.id}`}>
                              “{entry.title}” dan seluruh riwayat kliknya akan
                              dihapus. Tindakan ini tidak dapat dibatalkan.
                            </p>
                            <div>
                              <button
                                autoFocus
                                type="button"
                                className="cancel"
                                disabled={updatingId !== null || savingIconId !== null}
                                onClick={() =>
                                  closeDeleteConfirmation(entry.id)
                                }
                              >
                                Batal
                              </button>
                              <button
                                type="button"
                                className="delete confirm"
                                disabled={updatingId !== null || savingIconId !== null}
                                onClick={() => void deleteEntry(entry)}
                              >
                                {updatingId === entry.id &&
                                updatingAction === "delete"
                                  ? "Menghapus…"
                                  : "Ya, hapus"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                  </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && pagination.total > 0 && (
        <div className="moderation-toolbar">
          <p role="status" aria-live="polite">
            Menampilkan {firstVisible} sampai {lastVisible} dari{" "}
            {pagination.total} data
          </p>
          <nav
            className="moderation-filters"
            aria-label="Navigasi halaman pendaftaran"
          >
            <button
              type="button"
              disabled={
                loading ||
                pagination.offset === 0 ||
                updatingId !== null ||
                savingIconId !== null
              }
              onClick={() =>
                setOffset((current) => {
                  setConfirmingDeleteId(null);
                  return Math.max(0, current - PAGE_LIMIT);
                })
              }
            >
              Sebelumnya
            </button>
            <button
              type="button"
              disabled={
                loading ||
                !pagination.hasMore ||
                updatingId !== null ||
                savingIconId !== null
              }
              onClick={() => {
                setConfirmingDeleteId(null);
                setOffset((current) => current + PAGE_LIMIT);
              }}
            >
              Berikutnya
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
