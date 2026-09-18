import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestampColumn = (name: string) =>
  timestamp(name, {
    withTimezone: true,
    mode: "date",
    precision: 3,
  });

export const directoryKind = pgEnum("directory_kind", ["umkm", "service"]);
export const directoryStatus = pgEnum("directory_status", [
  "pending",
  "published",
  "archived",
]);
export const newsStatus = pgEnum("news_status", [
  "draft",
  "published",
  "archived",
]);
export const adminRole = pgEnum("admin_role", ["owner", "editor"]);

export const directoryEntries = pgTable(
  "directory_entries",
  {
    id: text("id").primaryKey(),
    kind: directoryKind("kind").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    meta: text("meta").notNull(),
    phone: text("phone").notNull(),
    publicLocation: text("public_location"),
    imageUrl: text("image_url"),
    imageKey: text("image_key"),
    imageMime: text("image_mime"),
    imageBytes: integer("image_bytes"),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),
    iconKey: text("icon_key"),
    status: directoryStatus("status").notNull().default("pending"),
    featured: boolean("featured").notNull().default(false),
    source: text("source").notNull().default("portal-form"),
    reviewedBy: text("reviewed_by"),
    createdAt: timestampColumn("created_at").notNull(),
    updatedAt: timestampColumn("updated_at").notNull(),
    publishedAt: timestampColumn("published_at"),
  },
  (table) => [
    index("directory_status_kind_idx").on(table.status, table.kind),
    index("directory_public_page_idx").on(
      table.status,
      table.kind,
      table.publishedAt,
      table.id,
    ),
    index("directory_category_page_idx").on(
      table.status,
      table.kind,
      table.category,
      table.publishedAt,
      table.id,
    ),
    index("directory_moderation_page_idx").on(
      table.status,
      table.createdAt,
      table.id,
    ),
    index("directory_updated_at_idx").on(table.updatedAt),
    index("directory_phone_idx").on(table.phone),
    uniqueIndex("directory_image_key_idx").on(table.imageKey),
  ],
);

export const directoryClickEvents = pgTable(
  "directory_click_events",
  {
    id: text("id").primaryKey(),
    directoryEntryId: text("directory_entry_id")
      .notNull()
      .references(() => directoryEntries.id, { onDelete: "cascade" }),
    dayBucket: date("day_bucket", { mode: "string" }).notNull(),
    visitorHash: text("visitor_hash").notNull(),
    networkHash: text("network_hash").notNull(),
    clickedAt: timestampColumn("clicked_at").notNull(),
  },
  (table) => [
    uniqueIndex("directory_click_unique_day_idx").on(
      table.directoryEntryId,
      table.dayBucket,
      table.visitorHash,
    ),
    index("directory_click_date_entry_idx").on(
      table.dayBucket,
      table.directoryEntryId,
    ),
    index("directory_click_network_date_idx").on(
      table.networkHash,
      table.dayBucket,
    ),
  ],
);

export const newsEntries = pgTable(
  "news_entries",
  {
    id: text("id").primaryKey(),
    tag: text("tag").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    body: text("body").notNull(),
    publishedDate: date("published_date", { mode: "string" }).notNull(),
    expiresAt: date("expires_at", { mode: "string" }),
    status: newsStatus("status").notNull().default("draft"),
    authorEmail: text("author_email").notNull(),
    createdAt: timestampColumn("created_at").notNull(),
    updatedAt: timestampColumn("updated_at").notNull(),
    publishedAt: timestampColumn("published_at"),
  },
  (table) => [
    index("news_status_date_idx").on(table.status, table.publishedDate),
    index("news_expires_at_idx").on(table.expiresAt),
  ],
);

export const villageProfile = pgTable("village_profile", {
  id: text("id").primaryKey(),
  headName: text("head_name").notNull(),
  headTitle: text("head_title").notNull(),
  greetingLead: text("greeting_lead").notNull(),
  welcomeParagraph: text("welcome_paragraph").notNull(),
  closingParagraph: text("closing_paragraph").notNull(),
  profileImageKey: text("profile_image_key"),
  profileImageMime: text("profile_image_mime"),
  profileImageBytes: integer("profile_image_bytes"),
  profileImageWidth: integer("profile_image_width"),
  profileImageHeight: integer("profile_image_height"),
  populationCount: integer("population_count").notNull().default(8742),
  householdCount: integer("household_count").notNull().default(2685),
  rwCount: integer("rw_count").notNull().default(12),
  officePhone: text("office_phone").notNull().default("+62 858-4685-8441"),
  officeEmail: text("office_email")
    .notNull()
    .default("desacipeundeuy113@gmail.com"),
  serviceHoursMonThu: text("service_hours_mon_thu")
    .notNull()
    .default("08.00 - 16.00 WIB"),
  serviceHoursFriday: text("service_hours_friday")
    .notNull()
    .default("08.00 - 16.30 WIB"),
  updatedAt: timestampColumn("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const adminUsers = pgTable(
  "admin_users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    accessKeyHash: text("access_key_hash").notNull(),
    role: adminRole("role").notNull().default("editor"),
    active: boolean("active").notNull().default(true),
    createdAt: timestampColumn("created_at").notNull(),
    updatedAt: timestampColumn("updated_at").notNull(),
    accessKeyChangedAt: timestampColumn("access_key_changed_at").notNull(),
  },
  (table) => [
    uniqueIndex("admin_users_email_unique").on(table.email),
    index("admin_users_active_idx").on(table.active),
  ],
);

export const adminSessions = pgTable(
  "admin_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    csrfHash: text("csrf_hash").notNull(),
    expiresAt: timestampColumn("expires_at").notNull(),
    createdAt: timestampColumn("created_at").notNull(),
    lastSeenAt: timestampColumn("last_seen_at").notNull(),
  },
  (table) => [
    index("admin_sessions_user_idx").on(table.userId),
    index("admin_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const adminLoginRateLimits = pgTable("admin_login_rate_limits", {
  bucketKey: text("bucket_key").primaryKey(),
  windowStartedAt: timestampColumn("window_started_at").notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  updatedAt: timestampColumn("updated_at").notNull(),
});

export type DirectoryEntry = typeof directoryEntries.$inferSelect;
export type NewDirectoryEntry = typeof directoryEntries.$inferInsert;
export type DirectoryClickEvent = typeof directoryClickEvents.$inferSelect;
export type NewsEntry = typeof newsEntries.$inferSelect;
export type VillageProfile = typeof villageProfile.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminSession = typeof adminSessions.$inferSelect;
