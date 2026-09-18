"use client";

import { type KeyboardEvent, useState } from "react";
import ContentManager from "./ContentManager";
import ModerationPanel from "./ModerationPanel";

type AdminTab = "directory" | "news" | "profile";

const tabs: Array<{
  id: AdminTab;
  code: string;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: "directory",
    code: "01",
    label: "Pendaftaran",
    shortLabel: "Daftar",
    description: "Periksa UMKM dan layanan lokal yang didaftarkan warga.",
  },
  {
    id: "news",
    code: "02",
    label: "Kabar Desa",
    shortLabel: "Kabar",
    description: "Buat, perbarui, tayangkan, atau arsipkan informasi desa.",
  },
  {
    id: "profile",
    code: "03",
    label: "Profil & Statistik",
    shortLabel: "Profil",
    description:
      "Ubah nama kepala desa, sambutan, dan statistik pada beranda.",
  },
];

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>("directory");
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const [mountedTabs, setMountedTabs] = useState<Set<AdminTab>>(
    () => new Set(["directory"]),
  );

  const activateTab = (tabId: AdminTab) => {
    setActiveTab(tabId);
    setMountedTabs((current) => {
      if (current.has(tabId)) return current;
      return new Set([...current, tabId]);
    });
  };

  const moveTabFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    activateTab(nextTab.id);
    window.requestAnimationFrame(() => {
      document.getElementById(`admin-tab-${nextTab.id}`)?.focus();
    });
  };

  return (
    <div className="admin-dashboard">
      <aside className="admin-sidebar" aria-label="Navigasi pusat kelola portal">
        <div className="admin-sidebar-heading">
          <span>Menu kelola</span>
          <small>{tabs.length} bagian</small>
        </div>

        <div className="admin-tabs" role="tablist" aria-label="Menu pengelolaan portal">
          {tabs.map((tab, index) => (
            <button
              type="button"
              role="tab"
              id={`admin-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`admin-panel-${tab.id}`}
              aria-label={tab.label}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => activateTab(tab.id)}
              onKeyDown={(event) => moveTabFocus(event, index)}
              key={tab.id}
            >
              <span className="admin-tab-code">{tab.code}</span>
              <span className="admin-tab-copy">
                <strong>
                  <span className="admin-tab-label-full">{tab.label}</span>
                  <span className="admin-tab-label-short" aria-hidden="true">
                    {tab.shortLabel}
                  </span>
                </strong>
                <small>{tab.description}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="admin-sidebar-foot">
          <p>
            Gunakan arsip untuk menyembunyikan data yang tidak ingin
            ditampilkan. Riwayatnya tetap tersimpan.
          </p>
        </div>
      </aside>

      {tabs.map((tab) => (
        <section
          className="admin-tab-panel"
          role="tabpanel"
          tabIndex={0}
          id={`admin-panel-${tab.id}`}
          aria-labelledby={`admin-tab-${tab.id}`}
          hidden={activeTab !== tab.id}
          key={tab.id}
        >
          <header className="admin-panel-heading">
            <h2>
              {tab.id === "directory"
                ? "Pendaftaran UMKM & Layanan"
                : tab.label}
            </h2>
            <p>{tab.description}</p>
          </header>

          {mountedTabs.has(tab.id) && tab.id === "directory" && (
            <ModerationPanel
              onChanged={() =>
                setDirectoryRevision((current) => current + 1)
              }
            />
          )}
          {mountedTabs.has(tab.id) && tab.id === "news" && (
            <ContentManager mode="news" />
          )}
          {mountedTabs.has(tab.id) && tab.id === "profile" && (
            <ContentManager
              mode="profile"
              refreshKey={directoryRevision}
            />
          )}
        </section>
      ))}
    </div>
  );
}
