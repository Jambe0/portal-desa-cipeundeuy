import { createDatabasePool } from "./database.mjs";

const pool = createDatabasePool(1);

try {
  const loginResult = await pool.query(`
    DELETE FROM admin_login_rate_limits
    WHERE updated_at < NOW() - INTERVAL '1 day'
  `);
  const sessionResult = await pool.query(`
    DELETE FROM admin_sessions
    WHERE expires_at < NOW()
  `);
  const clickResult = await pool.query(`
    DELETE FROM directory_click_events
    WHERE day_bucket < CURRENT_DATE - INTERVAL '90 days'
  `);
  console.log(
    `Pemeliharaan selesai: ${loginResult.rowCount || 0} bucket login, ${sessionResult.rowCount || 0} sesi kedaluwarsa, dan ${clickResult.rowCount || 0} klik lama dihapus.`,
  );
} finally {
  await pool.end();
}
