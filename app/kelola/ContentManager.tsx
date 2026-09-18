"use client";

import {
  type ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { adminFetch } from "./admin-fetch";

type NewsStatus = "draft" | "published" | "archived";
type EffectiveNewsStatus = NewsStatus | "scheduled" | "expired";

type NewsEntry = {
  id: string;
  tag: string;
  title: string;
  summary: string;
  body: string;
  publishedDate: string;
  expiresAt: string | null;
  status: NewsStatus;
  authorEmail: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

type VillageProfile = {
  id: string;
  headName: string;
  headTitle: string;
  greetingLead: string;
  welcomeParagraph: string;
  closingParagraph: string;
  profileImageKey: string | null;
  profileImageMime: string | null;
  profileImageBytes: number | null;
  profileImageWidth: number | null;
  profileImageHeight: number | null;
  officePhone: string;
  officeEmail: string;
  serviceHoursMonThu: string;
  serviceHoursFriday: string;
  populationCount: number;
  householdCount: number;
  rwCount: number;
  updatedAt: string;
  updatedBy: string;
};

type ContentResponse = {
  news?: NewsEntry[];
  profile?: VillageProfile | null;
  registeredUmkmCount?: number;
  entry?: NewsEntry;
  error?: string;
};

type NewsForm = {
  tag: string;
  title: string;
  summary: string;
  body: string;
  publishedDate: string;
  expiresAt: string;
  status: NewsStatus;
};

type ProfileForm = {
  headName: string;
  headTitle: string;
  greetingLead: string;
  welcomeParagraph: string;
  closingParagraph: string;
  officePhone: string;
  officeEmail: string;
  serviceHoursMonThu: string;
  serviceHoursFriday: string;
  populationCount: string;
  householdCount: string;
  rwCount: string;
};

type ProfileImageState = {
  key: string | null;
  mime: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
};

const MAX_PROFILE_IMAGE_BYTES = Math.floor(1.5 * 1024 * 1024);
const PROFILE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const newsStatusLabels: Record<EffectiveNewsStatus, string> = {
  draft: "Draf",
  published: "Tayang",
  archived: "Diarsipkan",
  scheduled: "Dijadwalkan",
  expired: "Berakhir",
};

const emptyProfile: ProfileForm = {
  headName: "",
  headTitle: "",
  greetingLead: "",
  welcomeParagraph: "",
  closingParagraph: "",
  officePhone: "+62 858-4685-8441",
  officeEmail: "desacipeundeuy113@gmail.com",
  serviceHoursMonThu: "08.00 - 16.00 WIB",
  serviceHoursFriday: "08.00 - 16.30 WIB",
  populationCount: "",
  householdCount: "",
  rwCount: "",
};

const emptyProfileImage: ProfileImageState = {
  key: null,
  mime: null,
  bytes: null,
  width: null,
  height: null,
};

function jakartaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${readPart("year")}-${readPart("month")}-${readPart("day")}`;
}

function newNewsForm(): NewsForm {
  return {
    tag: "Kabar Desa",
    title: "",
    summary: "",
    body: "",
    publishedDate: jakartaDateKey(),
    expiresAt: "",
    status: "draft",
  };
}

function newsEntryToForm(entry: NewsEntry): NewsForm {
  return {
    tag: entry.tag,
    title: entry.title,
    summary: entry.summary,
    body: entry.body,
    publishedDate: entry.publishedDate,
    expiresAt: entry.expiresAt || "",
    status: entry.status,
  };
}

function profileToForm(profile: VillageProfile | null | undefined): ProfileForm {
  if (!profile) return emptyProfile;

  return {
    headName: profile.headName,
    headTitle: profile.headTitle,
    greetingLead: profile.greetingLead,
    welcomeParagraph: profile.welcomeParagraph,
    closingParagraph: profile.closingParagraph,
    officePhone: profile.officePhone,
    officeEmail: profile.officeEmail,
    serviceHoursMonThu: profile.serviceHoursMonThu,
    serviceHoursFriday: profile.serviceHoursFriday,
    populationCount: String(profile.populationCount),
    householdCount: String(profile.householdCount),
    rwCount: String(profile.rwCount),
  };
}

function profileToImage(profile: VillageProfile | null | undefined): ProfileImageState {
  if (!profile) return emptyProfileImage;

  return {
    key: profile.profileImageKey,
    mime: profile.profileImageMime,
    bytes: profile.profileImageBytes,
    width: profile.profileImageWidth,
    height: profile.profileImageHeight,
  };
}

function profileImageUrl(key: string | null) {
  return key
    ? `/api/media/${encodeURIComponent(key)}`
    : "/images/kepala-desa-cipeundeuy.jpg";
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function readJson(response: Response): Promise<ContentResponse> {
  try {
    return (await response.json()) as ContentResponse;
  } catch {
    return {};
  }
}

async function requestContent(signal?: AbortSignal) {
  const response = await adminFetch("/api/admin/content", {
    cache: "no-store",
    signal,
  });
  const payload = await readJson(response);

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Sesi pengelola telah berakhir. Muat ulang halaman untuk masuk kembali.",
      );
    }
    throw new Error(payload.error || "Kabar dan profil desa belum dapat dimuat.");
  }

  return payload;
}

export default function ContentManager({
  mode,
  refreshKey = 0,
}: {
  mode: "news" | "profile";
  refreshKey?: number;
}) {
  const [news, setNews] = useState<NewsEntry[]>([]);
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile);
  const [profileImage, setProfileImage] =
    useState<ProfileImageState>(emptyProfileImage);
  const [selectedProfileImage, setSelectedProfileImage] = useState<File | null>(
    null,
  );
  const [profileImagePreviewUrl, setProfileImagePreviewUrl] = useState<
    string | null
  >(null);
  const [registeredUmkmCount, setRegisteredUmkmCount] = useState(0);
  const [newsForm, setNewsForm] = useState<NewsForm>(newNewsForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileImageUploading, setProfileImageUploading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<
    "published" | "archived" | null
  >(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const newsTitleRef = useRef<HTMLInputElement>(null);
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const profileImageObjectUrlRef = useRef<string | null>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const hasLoadedRef = useRef(false);
  const previousRefreshKeyRef = useRef(refreshKey);

  const focusFeedback = () => {
    window.requestAnimationFrame(() => feedbackRef.current?.focus());
  };

  const loadContent = useCallback(async (signal?: AbortSignal) => {
    try {
      const payload = await requestContent(signal);

      setNews(payload.news || []);
      setProfile(profileToForm(payload.profile));
      setProfileImage(profileToImage(payload.profile));
      setRegisteredUmkmCount(payload.registeredUmkmCount ?? 0);
      hasLoadedRef.current = true;
      setHasLoaded(true);
      setError("");
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return;
      }
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Kabar dan profil desa belum dapat dimuat.",
      );
    } finally {
      if (!signal?.aborted) setRefreshing(false);
    }
  }, []);

  const clearSelectedProfileImage = useCallback(() => {
    if (profileImageObjectUrlRef.current) {
      URL.revokeObjectURL(profileImageObjectUrlRef.current);
      profileImageObjectUrlRef.current = null;
    }
    setSelectedProfileImage(null);
    setProfileImagePreviewUrl(null);
    if (profileImageInputRef.current) profileImageInputRef.current.value = "";
  }, []);

  useEffect(
    () => () => {
      if (profileImageObjectUrlRef.current) {
        URL.revokeObjectURL(profileImageObjectUrlRef.current);
      }
    },
    [],
  );

  const refreshRegisteredUmkmCount = useCallback(async (signal?: AbortSignal) => {
    try {
      const payload = await requestContent(signal);
      setRegisteredUmkmCount(payload.registeredUmkmCount ?? 0);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return;
      }
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Jumlah UMKM belum dapat diperbarui.",
      );
    } finally {
      if (!signal?.aborted) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadTimer = window.setTimeout(() => {
      const isCountOnlyRefresh =
        mode === "profile" &&
        hasLoadedRef.current &&
        previousRefreshKeyRef.current !== refreshKey;
      previousRefreshKeyRef.current = refreshKey;

      if (isCountOnlyRefresh) {
        setRefreshing(true);
        void refreshRegisteredUmkmCount(controller.signal);
        return;
      }

      if (hasLoadedRef.current) setRefreshing(true);
      void loadContent(controller.signal).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
      controller.abort();
    };
  }, [loadContent, mode, refreshKey, refreshRegisteredUmkmCount]);

  const orderedNews = useMemo(
    () =>
      [...news].sort((first, second) => {
        const byDate = second.publishedDate.localeCompare(first.publishedDate);
        return byDate || second.updatedAt.localeCompare(first.updatedAt);
      }),
    [news],
  );

  const resetNewsForm = () => {
    setNewsForm(newNewsForm());
    setEditingId(null);
    setError("");
  };

  const submitNews = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await adminFetch("/api/admin/content", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          editingId
            ? { resource: "news", id: editingId, ...newsForm }
            : newsForm,
        ),
      });
      const payload = await readJson(response);

      if (!response.ok || !payload.entry) {
        throw new Error(payload.error || "Kabar Desa gagal disimpan.");
      }

      if (editingId) {
        setNews((current) =>
          current.map((entry) =>
            entry.id === editingId ? payload.entry! : entry,
          ),
        );
        setSuccess("Perubahan Kabar Desa berhasil disimpan.");
      } else {
        setNews((current) => [payload.entry!, ...current]);
        setSuccess(
          payload.entry.status === "published"
            ? "Kabar desa berhasil disimpan."
            : "Kabar Desa berhasil disimpan sebagai draf.",
        );
      }

      setNewsForm(newNewsForm());
      setEditingId(null);
      focusFeedback();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Kabar Desa gagal disimpan.",
      );
      focusFeedback();
    } finally {
      setSaving(false);
    }
  };

  const editNews = (entry: NewsEntry) => {
    setEditingId(entry.id);
    setNewsForm(newsEntryToForm(entry));
    setError("");
    setSuccess("");
    document
      .getElementById("news-editor")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() =>
      newsTitleRef.current?.focus({ preventScroll: true }),
    );
  };

  const updateNewsStatus = async (
    entry: NewsEntry,
    status: "published" | "archived",
  ) => {
    setUpdatingId(entry.id);
    setUpdatingStatus(status);
    setError("");
    setSuccess("");

    try {
      const today = jakartaDateKey();
      const expiresAt =
        status === "published" && entry.expiresAt && entry.expiresAt < today
          ? ""
          : entry.expiresAt || "";
      const response = await adminFetch("/api/admin/content", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resource: "news",
          id: entry.id,
          tag: entry.tag,
          title: entry.title,
          summary: entry.summary,
          body: entry.body,
          publishedDate: entry.publishedDate,
          expiresAt,
          status,
        }),
      });
      const payload = await readJson(response);

      if (!response.ok || !payload.entry) {
        throw new Error(payload.error || "Status Kabar Desa gagal diperbarui.");
      }

      setNews((current) =>
        current.map((item) =>
          item.id === entry.id ? payload.entry! : item,
        ),
      );
      if (editingId === entry.id) resetNewsForm();
      setSuccess(
        status === "published"
          ? entry.publishedDate > today
            ? `Kabar Desa dijadwalkan tayang pada ${formatDate(entry.publishedDate)}.`
            : "Kabar Desa berhasil ditayangkan."
          : "Kabar Desa dipindahkan ke arsip dan tidak lagi tampil di portal.",
      );
      focusFeedback();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Status Kabar Desa gagal diperbarui.",
      );
      focusFeedback();
    } finally {
      setUpdatingId(null);
      setUpdatingStatus(null);
    }
  };

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const officePhoneDigits = profile.officePhone.replace(/\D/g, "");
    if (officePhoneDigits.length < 8 || officePhoneDigits.length > 15) {
      setError("Nomor WhatsApp kantor belum valid.");
      focusFeedback();
      return;
    }

    if (
      !profile.officeEmail.trim() ||
      !profile.serviceHoursMonThu.trim() ||
      !profile.serviceHoursFriday.trim()
    ) {
      setError("Lengkapi email dan jadwal pelayanan kantor desa.");
      focusFeedback();
      return;
    }

    const populationCount = Number(profile.populationCount);
    const householdCount = Number(profile.householdCount);
    const rwCount = Number(profile.rwCount);
    const statistics = [populationCount, householdCount, rwCount];

    if (
      statistics.some(
        (value) =>
          !Number.isFinite(value) || !Number.isInteger(value) || value < 0,
      )
    ) {
      setError("Statistik desa harus berupa bilangan bulat nol atau lebih.");
      focusFeedback();
      return;
    }

    if (householdCount > populationCount) {
      setError(
        "Jumlah Kepala Keluarga tidak boleh melebihi jumlah Penduduk.",
      );
      focusFeedback();
      return;
    }

    setSaving(true);

    try {
      const response = await adminFetch("/api/admin/content", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resource: "profile",
          ...profile,
          populationCount,
          householdCount,
          rwCount,
        }),
      });
      const payload = await readJson(response);

      if (!response.ok || !payload.profile) {
        throw new Error(payload.error || "Profil Desa gagal disimpan.");
      }

      setProfile(profileToForm(payload.profile));
      setProfileImage(profileToImage(payload.profile));
      setSuccess(
        "Profil Desa berhasil diperbarui dan akan tampil pada portal publik.",
      );
      focusFeedback();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Profil Desa gagal disimpan.",
      );
      focusFeedback();
    } finally {
      setSaving(false);
    }
  };

  const handleProfileImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const image = event.target.files?.[0] || null;
    clearSelectedProfileImage();
    setError("");
    setSuccess("");

    if (!image) return;
    if (!PROFILE_IMAGE_TYPES.has(image.type)) {
      setError("Format foto harus JPG, PNG, atau WebP.");
      focusFeedback();
      return;
    }
    if (image.size > MAX_PROFILE_IMAGE_BYTES) {
      setError("Ukuran foto maksimal 1,5 MB.");
      focusFeedback();
      return;
    }

    const previewUrl = URL.createObjectURL(image);
    profileImageObjectUrlRef.current = previewUrl;
    setSelectedProfileImage(image);
    setProfileImagePreviewUrl(previewUrl);
  };

  const uploadProfileImage = async () => {
    if (!selectedProfileImage) {
      setError("Pilih foto dari perangkat terlebih dahulu.");
      focusFeedback();
      return;
    }

    setProfileImageUploading(true);
    setError("");
    setSuccess("");

    try {
      const formData = new FormData();
      formData.set("image", selectedProfileImage, selectedProfileImage.name);
      const response = await adminFetch("/api/admin/content/profile-image", {
        method: "POST",
        body: formData,
      });
      const payload = await readJson(response);

      if (!response.ok || !payload.profile) {
        throw new Error(payload.error || "Foto Profil Desa gagal diunggah.");
      }

      setProfile(profileToForm(payload.profile));
      setProfileImage(profileToImage(payload.profile));
      clearSelectedProfileImage();
      setSuccess("Foto pada bagian Mengenal Desa berhasil diperbarui.");
      focusFeedback();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Foto Profil Desa gagal diunggah.",
      );
      focusFeedback();
    } finally {
      setProfileImageUploading(false);
    }
  };

  if (loading) {
    return (
      <p className="admin-empty" role="status">
        Memuat {mode === "news" ? "Kabar Desa" : "Profil Desa"}…
      </p>
    );
  }

  if (!hasLoaded) {
    return (
      <div className="admin-load-failure" role="alert">
        <strong>Data pengelolaan belum dapat dimuat.</strong>
        <p>{error || "Periksa koneksi, lalu coba muat kembali."}</p>
        <button
          type="button"
          className="admin-secondary"
          onClick={() => {
            setLoading(true);
            setError("");
            void loadContent().finally(() => setLoading(false));
          }}
        >
          Coba lagi
        </button>
      </div>
    );
  }

  if (mode === "profile") {
    return (
      <div className="content-manager profile-manager">
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

        <form
          className="admin-content-form"
          onSubmit={submitProfile}
          aria-busy={saving || profileImageUploading}
        >
          <div className="admin-form-intro">
            <div>
              <span className="eyebrow">SAMBUTAN KEPALA DESA</span>
              <h3>Identitas dan sambutan</h3>
            </div>
            <p>
              Jika kepala desa berganti, ubah nama, jabatan, dan sambutannya di
              sini.
            </p>
          </div>

          <fieldset className="admin-profile-image-section">
            <legend className="sr-only">Foto Mengenal Desa</legend>
            <div className="admin-profile-image-heading">
              <div>
                <span className="admin-statistics-context">Tampilan publik</span>
                <h3>Foto Mengenal Desa</h3>
              </div>
              <p>
                Unggah foto dari perangkat untuk mengganti gambar pada bagian
                Mengenal Desa di halaman utama.
              </p>
            </div>

            <div className="admin-profile-image-layout">
              <div className="admin-profile-image-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={profileImagePreviewUrl || profileImageUrl(profileImage.key)}
                  alt="Pratinjau foto Mengenal Desa"
                />
                <div>
                  <strong>
                    {selectedProfileImage
                      ? selectedProfileImage.name
                      : profileImage.key
                        ? "Foto yang tampil di portal"
                        : "Foto bawaan portal"}
                  </strong>
                  <span>
                    {selectedProfileImage
                      ? "Pratinjau lokal. Tekan Unggah foto untuk menerapkan."
                      : profileImage.key
                        ? [
                            profileImage.width && profileImage.height
                              ? `${profileImage.width} × ${profileImage.height}px`
                              : "Foto tersimpan",
                            formatFileSize(profileImage.bytes),
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "Belum ada foto khusus yang diunggah."}
                  </span>
                </div>
              </div>

              <div className="admin-profile-image-field">
                <label htmlFor="profile-image-upload">
                  <span>Pilih foto dari perangkat</span>
                  <small>JPG, PNG, atau WebP. Ukuran maksimal 1,5 MB.</small>
                </label>
                <input
                  ref={profileImageInputRef}
                  id="profile-image-upload"
                  name="profileImage"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={handleProfileImageChange}
                  disabled={saving || profileImageUploading}
                />
                <p className="admin-profile-image-note">
                  Foto disimpan di penyimpanan privat portal, bukan melalui
                  tautan gambar eksternal.
                </p>
                <div className="admin-profile-image-actions">
                  <button
                    type="button"
                    className="admin-secondary"
                    onClick={() => void uploadProfileImage()}
                    disabled={!selectedProfileImage || saving || profileImageUploading}
                  >
                    {profileImageUploading ? "Mengunggah…" : "Unggah foto"}
                  </button>
                  {selectedProfileImage && (
                    <button
                      type="button"
                      className="admin-text-button"
                      onClick={clearSelectedProfileImage}
                      disabled={profileImageUploading}
                    >
                      Batal pilih foto
                    </button>
                  )}
                </div>
              </div>
            </div>
          </fieldset>

          <div className="admin-form-grid two-columns">
            <label>
              Nama kepala desa
              <input
                type="text"
                value={profile.headName}
                maxLength={100}
                required
                autoComplete="name"
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    headName: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Jabatan
              <input
                type="text"
                value={profile.headTitle}
                maxLength={100}
                required
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    headTitle: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <label>
            Kalimat pembuka
            <textarea
              value={profile.greetingLead}
              maxLength={220}
              rows={3}
              required
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  greetingLead: event.target.value,
                }))
              }
            />
          </label>

          <label>
            Paragraf sambutan
            <textarea
              value={profile.welcomeParagraph}
              maxLength={1000}
              minLength={20}
              rows={6}
              required
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  welcomeParagraph: event.target.value,
                }))
              }
            />
          </label>

          <label>
            Paragraf penutup
            <textarea
              value={profile.closingParagraph}
              maxLength={1000}
              minLength={20}
              rows={5}
              required
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  closingParagraph: event.target.value,
                }))
              }
            />
          </label>

          <fieldset className="admin-statistics-section">
            <legend className="sr-only">Kontak dan jadwal pelayanan</legend>
            <div className="admin-statistics-heading">
              <div className="admin-statistics-title">
                <span className="admin-statistics-context">
                  Informasi kantor desa
                </span>
                <h3>Kontak & Jadwal Pelayanan</h3>
                <p>
                  Informasi ini ditampilkan pada bagian kontak dan footer portal.
                </p>
              </div>
            </div>

            <div className="admin-form-grid two-columns">
              <label>
                Nomor WhatsApp kantor
                <input
                  type="tel"
                  value={profile.officePhone}
                  maxLength={40}
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      officePhone: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Email kantor
                <input
                  type="email"
                  value={profile.officeEmail}
                  maxLength={160}
                  required
                  inputMode="email"
                  autoComplete="email"
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      officeEmail: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Jam pelayanan Senin - Kamis
                <input
                  type="text"
                  value={profile.serviceHoursMonThu}
                  maxLength={80}
                  required
                  placeholder="08.00 - 16.00 WIB"
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      serviceHoursMonThu: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Jam pelayanan Jumat
                <input
                  type="text"
                  value={profile.serviceHoursFriday}
                  maxLength={80}
                  required
                  placeholder="08.00 - 16.30 WIB"
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      serviceHoursFriday: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="admin-statistics-section">
            <legend className="sr-only">Statistik Desa</legend>
            <div className="admin-statistics-heading">
              <div className="admin-statistics-title">
                <span className="admin-statistics-context">
                  Data ringkas beranda
                </span>
                <h3>Statistik Desa</h3>
                <p>
                  Isi berdasarkan data desa terbaru. Jumlah UMKM terisi
                  otomatis dari data yang sudah ditayangkan.
                </p>
              </div>
            </div>

            <div className="admin-form-grid two-columns admin-statistics-grid">
              <label className="admin-statistic-field">
                <span className="admin-statistic-label">Penduduk</span>
                <input
                  type="number"
                  value={profile.populationCount}
                  min={0}
                  step={1}
                  required
                  inputMode="numeric"
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      populationCount: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="admin-statistic-field">
                <span className="admin-statistic-label">Kepala Keluarga</span>
                <input
                  type="number"
                  value={profile.householdCount}
                  min={0}
                  max={profile.populationCount || undefined}
                  step={1}
                  required
                  inputMode="numeric"
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      householdCount: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="admin-statistic-field">
                <span className="admin-statistic-label">Rukun Warga</span>
                <input
                  type="number"
                  value={profile.rwCount}
                  min={0}
                  step={1}
                  required
                  inputMode="numeric"
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      rwCount: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="admin-statistic-field admin-readonly-field">
                <span className="admin-statistic-label">
                  <span>UMKM Terdaftar</span>
                  <span className="admin-auto-badge">Otomatis</span>
                </span>
                <input
                  type="number"
                  value={registeredUmkmCount}
                  readOnly
                  aria-describedby="registered-umkm-help"
                />
              </label>
            </div>
            <p className="admin-statistics-note" id="registered-umkm-help">
              Jumlah ini dihitung dari UMKM yang berstatus Tayang.
            </p>
          </fieldset>

          <div className="admin-form-actions">
            <button type="submit" className="admin-primary" disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan Profil & Statistik"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="content-manager news-manager">
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

      <form
        className="admin-content-form"
        id="news-editor"
        onSubmit={submitNews}
        aria-busy={saving}
      >
        <div className="admin-form-intro">
          <div>
            <span className="eyebrow">
              {editingId ? "EDIT KABAR" : "KABAR BARU"}
            </span>
            <h3>{editingId ? "Perbarui informasi" : "Tambahkan informasi"}</h3>
          </div>
          <p>
            Kabar akan tampil sesuai tanggal terbit. Kosongkan tanggal berakhir
            bila kabar tetap ingin ditampilkan.
          </p>
        </div>

        <div className="admin-form-grid two-columns">
          <label>
            Kategori
            <select
              value={newsForm.tag}
              onChange={(event) =>
                setNewsForm((current) => ({
                  ...current,
                  tag: event.target.value,
                }))
              }
            >
              <option value="Kabar Desa">Kabar Desa</option>
              <option value="Pengumuman">Pengumuman</option>
              <option value="Agenda">Agenda</option>
              <option value="Pelayanan">Pelayanan</option>
              <option value="UMKM">UMKM</option>
            </select>
          </label>

          <label>
            Status
            <select
              value={newsForm.status}
              onChange={(event) =>
                setNewsForm((current) => ({
                  ...current,
                  status: event.target.value as NewsForm["status"],
                }))
              }
            >
              <option value="draft">Simpan sebagai draf</option>
              <option value="published">Tayangkan / jadwalkan</option>
              {editingId && newsForm.status === "archived" && (
                <option value="archived">Tetap diarsipkan</option>
              )}
            </select>
          </label>
        </div>

        <label>
          Judul
          <input
            ref={newsTitleRef}
            type="text"
            value={newsForm.title}
            maxLength={140}
            required
            onChange={(event) =>
              setNewsForm((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
          />
        </label>

        <label>
          Ringkasan
          <textarea
            value={newsForm.summary}
            maxLength={240}
            rows={3}
            required
            aria-describedby="news-summary-help"
            onChange={(event) =>
              setNewsForm((current) => ({
                ...current,
                summary: event.target.value,
              }))
            }
          />
          <small id="news-summary-help">
            Ringkasan singkat berita atau informasi terbaru dari Desa Cipeundeuy.
          </small>
        </label>

        <label>
          Isi informasi
          <textarea
            value={newsForm.body}
            maxLength={1200}
            minLength={20}
            rows={7}
            required
            onChange={(event) =>
              setNewsForm((current) => ({
                ...current,
                body: event.target.value,
              }))
            }
          />
        </label>

        <div className="admin-form-grid two-columns">
          <label>
            Tanggal terbit
            <input
              type="date"
              value={newsForm.publishedDate}
              required
              onChange={(event) =>
                setNewsForm((current) => ({
                  ...current,
                  publishedDate: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Tanggal berakhir (opsional)
            <input
              type="date"
              value={newsForm.expiresAt}
              min={newsForm.publishedDate}
              onChange={(event) =>
                setNewsForm((current) => ({
                  ...current,
                  expiresAt: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <div className="admin-form-actions">
          <button type="submit" className="admin-primary" disabled={saving}>
            {saving
              ? "Menyimpan…"
              : editingId
                ? "Simpan Perubahan"
                : "Simpan Kabar Desa"}
          </button>
          {editingId && (
            <button
              type="button"
              className="admin-secondary"
              onClick={resetNewsForm}
              disabled={saving}
            >
              Batal mengedit
            </button>
          )}
        </div>
      </form>

      <section className="admin-news-library" aria-labelledby="news-library-title">
        <div className="admin-library-heading">
          <div>
            <span className="eyebrow">SEMUA INFORMASI</span>
            <h3 id="news-library-title">Kabar tersimpan</h3>
          </div>
          <button
            type="button"
            className="refresh-directory"
            onClick={() => {
              setRefreshing(true);
              setError("");
              setSuccess("");
              void loadContent();
            }}
            disabled={refreshing || updatingId !== null}
          >
            {refreshing ? "Memuat ulang…" : "Muat ulang"}
          </button>
        </div>

        {orderedNews.length === 0 ? (
          <p className="admin-empty">
            Belum ada Kabar Desa. Gunakan formulir di atas untuk menambahkannya.
          </p>
        ) : (
          <div
            className={`admin-news-list${refreshing ? " is-busy" : ""}`}
            aria-busy={refreshing}
            inert={refreshing}
          >
            {orderedNews.map((entry) => {
              const today = jakartaDateKey();
              const effectiveStatus: EffectiveNewsStatus =
                entry.status === "published"
                  ? entry.publishedDate > today
                    ? "scheduled"
                    : entry.expiresAt && entry.expiresAt < today
                      ? "expired"
                      : "published"
                  : entry.status;

              return (
                <article className="admin-news-card" key={entry.id}>
                  <div className="admin-news-card-head">
                    <div>
                      <span className="moderation-kind">
                        {entry.tag} · {formatDate(entry.publishedDate)}
                      </span>
                      <h4>{entry.title}</h4>
                    </div>
                    <span className={`status-badge ${effectiveStatus}`}>
                      {newsStatusLabels[effectiveStatus]}
                    </span>
                  </div>
                  <p>{entry.summary}</p>
                  {entry.expiresAt && (
                    <p className="admin-news-expiry">
                      Berakhir {formatDate(entry.expiresAt)}
                    </p>
                  )}
                  <div className="moderation-actions">
                    <button
                      type="button"
                      className="admin-secondary"
                      onClick={() => editNews(entry)}
                      disabled={refreshing || updatingId !== null}
                    >
                      Edit
                    </button>
                    {entry.status !== "published" && (
                      <button
                        type="button"
                        className="approve"
                        onClick={() =>
                          void updateNewsStatus(entry, "published")
                        }
                        disabled={refreshing || updatingId !== null}
                      >
                        {updatingId === entry.id &&
                        updatingStatus === "published"
                          ? "Menayangkan…"
                          : entry.status === "archived"
                            ? "Pulihkan & tayangkan"
                            : "Tayangkan"}
                      </button>
                    )}
                    {entry.status !== "archived" && (
                      <button
                        type="button"
                        className="archive"
                        onClick={() => void updateNewsStatus(entry, "archived")}
                        disabled={refreshing || updatingId !== null}
                      >
                        {updatingId === entry.id &&
                        updatingStatus === "archived"
                          ? "Mengarsipkan…"
                          : "Arsipkan"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
