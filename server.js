import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DATA_DIR = join(__dirname, "data");
const DB_PATH = join(DATA_DIR, "app.db");
const STATIC_DIR = join(__dirname, "static");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const TOKEN_SECRET = process.env.TOKEN_SECRET || "change-this-secret-before-hosting";

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function sql(strings, ...values) {
  return strings.reduce((query, part, index) => {
    if (index === values.length) return query + part;
    return query + part + quote(values[index]);
  }, "");
}

function quote(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function localEmailFor(name, role, id) {
  const slug = String(name || role)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || role;
  return `${slug}-${role}-${id}@kids.local`;
}

function nameAlreadyUsed(name, exceptUserId = 0) {
  return Boolean(db(sql`SELECT id FROM users WHERE lower(name) = lower(${name}) AND id != ${Number(exceptUserId)} LIMIT 1;`)[0]);
}

function db(query) {
  const result = spawnSync("sqlite3", ["-json", DB_PATH, query], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "SQLite command failed");
  return result.stdout.trim() ? JSON.parse(result.stdout) : [];
}

function exec(query) {
  const result = spawnSync("sqlite3", [DB_PATH, query], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "SQLite command failed");
}

function columnExists(table, column) {
  return db(`PRAGMA table_info(${table});`).some((item) => item.name === column);
}

function boolInt(value) {
  return value ? 1 : 0;
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const attempted = hashPassword(password, salt).split(":")[1];
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(attempted, "hex"));
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 12 })).toString("base64url");
  const sig = createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function readToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  if (sig !== expected) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString());
  return payload.exp > Date.now() ? payload : null;
}

function today() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isWeekend(dateString = today()) {
  const day = new Date(`${dateString}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

function dayColumn(dateString = today()) {
  return `day_${new Date(`${dateString}T12:00:00`).getDay()}`;
}

const PRAYER_POINTS = 10;
const PRAYER_WINDOWS = {
  Dhuhr: { start: "13:30", end: "15:00" },
  Asr: { start: "17:30", end: "18:30" },
  Maghrib: { start: "21:00", end: "21:30" }
};

function currentLocalTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function prayerWindowStatus(prayer, time = currentLocalTime()) {
  const window = PRAYER_WINDOWS[prayer];
  if (!window) return { allowed: true, message: "Open today", window: null, now: time };
  if (time < window.start) return { allowed: false, tooEarly: true, message: `${prayer} opens at ${window.start}`, window, now: time };
  if (time > window.end) return { allowed: false, tooLate: true, message: `${prayer} time ended at ${window.end}`, window, now: time };
  return { allowed: true, message: `${prayer} prayer time is open until ${window.end}`, window, now: time };
}

const HIFZ_CHILD_NAME = "SM";
const HIFZ_START_DATE = "2026-05-01";
const HIFZ_TOTAL_PAGES = 200;
const HIFZ_PAGES_PER_JUZ = 20;
const HIFZ_JUZ_ORDER = [30, 29, 28, 27, 26, 25, 24, 23, 22, 21];
const HIFZ_JUZ_SURAH_RANGES = {
  30: [78, 114],
  29: [67, 77],
  28: [58, 66],
  27: [51, 57],
  26: [46, 51],
  25: [41, 45],
  24: [39, 41],
  23: [36, 39],
  22: [33, 36],
  21: [29, 33]
};

function dateFromLocal(dateString) {
  return new Date(`${dateString}T12:00:00`);
}

function addDays(dateString, days) {
  const date = dateFromLocal(dateString);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayName(dateString) {
  return new Intl.DateTimeFormat("en", { weekday: "long" }).format(dateFromLocal(dateString));
}

function hifzJuzForPage(planPageNumber) {
  return HIFZ_JUZ_ORDER[Math.floor((Number(planPageNumber) - 1) / HIFZ_PAGES_PER_JUZ)] || 21;
}

function hifzPageInJuz(planPageNumber) {
  return ((Number(planPageNumber) - 1) % HIFZ_PAGES_PER_JUZ) + 1;
}

const QURAN_SURAHS = [
  [1, "Al-Fatihah", "Makkah", 7], [2, "Al-Baqarah", "Madinah", 286], [3, "Ali 'Imran", "Madinah", 200], [4, "An-Nisa", "Madinah", 176],
  [5, "Al-Ma'idah", "Madinah", 120], [6, "Al-An'am", "Makkah", 165], [7, "Al-A'raf", "Makkah", 206], [8, "Al-Anfal", "Madinah", 75],
  [9, "At-Tawbah", "Madinah", 129], [10, "Yunus", "Makkah", 109], [11, "Hud", "Makkah", 123], [12, "Yusuf", "Makkah", 111],
  [13, "Ar-Ra'd", "Madinah", 43], [14, "Ibrahim", "Makkah", 52], [15, "Al-Hijr", "Makkah", 99], [16, "An-Nahl", "Makkah", 128],
  [17, "Al-Isra", "Makkah", 111], [18, "Al-Kahf", "Makkah", 110], [19, "Maryam", "Makkah", 98], [20, "Taha", "Makkah", 135],
  [21, "Al-Anbiya", "Makkah", 112], [22, "Al-Hajj", "Mixed", 78], [23, "Al-Mu'minun", "Makkah", 118], [24, "An-Nur", "Madinah", 64],
  [25, "Al-Furqan", "Makkah", 77], [26, "Ash-Shu'ara", "Makkah", 227], [27, "An-Naml", "Makkah", 93], [28, "Al-Qasas", "Makkah", 88],
  [29, "Al-'Ankabut", "Makkah", 69], [30, "Ar-Rum", "Makkah", 60], [31, "Luqman", "Makkah", 34], [32, "As-Sajdah", "Makkah", 30],
  [33, "Al-Ahzab", "Madinah", 73], [34, "Saba", "Makkah", 54], [35, "Fatir", "Makkah", 45], [36, "Ya-Sin", "Makkah", 83],
  [37, "As-Saffat", "Makkah", 182], [38, "Sad", "Makkah", 88], [39, "Az-Zumar", "Makkah", 75], [40, "Ghafir", "Makkah", 85],
  [41, "Fussilat", "Makkah", 54], [42, "Ash-Shuraa", "Makkah", 53], [43, "Az-Zukhruf", "Makkah", 89], [44, "Ad-Dukhan", "Makkah", 59],
  [45, "Al-Jathiyah", "Makkah", 37], [46, "Al-Ahqaf", "Makkah", 35], [47, "Muhammad", "Madinah", 38], [48, "Al-Fath", "Madinah", 29],
  [49, "Al-Hujurat", "Madinah", 18], [50, "Qaf", "Makkah", 45], [51, "Adh-Dhariyat", "Makkah", 60], [52, "At-Tur", "Makkah", 49],
  [53, "An-Najm", "Makkah", 62], [54, "Al-Qamar", "Makkah", 55], [55, "Ar-Rahman", "Madinah", 78], [56, "Al-Waqi'ah", "Makkah", 96],
  [57, "Al-Hadid", "Madinah", 29], [58, "Al-Mujadila", "Madinah", 22], [59, "Al-Hashr", "Madinah", 24], [60, "Al-Mumtahanah", "Madinah", 13],
  [61, "As-Saff", "Madinah", 14], [62, "Al-Jumu'ah", "Madinah", 11], [63, "Al-Munafiqun", "Madinah", 11], [64, "At-Taghabun", "Madinah", 18],
  [65, "At-Talaq", "Madinah", 12], [66, "At-Tahrim", "Madinah", 12], [67, "Al-Mulk", "Makkah", 30], [68, "Al-Qalam", "Makkah", 52],
  [69, "Al-Haqqah", "Makkah", 52], [70, "Al-Ma'arij", "Makkah", 44], [71, "Nuh", "Makkah", 28], [72, "Al-Jinn", "Makkah", 28],
  [73, "Al-Muzzammil", "Makkah", 20], [74, "Al-Muddaththir", "Makkah", 56], [75, "Al-Qiyamah", "Makkah", 40], [76, "Al-Insan", "Madinah", 31],
  [77, "Al-Mursalat", "Makkah", 50], [78, "An-Naba", "Makkah", 40], [79, "An-Nazi'at", "Makkah", 46], [80, "'Abasa", "Makkah", 42],
  [81, "At-Takwir", "Makkah", 29], [82, "Al-Infitar", "Makkah", 19], [83, "Al-Mutaffifin", "Makkah", 36], [84, "Al-Inshiqaq", "Makkah", 25],
  [85, "Al-Buruj", "Makkah", 22], [86, "At-Tariq", "Makkah", 17], [87, "Al-A'la", "Makkah", 19], [88, "Al-Ghashiyah", "Makkah", 26],
  [89, "Al-Fajr", "Makkah", 30], [90, "Al-Balad", "Makkah", 20], [91, "Ash-Shams", "Makkah", 15], [92, "Al-Layl", "Makkah", 21],
  [93, "Ad-Duha", "Makkah", 11], [94, "Ash-Sharh", "Makkah", 8], [95, "At-Tin", "Makkah", 8], [96, "Al-'Alaq", "Makkah", 19],
  [97, "Al-Qadr", "Makkah", 5], [98, "Al-Bayyinah", "Madinah", 8], [99, "Az-Zalzalah", "Madinah", 8], [100, "Al-'Adiyat", "Makkah", 11],
  [101, "Al-Qari'ah", "Makkah", 11], [102, "At-Takathur", "Makkah", 8], [103, "Al-'Asr", "Makkah", 3], [104, "Al-Humazah", "Makkah", 9],
  [105, "Al-Fil", "Makkah", 5], [106, "Quraysh", "Makkah", 4], [107, "Al-Ma'un", "Makkah", 7], [108, "Al-Kawthar", "Makkah", 3],
  [109, "Al-Kafirun", "Makkah", 6], [110, "An-Nasr", "Madinah", 3], [111, "Al-Masad", "Makkah", 5], [112, "Al-Ikhlas", "Makkah", 4],
  [113, "Al-Falaq", "Makkah", 5], [114, "An-Nas", "Makkah", 6]
].map(([id, surah_name, revelation_place, total_verses]) => ({ id, surah_name, revelation_place, total_verses }));

const QURAN_JUZ_RANGES = [
  [1, [[1, 1, 7], [2, 1, 141]]], [2, [[2, 142, 252]]], [3, [[2, 253, 286], [3, 1, 92]]], [4, [[3, 93, 200], [4, 1, 23]]],
  [5, [[4, 24, 147]]], [6, [[4, 148, 176], [5, 1, 81]]], [7, [[5, 82, 120], [6, 1, 110]]], [8, [[6, 111, 165], [7, 1, 87]]],
  [9, [[7, 88, 206], [8, 1, 40]]], [10, [[8, 41, 75], [9, 1, 92]]], [11, [[9, 93, 129], [10, 1, 109], [11, 1, 5]]],
  [12, [[11, 6, 123], [12, 1, 52]]], [13, [[12, 53, 111], [13, 1, 43], [14, 1, 52]]], [14, [[15, 1, 99], [16, 1, 128]]],
  [15, [[17, 1, 111], [18, 1, 74]]], [16, [[18, 75, 110], [19, 1, 98], [20, 1, 135]]], [17, [[21, 1, 112], [22, 1, 78]]],
  [18, [[23, 1, 118], [24, 1, 64], [25, 1, 20]]], [19, [[25, 21, 77], [26, 1, 227], [27, 1, 55]]],
  [20, [[27, 56, 93], [28, 1, 88], [29, 1, 45]]], [21, [[29, 46, 69], [30, 1, 60], [31, 1, 34], [32, 1, 30], [33, 1, 30]]],
  [22, [[33, 31, 73], [34, 1, 54], [35, 1, 45], [36, 1, 27]]], [23, [[36, 28, 83], [37, 1, 182], [38, 1, 88], [39, 1, 31]]],
  [24, [[39, 32, 75], [40, 1, 85], [41, 1, 46]]], [25, [[41, 47, 54], [42, 1, 53], [43, 1, 89], [44, 1, 59], [45, 1, 37]]],
  [26, [[46, 1, 35], [47, 1, 38], [48, 1, 29], [49, 1, 18], [50, 1, 45], [51, 1, 30]]],
  [27, [[51, 31, 60], [52, 1, 49], [53, 1, 62], [54, 1, 55], [55, 1, 78], [56, 1, 96], [57, 1, 29]]],
  [28, [[58, 1, 22], [59, 1, 24], [60, 1, 13], [61, 1, 14], [62, 1, 11], [63, 1, 11], [64, 1, 18], [65, 1, 12], [66, 1, 12]]],
  [29, [[67, 1, 30], [68, 1, 52], [69, 1, 52], [70, 1, 44], [71, 1, 28], [72, 1, 28], [73, 1, 20], [74, 1, 56], [75, 1, 40], [76, 1, 31], [77, 1, 50]]],
  [30, [[78, 1, 40], [79, 1, 46], [80, 1, 42], [81, 1, 29], [82, 1, 19], [83, 1, 36], [84, 1, 25], [85, 1, 22], [86, 1, 17], [87, 1, 19], [88, 1, 26], [89, 1, 30], [90, 1, 20], [91, 1, 15], [92, 1, 21], [93, 1, 11], [94, 1, 8], [95, 1, 8], [96, 1, 19], [97, 1, 5], [98, 1, 8], [99, 1, 8], [100, 1, 11], [101, 1, 11], [102, 1, 8], [103, 1, 3], [104, 1, 9], [105, 1, 5], [106, 1, 4], [107, 1, 7], [108, 1, 3], [109, 1, 6], [110, 1, 3], [111, 1, 5], [112, 1, 4], [113, 1, 5], [114, 1, 6]]]
].map(([juz, ranges]) => ({ juz, ranges }));

function initDb() {
  exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('parent','child')),
      child_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS children (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      avatar TEXT DEFAULT 'star',
      total_points INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      points INTEGER NOT NULL,
      duration_minutes INTEGER DEFAULT 0,
      frequency TEXT NOT NULL CHECK(frequency IN ('daily','weekly','one-time')),
      show_weekdays INTEGER DEFAULT 1,
      show_weekends INTEGER DEFAULT 0,
      day_0 INTEGER DEFAULT 0,
      day_1 INTEGER DEFAULT 1,
      day_2 INTEGER DEFAULT 1,
      day_3 INTEGER DEFAULT 1,
      day_4 INTEGER DEFAULT 1,
      day_5 INTEGER DEFAULT 1,
      day_6 INTEGER DEFAULT 0,
      task_date TEXT,
      proof_required INTEGER DEFAULT 0,
      requires_approval INTEGER DEFAULT 0,
      is_prayer INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      activity_id INTEGER NOT NULL,
      log_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','completed','approved','rejected')),
      proof TEXT,
      prayer_state TEXT,
      awarded_points INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(child_id, activity_id, log_date),
      FOREIGN KEY(child_id) REFERENCES children(id),
      FOREIGN KEY(activity_id) REFERENCES activities(id)
    );
    CREATE TABLE IF NOT EXISTS activity_assignments (
      child_id INTEGER NOT NULL,
      activity_id INTEGER NOT NULL,
      enabled INTEGER DEFAULT 1,
      PRIMARY KEY(child_id, activity_id),
      FOREIGN KEY(child_id) REFERENCES children(id),
      FOREIGN KEY(activity_id) REFERENCES activities(id)
    );
    CREATE TABLE IF NOT EXISTS rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      required_points INTEGER NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS reward_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      reward_id INTEGER NOT NULL,
      points_spent INTEGER NOT NULL,
      status TEXT DEFAULT 'redeemed',
      redeemed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(child_id) REFERENCES children(id),
      FOREIGN KEY(reward_id) REFERENCES rewards(id)
    );
    CREATE TABLE IF NOT EXISTS point_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER,
      points INTEGER NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS daily_challenges (
      challenge_date TEXT PRIMARY KEY,
      activity_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(activity_id) REFERENCES activities(id)
    );
    CREATE TABLE IF NOT EXISTS badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      badge_date TEXT NOT NULL,
      activity_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      icon TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(child_id, badge_date, activity_id),
      FOREIGN KEY(child_id) REFERENCES children(id),
      FOREIGN KEY(activity_id) REFERENCES activities(id)
    );
    CREATE TABLE IF NOT EXISTS daily_challenge_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      challenge_date TEXT NOT NULL,
      activity_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(child_id, challenge_date),
      FOREIGN KEY(child_id) REFERENCES children(id),
      FOREIGN KEY(activity_id) REFERENCES activities(id)
    );
    CREATE TABLE IF NOT EXISTS reward_discounts (
      period_key TEXT PRIMARY KEY,
      reward_id INTEGER NOT NULL,
      discount_percent INTEGER NOT NULL DEFAULT 50,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(reward_id) REFERENCES rewards(id)
    );
    CREATE TABLE IF NOT EXISTS family_quest_awards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      award_date TEXT NOT NULL,
      child_id INTEGER NOT NULL,
      points INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(award_date, child_id),
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS avatar_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      icon TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'frame',
      cost INTEGER NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS avatar_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      equipped INTEGER DEFAULT 0,
      purchased_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(child_id, item_id),
      FOREIGN KEY(child_id) REFERENCES children(id),
      FOREIGN KEY(item_id) REFERENCES avatar_items(id)
    );
    CREATE TABLE IF NOT EXISTS treasure_chests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      chest_date TEXT NOT NULL,
      reward_type TEXT NOT NULL,
      reward_value INTEGER NOT NULL,
      message TEXT NOT NULL,
      opened_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(child_id, chest_date),
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS parent_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      target_count INTEGER DEFAULT 3,
      bonus_points INTEGER DEFAULT 10,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      child_id INTEGER,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS parent_challenge_awards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id INTEGER NOT NULL,
      child_id INTEGER NOT NULL,
      points INTEGER NOT NULL,
      awarded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(challenge_id, child_id),
      FOREIGN KEY(challenge_id) REFERENCES parent_challenges(id),
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS power_ups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      power_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      value INTEGER DEFAULT 0,
      status TEXT DEFAULT 'owned' CHECK(status IN ('owned','active','used')),
      earned_at TEXT DEFAULT CURRENT_TIMESTAMP,
      used_at TEXT,
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS mystery_boxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      box_date TEXT NOT NULL,
      reward_type TEXT NOT NULL,
      reward_value INTEGER NOT NULL,
      message TEXT NOT NULL,
      opened_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(child_id, box_date),
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS child_reflections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      reflection_date TEXT NOT NULL,
      enjoyed_activity TEXT NOT NULL,
      feeling TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(child_id, reflection_date),
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS early_bird_checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      checkin_date TEXT NOT NULL,
      checkin_time TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('early','late')),
      awarded_points INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(child_id, checkin_date),
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS quran_surah_progress (
      child_id INTEGER NOT NULL,
      surah_id INTEGER NOT NULL,
      memorized_verses INTEGER DEFAULT 0,
      surah_bonus_awarded INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(child_id, surah_id),
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS quran_juz_awards (
      child_id INTEGER NOT NULL,
      juz_number INTEGER NOT NULL,
      awarded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(child_id, juz_number),
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS quran_memorization_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      surah_id INTEGER NOT NULL,
      log_date TEXT NOT NULL,
      verses_added INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS quran_revision_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      surah_id INTEGER NOT NULL,
      revision_date TEXT NOT NULL,
      awarded_points INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(child_id, surah_id, revision_date),
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS quran_favorite_surahs (
      child_id INTEGER NOT NULL,
      surah_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(child_id, surah_id),
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS hifz_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_date TEXT NOT NULL,
      day_name TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      juz_number INTEGER NOT NULL,
      memorized INTEGER DEFAULT 0,
      revised INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      points_earned INTEGER DEFAULT 0,
      completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, page_number),
      UNIQUE(user_id, plan_date),
      FOREIGN KEY(user_id) REFERENCES children(id)
    );
  `);

  let addedHifzJourneyColumns = false;
  const hifzColumns = [
    ["page_in_juz", "INTEGER DEFAULT 1"],
    ["surah_number", "TEXT DEFAULT ''"],
    ["surah_name", "TEXT DEFAULT 'Select Surah'"],
    ["surah_name_arabic", "TEXT DEFAULT ''"],
    ["surah_name_english", "TEXT DEFAULT 'Select Surah'"],
    ["ayah_range", "TEXT DEFAULT ''"],
    ["memorization_task", "TEXT DEFAULT ''"],
    ["revision_task", "TEXT DEFAULT ''"],
    ["weekly_review_done", "INTEGER DEFAULT 0"],
    ["juz_review_done", "INTEGER DEFAULT 0"],
    ["parent_reviewed", "INTEGER DEFAULT 0"],
    ["parent_notes", "TEXT DEFAULT ''"],
    ["badges_earned", "TEXT DEFAULT ''"],
    ["streak_count", "INTEGER DEFAULT 0"],
    ["updated_at", "TEXT DEFAULT ''"]
  ];
  for (const [column, definition] of hifzColumns) {
    if (!columnExists("hifz_plan", column)) {
      exec(`ALTER TABLE hifz_plan ADD COLUMN ${column} ${definition};`);
      addedHifzJourneyColumns = true;
    }
  }

  if (!columnExists("activities", "duration_minutes")) {
    exec("ALTER TABLE activities ADD COLUMN duration_minutes INTEGER DEFAULT 0;");
  }
  if (!columnExists("activities", "show_weekdays")) {
    exec("ALTER TABLE activities ADD COLUMN show_weekdays INTEGER DEFAULT 1;");
  }
  if (!columnExists("activities", "show_weekends")) {
    exec("ALTER TABLE activities ADD COLUMN show_weekends INTEGER DEFAULT 0;");
  }
  let addedPlannerColumns = false;
  for (let day = 0; day <= 6; day += 1) {
    if (!columnExists("activities", `day_${day}`)) {
      exec(`ALTER TABLE activities ADD COLUMN day_${day} INTEGER DEFAULT ${day === 0 || day === 6 ? 0 : 1};`);
      addedPlannerColumns = true;
    }
  }
  if (!columnExists("activities", "task_date")) {
    exec("ALTER TABLE activities ADD COLUMN task_date TEXT;");
  }
  if (db("SELECT COUNT(*) AS count FROM avatar_items;")[0].count === 0) {
    const items = [
      ["Golden Frame", "🏅", "frame", 60],
      ["Royal Crown", "👑", "hat", 80],
      ["Diamond Shield", "🛡️", "frame", 100],
      ["Space Trail", "🚀", "trail", 70],
      ["Rainbow Glow", "🌈", "frame", 90],
      ["Champion Cup", "🏆", "badge", 120]
    ];
    for (const item of items) {
      exec(sql`INSERT INTO avatar_items (title, icon, item_type, cost) VALUES (${item[0]}, ${item[1]}, ${item[2]}, ${item[3]});`);
    }
  }

  const [{ count }] = db("SELECT COUNT(*) AS count FROM users;");
  if (count > 0) {
    exec(`
      UPDATE activities SET duration_minutes = 15 WHERE title = 'Quran learning' AND COALESCE(duration_minutes, 0) = 0;
      UPDATE activities SET duration_minutes = 20 WHERE title = 'Reading' AND COALESCE(duration_minutes, 0) = 0;
      UPDATE activities SET duration_minutes = 15 WHERE title = 'Writing' AND COALESCE(duration_minutes, 0) = 0;
      UPDATE activities SET duration_minutes = 20 WHERE title = 'Mathematics' AND COALESCE(duration_minutes, 0) = 0;
      UPDATE activities SET duration_minutes = 10 WHERE title = 'Helping mother' AND COALESCE(duration_minutes, 0) = 0;
      UPDATE activities SET duration_minutes = 30 WHERE title = 'Sport activity' AND COALESCE(duration_minutes, 0) = 0;
      UPDATE activities SET duration_minutes = 10 WHERE title = 'Self-organization' AND COALESCE(duration_minutes, 0) = 0;
      UPDATE activities SET duration_minutes = 20 WHERE title = 'Teamwork activity' AND COALESCE(duration_minutes, 0) = 0;
      UPDATE activities SET points = 50 WHERE is_prayer = 1 OR title = 'Five daily prayers';
      UPDATE activities SET show_weekdays = 1 WHERE show_weekdays IS NULL;
      UPDATE activities SET show_weekends = 0 WHERE show_weekends IS NULL;
      ${addedPlannerColumns ? "UPDATE activities SET day_1 = show_weekdays, day_2 = show_weekdays, day_3 = show_weekdays, day_4 = show_weekdays, day_5 = show_weekdays, day_0 = show_weekends, day_6 = show_weekends;" : ""}
      INSERT OR IGNORE INTO activity_assignments (child_id, activity_id, enabled)
      SELECT c.id, a.id, 1 FROM children c CROSS JOIN activities a WHERE a.active = 1;
    `);
    return;
  }

  exec(sql`
    INSERT INTO children (name, avatar, total_points) VALUES ('Amina', 'rainbow', 0);
    INSERT INTO children (name, avatar, total_points) VALUES ('Yusuf', 'rocket', 0);
    INSERT INTO users (name, email, password_hash, role) VALUES ('Parent Admin', 'parent@example.com', ${hashPassword("parent123")}, 'parent');
    INSERT INTO users (name, email, password_hash, role, child_id) VALUES ('Amina', 'amina@example.com', ${hashPassword("child123")}, 'child', 1);
    INSERT INTO users (name, email, password_hash, role, child_id) VALUES ('Yusuf', 'yusuf@example.com', ${hashPassword("child123")}, 'child', 2);
  `);

  const activities = [
    ["Quran learning", "Read, memorize, or revise Quran with care.", 20, 15, "daily", 0, 0, 0],
    ["Five daily prayers", "Track Fajr, Dhuhr, Asr, Maghrib, and Isha.", 50, 0, "daily", 0, 0, 1],
    ["Reading", "Read a book or story for the agreed time.", 10, 20, "daily", 0, 0, 0],
    ["Writing", "Practice handwriting, journal, or spelling.", 10, 15, "daily", 0, 0, 0],
    ["Mathematics", "Solve math exercises or mental arithmetic.", 15, 20, "daily", 0, 0, 0],
    ["Helping mother", "Help at home kindly and without delay.", 15, 10, "daily", 0, 1, 0],
    ["Sport activity", "Move, play, exercise, or train.", 15, 30, "daily", 0, 0, 0],
    ["Sleeping on time", "Go to bed at the planned bedtime.", 10, 0, "daily", 0, 0, 0],
    ["Waking up on time", "Wake up at the planned morning time.", 10, 0, "daily", 0, 0, 0],
    ["Self-organization", "Keep room, school bag, and tasks organized.", 15, 10, "daily", 0, 1, 0],
    ["Teamwork activity", "Cooperate well with family or friends.", 20, 20, "weekly", 1, 1, 0]
  ];
  for (const activity of activities) {
    exec(sql`INSERT INTO activities (title, description, points, duration_minutes, frequency, proof_required, requires_approval, is_prayer) VALUES (${activity[0]}, ${activity[1]}, ${activity[2]}, ${activity[3]}, ${activity[4]}, ${activity[5]}, ${activity[6]}, ${activity[7]});`);
  }

  const rewards = [
    ["iPad time", "Enjoy extra iPad time.", 80],
    ["PS5 time", "Play PS5 with an approved time limit.", 100],
    ["Chess", "Choose a chess game or chess puzzle time.", 50],
    ["Swimming", "Go for a swimming session.", 140],
    ["Ice cream", "Pick a favorite ice cream.", 60],
    ["Park visit", "Visit the park together.", 90],
    ["Restaurant", "Choose a family restaurant meal.", 180],
    ["Money exchange", "Exchange points for pocket money.", 200]
  ];
  for (const reward of rewards) {
    exec(sql`INSERT INTO rewards (title, description, required_points) VALUES (${reward[0]}, ${reward[1]}, ${reward[2]});`);
  }
  exec("INSERT OR IGNORE INTO activity_assignments (child_id, activity_id, enabled) SELECT c.id, a.id, 1 FROM children c CROSS JOIN activities a WHERE a.active = 1;");
}

function addPoints(childId, points, sourceType, sourceId, note) {
  exec(sql`
    INSERT INTO point_transactions (child_id, source_type, source_id, points, note) VALUES (${childId}, ${sourceType}, ${sourceId}, ${points}, ${note});
    UPDATE children SET total_points = total_points + ${points} WHERE id = ${childId};
  `);
}

function isHifzChild(child) {
  return child && String(child.name || "") === HIFZ_CHILD_NAME;
}

function hifzPointsFor(row) {
  const memorized = Boolean(Number(row.memorized || 0));
  const revised = Boolean(Number(row.revised || 0));
  const base = (memorized ? 10 : 0) + (revised ? 5 : 0) + (memorized && revised ? 5 : 0);
  const weeklyBonus = Boolean(Number(row.weekly_review_done || 0)) ? 15 : 0;
  const juzBonus = Boolean(Number(row.juz_review_done || 0)) ? 30 : 0;
  return base + weeklyBonus + juzBonus;
}

function hifzSurahMetadata() {
  return QURAN_SURAHS.filter((surah) => surah.id >= 29 && surah.id <= 114).map((surah) => ({
    surahNumber: surah.id,
    surahNameArabic: surah.surah_name,
    surahNameEnglish: surah.surah_name,
    juzNumbers: Object.entries(HIFZ_JUZ_SURAH_RANGES)
      .filter(([, [start, end]]) => surah.id >= start && surah.id <= end)
      .map(([juz]) => Number(juz)),
    totalAyahs: surah.total_verses,
    revelationPlace: surah.revelation_place
  }));
}

function hifzSurahForPage(juzNumber, pageInJuz) {
  const [start, end] = HIFZ_JUZ_SURAH_RANGES[juzNumber] || [];
  if (!start || !end) return { surahNumber: "", surahNameArabic: "", surahNameEnglish: "Select Surah", ayahRange: "" };
  if (juzNumber < 28) return { surahNumber: "", surahNameArabic: "", surahNameEnglish: "Select Surah", ayahRange: "Parent can adjust Surah and ayah range" };
  const surahs = QURAN_SURAHS.filter((surah) => surah.id >= start && surah.id <= end);
  const bucket = Math.floor(((Number(pageInJuz) - 1) / HIFZ_PAGES_PER_JUZ) * surahs.length);
  const primary = surahs[Math.min(surahs.length - 1, bucket)];
  const next = surahs[Math.min(surahs.length - 1, bucket + 1)];
  const multi = next && next.id !== primary.id && Number(pageInJuz) % 5 === 0;
  return {
    surahNumber: multi ? `${primary.id}/${next.id}` : String(primary.id),
    surahNameArabic: multi ? `${primary.surah_name} / ${next.surah_name}` : primary.surah_name,
    surahNameEnglish: multi ? `${primary.surah_name} / ${next.surah_name}` : primary.surah_name,
    ayahRange: "Parent can adjust ayah range"
  };
}

function hifzPlanTemplate(planPageNumber) {
  const planDate = addDays(HIFZ_START_DATE, Number(planPageNumber) - 1);
  const juzNumber = hifzJuzForPage(planPageNumber);
  const pageInJuz = hifzPageInJuz(planPageNumber);
  const surah = hifzSurahForPage(juzNumber, pageInJuz);
  return {
    planDate,
    dayName: dayName(planDate),
    planPageNumber: Number(planPageNumber),
    juzNumber,
    pageInJuz,
    surahNumber: surah.surahNumber,
    surahNameArabic: surah.surahNameArabic,
    surahNameEnglish: surah.surahNameEnglish,
    ayahRange: surah.ayahRange,
    memorizationTask: `Memorize page ${planPageNumber} (Juz ${juzNumber}, page ${pageInJuz})`,
    revisionTask: Number(planPageNumber) % HIFZ_PAGES_PER_JUZ === 0
      ? `Juz Review: Recite the full completed Juz ${juzNumber}.`
      : Number(planPageNumber) % 7 === 0
        ? "Weekly Review: Recite all pages memorized this week."
        : Number(planPageNumber) > 1
          ? `Review yesterday's page and last 3 memorized pages.`
          : "Read and review today's new page."
  };
}

function ensureHifzPlan(child) {
  if (!isHifzChild(child)) return;
  const status = db(sql`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN revision_task IS NULL OR revision_task = '' THEN 1 ELSE 0 END) AS missing_revision,
      SUM(CASE WHEN page_number = 1 AND (surah_name_english IS NULL OR surah_name_english = '' OR surah_name_english = 'Select Surah') THEN 1 ELSE 0 END) AS missing_first_surah,
      SUM(CASE WHEN page_number = 21 AND juz_number = 29 AND page_in_juz = 1 THEN 1 ELSE 0 END) AS has_juz_reset
    FROM hifz_plan
    WHERE user_id = ${child.id};
  `)[0];
  if (
    Number(status?.total || 0) === HIFZ_TOTAL_PAGES &&
    Number(status?.missing_revision || 0) === 0 &&
    Number(status?.missing_first_surah || 0) === 0 &&
    Number(status?.has_juz_reset || 0) === 1
  ) {
    return;
  }
  for (let index = 0; index < HIFZ_TOTAL_PAGES; index += 1) {
    const pageNumber = index + 1;
    const item = hifzPlanTemplate(pageNumber);
    exec(sql`
      INSERT OR IGNORE INTO hifz_plan (
        user_id, plan_date, day_name, page_number, juz_number, page_in_juz, surah_number, surah_name, surah_name_arabic, surah_name_english, ayah_range, memorization_task, revision_task
      )
      VALUES (
        ${child.id}, ${item.planDate}, ${item.dayName}, ${item.planPageNumber}, ${item.juzNumber}, ${item.pageInJuz}, ${item.surahNumber}, ${item.surahNameEnglish}, ${item.surahNameArabic}, ${item.surahNameEnglish}, ${item.ayahRange}, ${item.memorizationTask}, ${item.revisionTask}
      );
    `);
    exec(sql`
      UPDATE hifz_plan
      SET plan_date = ${item.planDate}, day_name = ${item.dayName}, juz_number = ${item.juzNumber}, page_in_juz = ${item.pageInJuz},
        surah_name = CASE WHEN surah_name IS NULL OR surah_name = '' OR surah_name = 'Select Surah' THEN ${item.surahNameEnglish} ELSE surah_name END,
        surah_name_arabic = CASE WHEN surah_name_arabic IS NULL OR surah_name_arabic = '' THEN ${item.surahNameArabic} ELSE surah_name_arabic END,
        surah_name_english = CASE WHEN surah_name_english IS NULL OR surah_name_english = '' OR surah_name_english = 'Select Surah' THEN ${item.surahNameEnglish} ELSE surah_name_english END,
        surah_number = CASE WHEN surah_number IS NULL OR surah_number = '' THEN ${item.surahNumber} ELSE surah_number END,
        ayah_range = CASE WHEN ayah_range IS NULL OR ayah_range = '' THEN ${item.ayahRange} ELSE ayah_range END,
        memorization_task = CASE WHEN memorization_task IS NULL OR memorization_task = '' THEN ${item.memorizationTask} ELSE memorization_task END,
        revision_task = ${item.revisionTask}
      WHERE user_id = ${child.id} AND page_number = ${pageNumber};
    `);
  }
}

function hifzStreakFor(rows) {
  const completedDates = new Set(rows.filter((row) => Number(row.memorized || 0)).map((row) => row.plan_date));
  let streak = 0;
  const cursor = dateFromLocal(today());
  while (completedDates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function hifzBadgesFor({ completedPages, completedSurahs, completedJuz, currentStreak, strongRevision }) {
  return [
    { title: "First Page Completed", icon: "🌱", earned: completedPages >= 1 },
    { title: "First Surah Completed", icon: "⭐", earned: completedSurahs >= 1 },
    { title: "10 Pages Completed", icon: "🌟", earned: completedPages >= 10 },
    { title: "Juz 30 Completed", icon: "📖", earned: completedJuz.includes(30) },
    { title: "5 Juz Completed", icon: "🏆", earned: completedJuz.length >= 5 },
    { title: "10 Juz Completed", icon: "👑", earned: completedJuz.length >= 10 },
    { title: "7-Day Hifz Streak", icon: "🔥", earned: currentStreak >= 7 },
    { title: "30-Day Hifz Streak", icon: "💎", earned: currentStreak >= 30 },
    { title: "Strong Revision Hero", icon: "🛡️", earned: strongRevision }
  ];
}

function hifzPlanFor(child) {
  if (!isHifzChild(child)) return null;
  ensureHifzPlan(child);
  const rows = db(sql`SELECT * FROM hifz_plan WHERE user_id = ${child.id} ORDER BY page_number;`);
  const todayRow = rows.find((row) => row.plan_date === today()) || rows.find((row) => !Number(row.memorized || 0)) || rows[rows.length - 1];
  const completedPages = rows.filter((row) => Number(row.memorized || 0)).length;
  const totalPoints = db(sql`SELECT COALESCE(SUM(points), 0) AS points FROM point_transactions WHERE child_id = ${child.id} AND (source_type = 'hifz' OR (source_type = 'quran' AND note LIKE 'Hifz page%'));`)[0].points;
  const currentJuz = todayRow ? Number(todayRow.juz_number) : Math.min(10, Math.floor(completedPages / HIFZ_PAGES_PER_JUZ) + 1);
  const currentJuzRows = rows.filter((row) => Number(row.juz_number) === currentJuz);
  const currentJuzCompleted = currentJuzRows.filter((row) => Number(row.memorized || 0)).length;
  const completedJuz = HIFZ_JUZ_ORDER.filter((juz) => rows.filter((row) => Number(row.juz_number) === juz && Number(row.memorized || 0)).length >= HIFZ_PAGES_PER_JUZ);
  const completedSurahNames = new Set(rows.filter((row) => Number(row.memorized || 0) && row.surah_name && row.surah_name !== "Select Surah").map((row) => row.surah_name));
  const completedSurahs = completedSurahNames.size;
  const missedDays = rows.filter((row) => row.plan_date < today() && !Number(row.memorized || 0)).length;
  const currentSurahRows = rows.filter((row) => row.surah_name && row.surah_name === todayRow?.surah_name);
  const currentSurahCompleted = currentSurahRows.filter((row) => Number(row.memorized || 0)).length;
  const currentStreak = hifzStreakFor(rows);
  const strongRevision = rows.filter((row) => Number(row.revised || 0)).length >= 7 || rows.some((row) => Number(row.weekly_review_done || 0) || Number(row.juz_review_done || 0));
  const weeklyProgress = db(sql`
    SELECT strftime('%Y-%W', plan_date) AS week, COUNT(*) AS pages
    FROM hifz_plan WHERE user_id = ${child.id} AND memorized = 1
    GROUP BY week ORDER BY week DESC LIMIT 8;
  `);
  const monthlyProgress = db(sql`
    SELECT strftime('%Y-%m', plan_date) AS month, COUNT(*) AS pages
    FROM hifz_plan WHERE user_id = ${child.id} AND memorized = 1
    GROUP BY month ORDER BY month DESC LIMIT 6;
  `);
  return {
    feature_name: "Qur’an Hifz Journey – 10 Juz Surah-Based Tracker",
    start_date: HIFZ_START_DATE,
    estimated_completion_date: addDays(HIFZ_START_DATE, HIFZ_TOTAL_PAGES - 1),
    today: todayRow,
    recent: rows.slice(Math.max(0, Number(todayRow?.page_number || 1) - 3), Math.min(HIFZ_TOTAL_PAGES, Number(todayRow?.page_number || 1) + 4)),
    surah_metadata: hifzSurahMetadata(),
    total_pages: HIFZ_TOTAL_PAGES,
    total_pages_memorized: completedPages,
    total_pages_remaining: Math.max(0, HIFZ_TOTAL_PAGES - completedPages),
    current_juz: currentJuz,
    current_surah: todayRow?.surah_name || "Select Surah",
    current_surah_arabic: todayRow?.surah_name_arabic || "",
    current_surah_number: todayRow?.surah_number || "",
    current_surah_completed: currentSurahCompleted,
    current_surah_total: currentSurahRows.length || 1,
    current_juz_completed: currentJuzCompleted,
    current_juz_total: HIFZ_PAGES_PER_JUZ,
    completed_juz: completedJuz,
    completed_surahs: completedSurahs,
    missed_days: missedDays,
    weekly_progress: weeklyProgress,
    monthly_progress: monthlyProgress,
    daily_revision_completed: Boolean(Number(todayRow?.revised || 0)),
    weekly_review_due: Number(todayRow?.page_number || 0) % 7 === 0,
    weekly_review_completed: Boolean(Number(todayRow?.weekly_review_done || 0)),
    juz_review_due: Number(todayRow?.page_in_juz || 0) === 20,
    juz_review_completed: Boolean(Number(todayRow?.juz_review_done || 0)),
    current_streak: currentStreak,
    total_quran_points: Number(totalPoints || 0),
    completion_percentage: Math.round((completedPages / HIFZ_TOTAL_PAGES) * 100),
    badges: hifzBadgesFor({ completedPages, completedSurahs, completedJuz, currentStreak, strongRevision })
  };
}

function smChildForFeature(childId) {
  const child = db(sql`SELECT * FROM children WHERE id = ${Number(childId)};`)[0];
  if (!isHifzChild(child)) throw Object.assign(new Error("Qur’an Memorization is only available for SM."), { status: 403 });
  return child;
}

function quranProgressFor(childId) {
  const progressRows = new Map(db(sql`SELECT * FROM quran_surah_progress WHERE child_id = ${childId};`).map((row) => [Number(row.surah_id), row]));
  const revisedToday = new Set(db(sql`SELECT surah_id FROM quran_revision_logs WHERE child_id = ${childId} AND revision_date = ${today()};`).map((row) => Number(row.surah_id)));
  const favoriteIds = new Set(db(sql`SELECT surah_id FROM quran_favorite_surahs WHERE child_id = ${childId};`).map((row) => Number(row.surah_id)));
  const surahs = QURAN_SURAHS.map((surah) => {
    const progress = progressRows.get(Number(surah.id)) || {};
    const memorized = Math.max(0, Math.min(Number(surah.total_verses), Number(progress.memorized_verses || 0)));
    const percent = Math.round((memorized / Math.max(1, Number(surah.total_verses))) * 100);
    const status = percent === 0 ? "Not Started" : percent === 100 ? "Completed" : "In Progress";
    return {
      ...surah,
      memorized_verses: memorized,
      status,
      reward_points: memorized,
      total_surah_points: Number(surah.total_verses),
      completion_bonus_points: 20,
      progress_percentage: percent,
      is_juz_amma: surah.id >= 78,
      revised_today: revisedToday.has(Number(surah.id)),
      favorite: favoriteIds.has(Number(surah.id))
    };
  });
  const totalMemorized = surahs.reduce((sum, surah) => sum + surah.memorized_verses, 0);
  const totalVerses = surahs.reduce((sum, surah) => sum + surah.total_verses, 0);
  const completedSurahs = surahs.filter((surah) => surah.status === "Completed").length;
  const totalPoints = db(sql`SELECT COALESCE(SUM(points), 0) AS points FROM point_transactions WHERE child_id = ${childId} AND source_type IN ('quran','quran_bonus','quran_juz','quran_revision');`)[0].points;
  const completedJuz = db(sql`SELECT juz_number FROM quran_juz_awards WHERE child_id = ${childId} ORDER BY juz_number;`).map((row) => Number(row.juz_number));
  const nextSurah = surahs.find((surah) => surah.status === "In Progress") || surahs.find((surah) => surah.status === "Not Started") || surahs[0];
  const revisionTasks = surahs
    .filter((surah) => surah.status === "Completed")
    .sort((a, b) => Number(a.revised_today) - Number(b.revised_today) || a.id - b.id);
  const favoriteSurahs = surahs.filter((surah) => surah.favorite).sort((a, b) => a.id - b.id);
  return {
    surahs,
    favorite_surahs: favoriteSurahs,
    total_memorized_verses: totalMemorized,
    total_verses: totalVerses,
    progress_percentage: Math.round((totalMemorized / Math.max(1, totalVerses)) * 100),
    completed_surahs: completedSurahs,
    total_surahs: surahs.length,
    completed_juz: completedJuz,
    revision_tasks: revisionTasks,
    total_points: Number(totalPoints || 0),
    xp: Number(totalPoints || 0),
    level: Math.max(1, Math.floor(Number(totalPoints || 0) / 100) + 1),
    streak: quranStreakFor(childId),
    next_surah: nextSurah,
    rewards: [
      { title: "Ice cream", points: 500, unlocked: Number(totalPoints || 0) >= 500 },
      { title: "Screen time", points: 1000, unlocked: Number(totalPoints || 0) >= 1000 },
      { title: "Special reward", points: 2000, unlocked: Number(totalPoints || 0) >= 2000 }
    ]
  };
}

function quranStreakFor(childId) {
  const days = new Set(db(sql`
    SELECT DISTINCT log_date FROM quran_memorization_logs
    WHERE child_id = ${childId} AND verses_added > 0
    ORDER BY log_date DESC;
  `).map((row) => row.log_date));
  let streak = 0;
  const cursor = new Date(`${today()}T12:00:00`);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function quranJuzCompleted(childId, juz) {
  const progress = new Map(db(sql`SELECT surah_id, memorized_verses FROM quran_surah_progress WHERE child_id = ${childId};`).map((row) => [Number(row.surah_id), Number(row.memorized_verses || 0)]));
  const item = QURAN_JUZ_RANGES.find((entry) => Number(entry.juz) === Number(juz));
  if (!item) return false;
  return item.ranges.every(([surahId, startVerse, endVerse]) => {
    const memorized = progress.get(Number(surahId)) || 0;
    return memorized >= Number(endVerse) && Number(startVerse) >= 1;
  });
}

function awardCompletedJuzIfNeeded(childId) {
  const awarded = [];
  for (const item of QURAN_JUZ_RANGES) {
    const existing = db(sql`SELECT juz_number FROM quran_juz_awards WHERE child_id = ${childId} AND juz_number = ${item.juz} LIMIT 1;`)[0];
    if (existing || !quranJuzCompleted(childId, item.juz)) continue;
    exec(sql`INSERT INTO quran_juz_awards (child_id, juz_number) VALUES (${childId}, ${item.juz});`);
    addPoints(childId, 100, "quran_juz", item.juz, `Completed Juz ${item.juz}`);
    awarded.push(item.juz);
  }
  return awarded;
}

function ensureLog(childId, activityId, date = today()) {
  exec(sql`INSERT OR IGNORE INTO activity_logs (child_id, activity_id, log_date, status, prayer_state) VALUES (${childId}, ${activityId}, ${date}, 'pending', '{}');`);
  return db(sql`SELECT * FROM activity_logs WHERE child_id = ${childId} AND activity_id = ${activityId} AND log_date = ${date};`)[0];
}

function powerUpsFor(childId) {
  return db(sql`
    SELECT *
    FROM power_ups
    WHERE child_id = ${childId} AND status IN ('owned','active')
    ORDER BY
      CASE status WHEN 'active' THEN 0 ELSE 1 END,
      earned_at DESC
    LIMIT 12;
  `);
}

function awardPowerUp(childId, type) {
  const catalog = {
    point_bonus: ["Double Points", "The next completed activity gives double points.", 100],
    reward_discount: ["Reward Discount", "Use 10% off your next reward request.", 10],
    instant_points: ["Bonus Coins", "Use this power-up to get 10 bonus points.", 10]
  };
  const item = catalog[type] || catalog.instant_points;
  exec(sql`
    INSERT INTO power_ups (child_id, power_type, title, description, value)
    VALUES (${childId}, ${type}, ${item[0]}, ${item[1]}, ${item[2]});
  `);
}

function applyActivePointPowerUp(childId, logId, activity) {
  if (activity.is_prayer) return;
  const power = db(sql`
    SELECT *
    FROM power_ups
    WHERE child_id = ${childId} AND power_type = 'point_bonus' AND status = 'active'
    ORDER BY earned_at ASC
    LIMIT 1;
  `)[0];
  if (!power) return;
  addPoints(childId, activity.points, "power_up", power.id, `Double points for ${activity.title}`);
  exec(sql`UPDATE power_ups SET status = 'used', used_at = CURRENT_TIMESTAMP WHERE id = ${power.id};`);
}

function awardActivityIfNeeded(log, activity) {
  if (log.awarded_points > 0 || log.status !== "approved") return;
  addPoints(log.child_id, activity.points, "activity", log.id, `${activity.title} approved`);
  exec(sql`UPDATE activity_logs SET awarded_points = ${activity.points}, updated_at = CURRENT_TIMESTAMP WHERE id = ${log.id};`);
  applyActivePointPowerUp(log.child_id, log.id, activity);
  awardDailyBadgeIfNeeded(log, activity);
  awardStreakBadgesIfNeeded(log.child_id);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function send(res, status, data) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function insertRows(table, rows, columns) {
  for (const row of rows || []) {
    const values = columns.map((column) => row[column] ?? null);
    exec(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.map(quote).join(", ")});`);
  }
}

function restoreBackup(backup) {
  const required = ["users", "children", "activities", "activity_logs", "rewards", "reward_redemptions", "point_transactions"];
  if (!backup || !required.every((key) => Array.isArray(backup[key]))) {
    throw Object.assign(new Error("This file does not look like a Kids Tracker backup."), { status: 400 });
  }
  exec(`
    PRAGMA foreign_keys = OFF;
      DELETE FROM family_quest_awards;
      DELETE FROM parent_challenges;
      DELETE FROM parent_challenge_awards;
      DELETE FROM treasure_chests;
      DELETE FROM avatar_purchases;
      DELETE FROM avatar_items;
      DELETE FROM reward_discounts;
      DELETE FROM power_ups;
      DELETE FROM mystery_boxes;
      DELETE FROM child_reflections;
      DELETE FROM early_bird_checkins;
      DELETE FROM quran_favorite_surahs;
      DELETE FROM quran_revision_logs;
      DELETE FROM quran_memorization_logs;
      DELETE FROM quran_juz_awards;
      DELETE FROM quran_surah_progress;
      DELETE FROM hifz_plan;
    DELETE FROM daily_challenge_completions;
    DELETE FROM badges;
    DELETE FROM point_transactions;
    DELETE FROM reward_redemptions;
    DELETE FROM rewards;
    DELETE FROM activity_assignments;
    DELETE FROM activity_logs;
    DELETE FROM activities;
    DELETE FROM users;
    DELETE FROM children;
  `);
  insertRows("children", backup.children, ["id", "name", "avatar", "total_points", "created_at"]);
  insertRows("users", backup.users, ["id", "name", "email", "password_hash", "role", "child_id", "created_at"]);
  insertRows("activities", backup.activities, ["id", "title", "description", "points", "duration_minutes", "frequency", "show_weekdays", "show_weekends", "day_0", "day_1", "day_2", "day_3", "day_4", "day_5", "day_6", "task_date", "proof_required", "requires_approval", "is_prayer", "active", "created_at"]);
  insertRows("activity_logs", backup.activity_logs, ["id", "child_id", "activity_id", "log_date", "status", "proof", "prayer_state", "awarded_points", "created_at", "updated_at"]);
  insertRows("activity_assignments", backup.activity_assignments, ["child_id", "activity_id", "enabled"]);
  insertRows("rewards", backup.rewards, ["id", "title", "description", "required_points", "active", "created_at"]);
  insertRows("reward_redemptions", backup.reward_redemptions, ["id", "child_id", "reward_id", "points_spent", "status", "redeemed_at"]);
  insertRows("point_transactions", backup.point_transactions, ["id", "child_id", "source_type", "source_id", "points", "note", "created_at"]);
  insertRows("daily_challenges", backup.daily_challenges, ["challenge_date", "activity_id", "created_at"]);
  insertRows("badges", backup.badges, ["id", "child_id", "badge_date", "activity_id", "title", "icon", "created_at"]);
  insertRows("daily_challenge_completions", backup.daily_challenge_completions, ["id", "child_id", "challenge_date", "activity_id", "created_at"]);
  insertRows("reward_discounts", backup.reward_discounts, ["period_key", "reward_id", "discount_percent", "created_at"]);
  insertRows("family_quest_awards", backup.family_quest_awards, ["id", "award_date", "child_id", "points", "created_at"]);
  insertRows("avatar_items", backup.avatar_items, ["id", "title", "icon", "item_type", "cost", "active", "created_at"]);
  insertRows("avatar_purchases", backup.avatar_purchases, ["id", "child_id", "item_id", "equipped", "purchased_at"]);
  insertRows("treasure_chests", backup.treasure_chests, ["id", "child_id", "chest_date", "reward_type", "reward_value", "message", "opened_at"]);
  insertRows("parent_challenges", backup.parent_challenges, ["id", "title", "description", "target_count", "bonus_points", "start_date", "end_date", "child_id", "active", "created_at"]);
  insertRows("parent_challenge_awards", backup.parent_challenge_awards, ["id", "challenge_id", "child_id", "points", "awarded_at"]);
  insertRows("power_ups", backup.power_ups, ["id", "child_id", "power_type", "title", "description", "value", "status", "earned_at", "used_at"]);
  insertRows("mystery_boxes", backup.mystery_boxes, ["id", "child_id", "box_date", "reward_type", "reward_value", "message", "opened_at"]);
  insertRows("child_reflections", backup.child_reflections, ["id", "child_id", "reflection_date", "enjoyed_activity", "feeling", "note", "created_at"]);
  insertRows("early_bird_checkins", backup.early_bird_checkins, ["id", "child_id", "checkin_date", "checkin_time", "status", "awarded_points", "created_at"]);
  insertRows("quran_favorite_surahs", backup.quran_favorite_surahs, ["child_id", "surah_id", "created_at"]);
  insertRows("quran_revision_logs", backup.quran_revision_logs, ["id", "child_id", "surah_id", "revision_date", "awarded_points", "created_at"]);
  insertRows("quran_surah_progress", backup.quran_surah_progress, ["child_id", "surah_id", "memorized_verses", "surah_bonus_awarded", "updated_at"]);
  insertRows("quran_juz_awards", backup.quran_juz_awards, ["child_id", "juz_number", "awarded_at"]);
  insertRows("quran_memorization_logs", backup.quran_memorization_logs, ["id", "child_id", "surah_id", "log_date", "verses_added", "created_at"]);
  insertRows("hifz_plan", backup.hifz_plan, ["id", "user_id", "plan_date", "day_name", "page_number", "juz_number", "page_in_juz", "surah_number", "surah_name", "surah_name_arabic", "surah_name_english", "ayah_range", "memorization_task", "revision_task", "memorized", "revised", "weekly_review_done", "juz_review_done", "parent_reviewed", "notes", "parent_notes", "points_earned", "badges_earned", "streak_count", "completed_at", "created_at", "updated_at"]);
  exec("PRAGMA foreign_keys = ON;");
  ensureActivityAssignments();
}

function requireUser(req) {
  const header = req.headers.authorization || "";
  const payload = readToken(header.replace("Bearer ", ""));
  if (!payload) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  const user = db(sql`SELECT id, name, email, role, child_id FROM users WHERE id = ${payload.id};`)[0];
  if (!user) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return user;
}

function requireParent(req) {
  const user = requireUser(req);
  if (user.role !== "parent") throw Object.assign(new Error("Parent access required"), { status: 403 });
  return user;
}

function childIdFor(req, explicitId) {
  const user = requireUser(req);
  if (user.role === "child") return user.child_id;
  if (explicitId) {
    const child = db(sql`SELECT id FROM children WHERE id = ${Number(explicitId)};`)[0];
    if (child) return child.id;
  }
  return Number(db("SELECT id FROM children ORDER BY id LIMIT 1;")[0]?.id);
}

function dayStreakFor(childId) {
  const rows = db(sql`
    SELECT DISTINCT log_date
    FROM activity_logs
    WHERE child_id = ${childId} AND status IN ('completed','approved')
    ORDER BY log_date DESC;
  `);
  const completedDays = new Set(rows.map((row) => row.log_date));
  let streak = 0;
  const cursor = new Date(`${today()}T12:00:00`);
  while (completedDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function activityOfTheDay() {
  const date = today();
  const scheduleColumn = dayColumn(date);
  let challenge = db(`
    SELECT dc.challenge_date, a.*
    FROM daily_challenges dc
    JOIN activities a ON a.id = dc.activity_id
    WHERE dc.challenge_date = ${quote(date)} AND a.active = 1 AND a.${scheduleColumn} = 1 AND (a.task_date IS NULL OR a.task_date = ${quote(date)});
  `)[0];
  if (challenge) return challenge;

  const activities = db(`SELECT id FROM activities WHERE active = 1 AND is_prayer = 0 AND ${scheduleColumn} = 1 AND (task_date IS NULL OR task_date = ${quote(date)}) ORDER BY id;`);
  if (activities.length === 0) return null;
  const seed = Number(date.replaceAll("-", ""));
  const selected = activities[Math.floor((Math.sin(seed) * 10000 % 1 + 1) % 1 * activities.length)] || activities[0];
  exec(sql`INSERT OR REPLACE INTO daily_challenges (challenge_date, activity_id) VALUES (${date}, ${selected.id});`);
  return db(sql`
    SELECT dc.challenge_date, a.*
    FROM daily_challenges dc
    JOIN activities a ON a.id = dc.activity_id
    WHERE dc.challenge_date = ${date};
  `)[0];
}

function ensureActivityAssignments() {
  exec(`
    INSERT OR IGNORE INTO activity_assignments (child_id, activity_id, enabled)
    SELECT c.id, a.id, 1 FROM children c CROSS JOIN activities a WHERE a.active = 1;
  `);
}

function familyQuestStatus(date = today()) {
  const members = db(sql`
    SELECT
      c.id,
      c.name,
      c.avatar,
      COUNT(l.id) AS completed_today
    FROM children c
    LEFT JOIN activity_logs l ON l.child_id = c.id AND l.log_date = ${date} AND l.status IN ('completed','approved')
    GROUP BY c.id
    ORDER BY c.name ASC;
  `);
  const completed = members.reduce((total, member) => total + Number(member.completed_today || 0), 0);
  const target = Math.max(3, members.length * 3);
  const bonus = 20;
  return { title: "Family teamwork quest", target, completed, members, complete: completed >= target, bonus };
}

function awardFamilyQuestIfNeeded(date = today()) {
  const quest = familyQuestStatus(date);
  if (!quest.complete) return quest;
  for (const member of quest.members) {
    const existing = db(sql`SELECT id FROM family_quest_awards WHERE award_date = ${date} AND child_id = ${member.id} LIMIT 1;`)[0];
    if (!existing) {
      exec(sql`INSERT INTO family_quest_awards (award_date, child_id, points) VALUES (${date}, ${member.id}, ${quest.bonus});`);
      addPoints(member.id, quest.bonus, "family_quest", 0, "Family teamwork quest bonus");
    }
  }
  return { ...quest, awarded: true };
}

function rewardDiscountsOfPeriod() {
  const start = new Date("2026-01-01T12:00:00");
  const now = new Date(`${today()}T12:00:00`);
  const days = Math.floor((now - start) / 86400000);
  const period = Math.floor(days / 2);
  const rewards = db("SELECT id FROM rewards WHERE active = 1 ORDER BY id;");
  if (rewards.length === 0) return [];

  const discounts = [
    { percent: 50, seed: 17 },
    { percent: 25, seed: 43 }
  ];
  const selectedIds = [];

  for (const discount of discounts) {
    if (rewards.length <= selectedIds.length) break;
    const periodKey = `reward-${period}-${discount.percent}`;
    const existing = db(sql`
      SELECT rd.period_key, rd.discount_percent, r.*
      FROM reward_discounts rd
      JOIN rewards r ON r.id = rd.reward_id
      WHERE rd.period_key = ${periodKey} AND r.active = 1;
    `)[0];
    if (existing && !selectedIds.includes(Number(existing.id))) {
      selectedIds.push(Number(existing.id));
      continue;
    }

    const available = rewards.filter((reward) => !selectedIds.includes(Number(reward.id)));
    const selected = available[Math.abs(Math.floor(Math.sin(days + discount.seed) * 10000)) % available.length];
    selectedIds.push(Number(selected.id));
    exec(sql`INSERT OR REPLACE INTO reward_discounts (period_key, reward_id, discount_percent) VALUES (${periodKey}, ${selected.id}, ${discount.percent});`);
  }

  return db(sql`
    SELECT rd.period_key, rd.discount_percent, r.*
    FROM reward_discounts rd
    JOIN rewards r ON r.id = rd.reward_id
    WHERE rd.period_key IN (${`reward-${period}-50`}, ${`reward-${period}-25`}) AND r.active = 1
    ORDER BY rd.discount_percent DESC;
  `);
}

function awardDailyBadgeIfNeeded(log, activity) {
  const challenge = activityOfTheDay();
  if (!challenge || Number(challenge.id) !== Number(activity.id) || log.status !== "approved") return;
  exec(sql`INSERT OR IGNORE INTO daily_challenge_completions (child_id, challenge_date, activity_id) VALUES (${log.child_id}, ${today()}, ${activity.id});`);
  const [{ count }] = db(sql`SELECT COUNT(*) AS count FROM daily_challenge_completions WHERE child_id = ${log.child_id};`);
  if (count > 0 && count % 5 === 0) {
    exec(sql`
      INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon)
      VALUES (${log.child_id}, ${today()}, ${-5000 - count}, 'Badge of the Week', '🏆');
    `);
  }
}

function awardStreakBadgesIfNeeded(childId) {
  const streak = dayStreakFor(childId);
  const blocks = Math.floor(streak / 7);
  for (let block = 1; block <= blocks; block += 1) {
    const days = block * 7;
    exec(sql`
      INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon)
      VALUES (${childId}, ${today()}, ${-days}, ${`${days}-Day Streak`}, '🔥');
    `);
  }
}

function missionsFor(childId, date = today()) {
  const completed = Number(db(sql`SELECT COUNT(*) AS count FROM activity_logs WHERE child_id = ${childId} AND log_date = ${date} AND status IN ('completed','approved');`)[0].count || 0);
  const challengeDone = Boolean(db(sql`SELECT id FROM daily_challenge_completions WHERE child_id = ${childId} AND challenge_date = ${date} LIMIT 1;`)[0]);
  const prayer = db(sql`
    SELECT l.prayer_state
    FROM activity_logs l JOIN activities a ON a.id = l.activity_id
    WHERE l.child_id = ${childId} AND l.log_date = ${date} AND a.is_prayer = 1 LIMIT 1;
  `)[0];
  const prayerCount = prayer ? Object.values(JSON.parse(prayer.prayer_state || "{}")).filter(Boolean).length : 0;
  const streak = dayStreakFor(childId);
  return [
    { id: "three", icon: "🎯", title: "Complete 3 activities", progress: Math.min(completed, 3), target: 3, complete: completed >= 3 },
    { id: "daily", icon: "🏅", title: "Finish Activity of the Day", progress: challengeDone ? 1 : 0, target: 1, complete: challengeDone },
    { id: "prayer", icon: "🕌", title: "Complete all 5 prayers", progress: prayerCount, target: 5, complete: prayerCount >= 5 },
    { id: "streak", icon: "🔥", title: "Keep your day streak", progress: Math.min(streak, 1), target: 1, complete: streak > 0 }
  ];
}

function treasureFor(childId, date = today()) {
  const existing = db(sql`SELECT * FROM treasure_chests WHERE child_id = ${childId} AND chest_date = ${date} LIMIT 1;`)[0] || null;
  const missions = missionsFor(childId, date);
  return {
    ready: missions.filter((mission) => mission.complete).length >= 3,
    opened: Boolean(existing),
    chest: existing,
    needed: Math.max(0, 3 - missions.filter((mission) => mission.complete).length)
  };
}

function mysteryBoxFor(childId, date = today()) {
  const existing = db(sql`SELECT * FROM mystery_boxes WHERE child_id = ${childId} AND box_date = ${date} LIMIT 1;`)[0] || null;
  const completed = Number(db(sql`
    SELECT COUNT(*) AS count
    FROM activity_logs
    WHERE child_id = ${childId} AND log_date = ${date} AND status IN ('completed','approved');
  `)[0].count || 0);
  return {
    ready: completed >= 3,
    opened: Boolean(existing),
    box: existing,
    completed,
    needed: Math.max(0, 3 - completed)
  };
}

const weeklyThemes = [
  { title: "Helper Week", message: "Small acts of help make the home brighter.", goal: 4, badge: "Helper Hero Badge", icon: "🏠", match: ["helping", "clean", "teamwork", "organization", "organisation"] },
  { title: "Reading Hero Week", message: "Every page makes your mind stronger.", goal: 5, badge: "Reading Star Badge", icon: "📚", match: ["reading", "writing"] },
  { title: "Quran Champion Week", message: "Steady learning builds a beautiful habit.", goal: 5, badge: "Quran Champion Badge", icon: "🕌", match: ["quran", "prayer"] },
  { title: "Sport Energy Week", message: "Move your body and grow your energy.", goal: 4, badge: "Sport Energy Badge", icon: "⚽", match: ["sport"] },
  { title: "Kindness Week", message: "Kind words and teamwork count too.", goal: 4, badge: "Kindness Badge", icon: "🤝", match: ["helping", "teamwork"] }
];

function weekInfo(dateString = today()) {
  const date = new Date(`${dateString}T12:00:00`);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function weeklyThemeFor(childId, date = today()) {
  const week = weekInfo(date);
  const weekNumber = Number(db(sql`SELECT strftime('%W', ${date}) AS week;`)[0].week || 0);
  const theme = weeklyThemes[weekNumber % weeklyThemes.length];
  const likeClause = theme.match.map((word) => `lower(a.title) LIKE ${quote(`%${word}%`)}`).join(" OR ");
  const progress = Number(db(`
    SELECT COUNT(*) AS count
    FROM activity_logs l
    JOIN activities a ON a.id = l.activity_id
    WHERE l.child_id = ${Number(childId)}
      AND l.log_date BETWEEN ${quote(week.start)} AND ${quote(week.end)}
      AND l.status IN ('completed','approved')
      AND (${likeClause});
  `)[0].count || 0);
  const complete = progress >= theme.goal;
  if (complete) {
    const badgeId = -700000 - weekNumber - weeklyThemes.indexOf(theme) * 1000;
    exec(sql`
      INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon)
      VALUES (${childId}, ${date}, ${badgeId}, ${theme.badge}, ${theme.icon});
    `);
  }
  return { ...theme, progress: Math.min(progress, theme.goal), complete, week_start: week.start, week_end: week.end };
}

function reflectionFor(childId, date = today()) {
  return db(sql`SELECT * FROM child_reflections WHERE child_id = ${childId} AND reflection_date = ${date} LIMIT 1;`)[0] || null;
}

function earlyBirdBoard(date = today(), childId = null) {
  const rows = db(sql`
    SELECT eb.*, c.name, c.avatar
    FROM early_bird_checkins eb
    JOIN children c ON c.id = eb.child_id
    WHERE eb.checkin_date = ${date}
    ORDER BY
      CASE eb.status WHEN 'early' THEN 0 ELSE 1 END,
      eb.checkin_time ASC,
      c.name ASC;
  `).map((row, index) => ({ ...row, rank: index + 1 }));
  return {
    cutoff: "07:00",
    bonus_points: 20,
    checked_in: childId ? rows.find((row) => Number(row.child_id) === Number(childId)) || null : null,
    rows
  };
}

function localTimeString() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function parentChallengesFor(childId, date = today()) {
  const challenges = db(sql`
    SELECT pc.*,
      (
        SELECT COUNT(*) FROM activity_logs l
        WHERE l.child_id = ${childId}
          AND l.log_date BETWEEN pc.start_date AND pc.end_date
          AND l.status IN ('completed','approved')
      ) AS progress
    FROM parent_challenges pc
    WHERE pc.active = 1 AND pc.start_date <= ${date} AND pc.end_date >= ${date} AND (pc.child_id IS NULL OR pc.child_id = ${childId})
    ORDER BY pc.end_date ASC, pc.id DESC;
  `).map((challenge) => ({
    ...challenge,
    complete: Number(challenge.progress || 0) >= Number(challenge.target_count || 1)
  }));
  for (const challenge of challenges) {
    if (!challenge.complete) continue;
    const existing = db(sql`SELECT id FROM parent_challenge_awards WHERE challenge_id = ${challenge.id} AND child_id = ${childId} LIMIT 1;`)[0];
    if (!existing && Number(challenge.bonus_points || 0) > 0) {
      exec(sql`INSERT INTO parent_challenge_awards (challenge_id, child_id, points) VALUES (${challenge.id}, ${childId}, ${challenge.bonus_points});`);
      addPoints(childId, Number(challenge.bonus_points), "parent_challenge", challenge.id, `${challenge.title} bonus`);
    }
  }
  return challenges.map((challenge) => ({
    ...challenge,
    awarded: Boolean(db(sql`SELECT id FROM parent_challenge_awards WHERE challenge_id = ${challenge.id} AND child_id = ${childId} LIMIT 1;`)[0])
  }));
}

function personalBestFor(childId) {
  const bestDay = db(sql`
    SELECT log_date, COUNT(*) AS completed
    FROM activity_logs
    WHERE child_id = ${childId} AND status IN ('completed','approved')
    GROUP BY log_date
    ORDER BY completed DESC, log_date DESC LIMIT 1;
  `)[0] || { log_date: null, completed: 0 };
  const todayCompleted = db(sql`SELECT COUNT(*) AS completed FROM activity_logs WHERE child_id = ${childId} AND log_date = ${today()} AND status IN ('completed','approved');`)[0];
  return {
    best_date: bestDay.log_date,
    best_completed: Number(bestDay.completed || 0),
    today_completed: Number(todayCompleted.completed || 0),
    remaining_to_best: Math.max(0, Number(bestDay.completed || 0) + 1 - Number(todayCompleted.completed || 0))
  };
}

function dashboardFor(childId) {
  const date = today();
  const scheduleColumn = dayColumn(date);
  ensureActivityAssignments();
  const familyQuest = awardFamilyQuestIfNeeded(date);
  const challenge = activityOfTheDay();
  const parentChallenges = parentChallengesFor(childId, date);
  const child = db(sql`SELECT * FROM children WHERE id = ${childId};`)[0];
  if (!child) throw Object.assign(new Error("Child not found"), { status: 404 });
  const activities = db(`
    SELECT a.*, COALESCE(l.status, 'pending') AS status, COALESCE(l.awarded_points, 0) AS awarded_points, COALESCE(l.prayer_state, '{}') AS prayer_state, l.id AS log_id
    FROM activities a
    LEFT JOIN activity_assignments aa ON aa.activity_id = a.id AND aa.child_id = ${Number(childId)}
    LEFT JOIN activity_logs l ON l.activity_id = a.id AND l.child_id = ${Number(childId)} AND l.log_date = ${quote(date)}
    WHERE a.active = 1 AND a.${scheduleColumn} = 1 AND COALESCE(aa.enabled, 1) = 1 AND (a.task_date IS NULL OR a.task_date = ${quote(date)})
    ORDER BY
      CASE COALESCE(l.status, 'pending')
        WHEN 'pending' THEN 0
        WHEN 'rejected' THEN 1
        WHEN 'completed' THEN 2
        WHEN 'approved' THEN 3
        ELSE 0
      END,
      a.id;
  `).map((row) => ({ ...row, is_daily_challenge: challenge && Number(row.id) === Number(challenge.id) ? 1 : 0, prayer_state: JSON.parse(row.prayer_state || "{}") }));
  for (const activity of activities) {
    if (activity.is_prayer) {
      activity.prayer_points = PRAYER_POINTS;
      activity.prayer_windows = PRAYER_WINDOWS;
      activity.prayer_window_status = Object.fromEntries(["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"].map((prayer) => [prayer, prayerWindowStatus(prayer)]));
    }
  }
  const [daily] = db(sql`SELECT COALESCE(SUM(points), 0) AS points FROM point_transactions WHERE child_id = ${childId} AND date(created_at, 'localtime') = ${date};`);
  const [weekly] = db(sql`SELECT COALESCE(SUM(points), 0) AS points FROM point_transactions WHERE child_id = ${childId} AND date(created_at, 'localtime') >= date('now', 'localtime', '-6 days');`);
  const [earned] = db(sql`SELECT COALESCE(SUM(points), 0) AS points FROM point_transactions WHERE child_id = ${childId} AND points > 0;`);
  const [redeemed] = db(sql`SELECT COALESCE(SUM(points_spent), 0) AS points FROM reward_redemptions WHERE child_id = ${childId} AND status = 'redeemed';`);
  const [completedToday] = db(sql`SELECT COUNT(*) AS count FROM activity_logs WHERE child_id = ${childId} AND log_date = ${date} AND status IN ('completed','approved');`);
  const [dailyTarget] = db(`
    SELECT COUNT(*) AS count
    FROM activities a
    LEFT JOIN activity_assignments aa ON aa.activity_id = a.id AND aa.child_id = ${Number(childId)}
    WHERE a.active = 1 AND a.frequency = 'daily' AND a.${scheduleColumn} = 1 AND COALESCE(aa.enabled, 1) = 1 AND (a.task_date IS NULL OR a.task_date = ${quote(date)});
  `);
  const discounts = rewardDiscountsOfPeriod();
  const rewards = db("SELECT * FROM rewards WHERE active = 1 ORDER BY required_points;").map((reward) => ({
    ...reward,
    is_discounted: discounts.some((discount) => Number(discount.id) === Number(reward.id)) ? 1 : 0,
    discount_percent: discounts.find((discount) => Number(discount.id) === Number(reward.id))?.discount_percent || 0,
    discounted_points: discounts.some((discount) => Number(discount.id) === Number(reward.id))
      ? Math.ceil(reward.required_points * (100 - discounts.find((discount) => Number(discount.id) === Number(reward.id)).discount_percent) / 100)
      : reward.required_points,
    status: child.total_points >= (discounts.some((discount) => Number(discount.id) === Number(reward.id))
      ? Math.ceil(reward.required_points * (100 - discounts.find((discount) => Number(discount.id) === Number(reward.id)).discount_percent) / 100)
      : reward.required_points) ? "available" : "locked"
  }));
  const pendingRewards = db(sql`SELECT reward_id FROM reward_redemptions WHERE child_id = ${childId} AND status = 'pending';`).map((row) => Number(row.reward_id));
  for (const reward of rewards) {
    if (pendingRewards.includes(Number(reward.id))) reward.status = "requested";
  }
  const nextReward = rewards.find((reward) => reward.required_points > child.total_points) || rewards[rewards.length - 1] || null;
  const remainingToReward = nextReward ? Math.max(0, nextReward.required_points - child.total_points) : 0;
  const leaderboard = db(`
    SELECT id, name, avatar, total_points
    FROM children
    ORDER BY total_points DESC, name ASC;
  `).map((row, index) => ({
    ...row,
    rank: index + 1,
    level: Math.max(1, Math.floor(row.total_points / 100) + 1)
  }));
  const redemptionBoard = db(`
    SELECT
      c.id,
      c.name,
      c.avatar,
      COALESCE(SUM(CASE WHEN rr.status = 'redeemed' THEN rr.points_spent ELSE 0 END), 0) AS redeemed_points,
      COALESCE(SUM(CASE WHEN rr.status = 'redeemed' AND lower(r.title) = 'money exchange' THEN rr.points_spent ELSE 0 END), 0) AS money_points,
      COUNT(rr.id) AS redeemed_count,
      SUM(CASE WHEN rr.status = 'redeemed' AND lower(r.title) = 'money exchange' THEN 1 ELSE 0 END) AS money_redemptions
    FROM children c
    LEFT JOIN reward_redemptions rr ON rr.child_id = c.id
    LEFT JOIN rewards r ON r.id = rr.reward_id
    GROUP BY c.id
    ORDER BY redeemed_points DESC, c.name ASC;
  `).map((row, index) => ({
    ...row,
    rank: index + 1,
    pocket_euros: Number((Number(row.money_points || 0) / 100).toFixed(2))
  }));
  const badges = db(sql`SELECT * FROM badges WHERE child_id = ${childId} ORDER BY created_at DESC LIMIT 20;`);
  const challengeProgress = db(sql`SELECT COUNT(*) AS count FROM daily_challenge_completions WHERE child_id = ${childId};`)[0].count;
  const todayChallengeCompleted = Boolean(db(sql`SELECT id FROM daily_challenge_completions WHERE child_id = ${childId} AND challenge_date = ${date} LIMIT 1;`)[0]);
  const streak = dayStreakFor(childId);
  const missions = missionsFor(childId, date);
  const treasure = treasureFor(childId, date);
  const mysteryBox = mysteryBoxFor(childId, date);
  const powerUps = powerUpsFor(childId);
  const weeklyTheme = weeklyThemeFor(childId, date);
  const reflection = reflectionFor(childId, date);
  const earlyBird = earlyBirdBoard(date, childId);
  const personalBest = personalBestFor(childId);
  const quran = isHifzChild(child) ? quranProgressFor(childId) : null;
  const challengeRemaining = challengeProgress % 5 === 0 ? 5 : 5 - (challengeProgress % 5);
  const streakRemaining = streak % 7 === 0 ? 7 : 7 - (streak % 7);
  return {
    child,
    date,
    activities,
    rewards,
    leaderboard,
    familyQuest,
    redemptionBoard,
    rewardDiscounts: discounts,
    activityOfTheDay: challenge,
    badges,
    missions,
    treasure,
    mysteryBox,
    powerUps,
    weeklyTheme,
    reflection,
    earlyBird,
    quran,
    hifz: null,
    parentChallenges,
    personalBest,
    achievements: {
      earned_badges: badges.length,
      locked_badges: 4,
      best_week: weekly.points,
      total_rewards_redeemed: redemptionBoard.find((row) => Number(row.id) === Number(childId))?.redeemed_count || 0
    },
    todayChallengeCompleted,
    challengeProgress,
    futureBadges: [
      { icon: "🏆", title: "Badge of the Week", requirement: `${challengeRemaining} Activity of the Day completions to go` },
      { icon: weeklyTheme.icon, title: weeklyTheme.badge, requirement: weeklyTheme.complete ? "Unlocked this week" : `${Math.max(0, weeklyTheme.goal - weeklyTheme.progress)} theme tasks to go` },
      { icon: "🔥", title: "7-Day Streak", requirement: `${streakRemaining} streak days to go` },
      { icon: "💎", title: "Point Collector", requirement: "Reach 500 total points" },
      { icon: "🎁", title: "Reward Master", requirement: "Redeem 3 rewards" }
    ],
    streak,
    summary: {
      earned_points: earned.points,
      redeemed_points: redeemed.points,
      remaining_to_reward: remainingToReward,
      next_reward_title: nextReward?.title || "reward",
      completed_today: completedToday.count,
      daily_target: dailyTarget.count,
      weekly_goal: 500,
      streak_goal: 7
    },
    points: { daily: daily.points, weekly: weekly.points, total: child.total_points }
  };
}

function parentTodayOverview(date = today()) {
  const scheduleColumn = dayColumn(date);
  return db(`
    SELECT
      c.id,
      c.name,
      c.avatar,
      COALESCE((
        SELECT SUM(points) FROM point_transactions pt
        WHERE pt.child_id = c.id AND date(pt.created_at, 'localtime') = ${quote(date)}
      ), 0) AS daily_points,
      (
        SELECT COUNT(*) FROM activity_logs l
        WHERE l.child_id = c.id AND l.log_date = ${quote(date)} AND l.status IN ('completed','approved')
      ) AS completed_today,
      (
        SELECT COUNT(*) FROM activities a
        LEFT JOIN activity_assignments aa ON aa.activity_id = a.id AND aa.child_id = c.id
        LEFT JOIN activity_logs l ON l.activity_id = a.id AND l.child_id = c.id AND l.log_date = ${quote(date)}
        WHERE a.active = 1 AND a.${scheduleColumn} = 1 AND COALESCE(aa.enabled, 1) = 1
          AND (a.task_date IS NULL OR a.task_date = ${quote(date)})
          AND COALESCE(l.status, 'pending') IN ('pending','rejected')
      ) AS missed_today,
      (
        SELECT COUNT(*) FROM activities a
        LEFT JOIN activity_assignments aa ON aa.activity_id = a.id AND aa.child_id = c.id
        WHERE a.active = 1 AND a.${scheduleColumn} = 1 AND COALESCE(aa.enabled, 1) = 1
          AND (a.task_date IS NULL OR a.task_date = ${quote(date)})
      ) AS target_today,
      (
        SELECT COUNT(*) FROM activity_logs l
        WHERE l.child_id = c.id AND l.log_date = ${quote(date)} AND l.status = 'completed'
      ) AS pending_approvals,
      (
        SELECT COUNT(*) FROM reward_redemptions rr
        WHERE rr.child_id = c.id AND rr.status = 'pending'
      ) AS pending_rewards
    FROM children c
    ORDER BY c.name ASC;
  `).map((row) => {
    const target = Math.max(1, Number(row.target_today || 0));
    const completed = Number(row.completed_today || 0);
    const missed = Number(row.missed_today || 0);
    const rewardRequests = Number(row.pending_rewards || 0);
    const status = rewardRequests > 0
      ? "Reward request waiting"
      : missed >= 3
        ? "Needs attention"
        : completed >= Math.ceil(target * 0.7)
          ? "Great progress"
          : "Keep going";
    return { ...row, status };
  });
}

function parentSmartInsights(date = today()) {
  const week = weekInfo(date);
  const bestActivity = db(sql`
    SELECT a.title, COUNT(*) AS count
    FROM activity_logs l JOIN activities a ON a.id = l.activity_id
    WHERE l.log_date = ${date} AND l.status IN ('completed','approved')
    GROUP BY a.id
    ORDER BY count DESC, a.title ASC
    LIMIT 1;
  `)[0] || null;
  const weakestActivity = db(sql`
    SELECT a.title, COUNT(*) AS missed
    FROM activities a
    LEFT JOIN activity_logs l ON l.activity_id = a.id AND l.log_date = ${date} AND l.status IN ('completed','approved')
    WHERE a.active = 1 AND l.id IS NULL
    GROUP BY a.id
    ORDER BY missed DESC, a.title ASC
    LIMIT 1;
  `)[0] || null;
  const mostActive = db(sql`
    SELECT c.name, COUNT(l.id) AS completed
    FROM children c
    LEFT JOIN activity_logs l ON l.child_id = c.id AND l.log_date BETWEEN ${week.start} AND ${week.end} AND l.status IN ('completed','approved')
    GROUP BY c.id
    ORDER BY completed DESC, c.name ASC
    LIMIT 1;
  `)[0] || null;
  const overview = parentTodayOverview(date);
  const needsAttention = [...overview].sort((a, b) => Number(b.missed_today || 0) - Number(a.missed_today || 0))[0] || null;
  const pendingApprovals = Number(db(sql`SELECT COUNT(*) AS count FROM activity_logs WHERE log_date = ${date} AND status = 'completed';`)[0].count || 0);
  const rewardRequests = Number(db("SELECT COUNT(*) AS count FROM reward_redemptions WHERE status = 'pending';")[0].count || 0);
  return {
    best_activity_today: bestActivity?.title || "Not enough data yet",
    weakest_activity_today: weakestActivity?.title || "Not enough data yet",
    most_active_child_week: mostActive?.name || "Not enough data yet",
    child_needs_attention: needsAttention?.name || "No one right now",
    reward_requests_waiting: rewardRequests,
    pending_approvals_waiting: pendingApprovals
  };
}

function parentReflections() {
  return db(`
    SELECT cr.*, c.name AS child_name, c.avatar
    FROM child_reflections cr
    JOIN children c ON c.id = cr.child_id
    ORDER BY cr.reflection_date DESC, cr.created_at DESC
    LIMIT 30;
  `);
}

function reports(childId) {
  const scheduleColumn = dayColumn(today());
  const completed = db(sql`
    SELECT l.log_date, a.title, l.status, l.awarded_points
    FROM activity_logs l JOIN activities a ON a.id = l.activity_id
    WHERE l.child_id = ${childId} AND l.status IN ('completed','approved')
    ORDER BY l.log_date DESC, l.updated_at DESC LIMIT 40;
  `);
  const weekly = db(sql`SELECT strftime('%Y-%W', created_at, 'localtime') AS week, SUM(points) AS points FROM point_transactions WHERE child_id = ${childId} GROUP BY week ORDER BY week DESC LIMIT 8;`);
  const monthly = db(sql`SELECT strftime('%Y-%m', created_at, 'localtime') AS month, SUM(points) AS points FROM point_transactions WHERE child_id = ${childId} GROUP BY month ORDER BY month DESC LIMIT 6;`);
  const best = db(sql`
    SELECT a.title, COUNT(*) AS completions
    FROM activity_logs l JOIN activities a ON a.id = l.activity_id
    WHERE l.child_id = ${childId} AND l.status = 'approved'
    GROUP BY a.id ORDER BY completions DESC LIMIT 1;
  `)[0] || null;
  const missed = db(`
    SELECT a.title FROM activities a
    LEFT JOIN activity_assignments aa ON aa.activity_id = a.id AND aa.child_id = ${Number(childId)}
    LEFT JOIN activity_logs l ON l.activity_id = a.id AND l.child_id = ${Number(childId)} AND l.log_date = ${quote(today())}
    WHERE a.active = 1 AND a.${scheduleColumn} = 1 AND COALESCE(aa.enabled, 1) = 1 AND a.frequency = 'daily' AND (a.task_date IS NULL OR a.task_date = ${quote(today())}) AND COALESCE(l.status, 'pending') = 'pending';
  `);
  const redeemed = db(sql`
    SELECT rr.redeemed_at, r.title, rr.points_spent
    FROM reward_redemptions rr JOIN rewards r ON r.id = rr.reward_id
    WHERE rr.child_id = ${childId} AND rr.status = 'redeemed'
    ORDER BY rr.redeemed_at DESC LIMIT 20;
  `);
  return { completed, weekly, monthly, best, missed, redeemed };
}

async function api(req, res, path) {
  const method = req.method;
  const body = ["POST", "PUT", "PATCH"].includes(method) ? await parseBody(req) : {};

  if (method === "POST" && path === "/api/login") {
    const loginName = String(body.name || body.email || "").trim();
    const user = db(sql`SELECT * FROM users WHERE lower(name) = lower(${loginName}) ORDER BY role DESC, id LIMIT 1;`)[0];
    if (!user || !verifyPassword(body.password || "", user.password_hash)) return send(res, 401, { error: "Invalid name or password" });
    return send(res, 200, { token: signToken({ id: user.id, role: user.role }), user: { id: user.id, name: user.name, email: user.email, role: user.role, child_id: user.child_id } });
  }

  if (method === "GET" && path === "/api/me") return send(res, 200, { user: requireUser(req) });
  if (method === "GET" && path === "/api/children") return send(res, 200, { children: db("SELECT * FROM children ORDER BY id;") });
  if (method === "GET" && path.startsWith("/api/dashboard")) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return send(res, 200, dashboardFor(childIdFor(req, url.searchParams.get("childId"))));
  }
  if (method === "GET" && path.startsWith("/api/reports")) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return send(res, 200, reports(childIdFor(req, url.searchParams.get("childId"))));
  }
  if (method === "GET" && path === "/api/admin") {
    requireParent(req);
    ensureActivityAssignments();
    return send(res, 200, {
      children: db("SELECT * FROM children ORDER BY id;"),
      users: db("SELECT id, name, email, role, child_id, created_at FROM users ORDER BY role DESC, id;"),
      activities: db(sql`SELECT * FROM activities WHERE active = 1 AND (task_date IS NULL OR task_date >= ${today()}) ORDER BY task_date IS NOT NULL DESC, id;`),
      activityAssignments: db("SELECT child_id, activity_id, enabled FROM activity_assignments;"),
      todayOverview: parentTodayOverview(),
      smartInsights: parentSmartInsights(),
      reflections: parentReflections(),
      parentChallenges: db("SELECT * FROM parent_challenges WHERE active = 1 ORDER BY end_date DESC, id DESC;"),
      rewards: db("SELECT * FROM rewards WHERE active = 1 ORDER BY required_points;"),
      approvals: db(`
        SELECT l.*, c.name AS child_name, a.title AS activity_title, a.proof_required
        FROM activity_logs l
        JOIN children c ON c.id = l.child_id
        JOIN activities a ON a.id = l.activity_id
        WHERE l.status = 'completed'
        ORDER BY l.updated_at DESC;
      `),
      rewardApprovals: db(`
        SELECT rr.*, c.name AS child_name, r.title AS reward_title
        FROM reward_redemptions rr
        JOIN children c ON c.id = rr.child_id
        JOIN rewards r ON r.id = rr.reward_id
        WHERE rr.status = 'pending'
        ORDER BY rr.redeemed_at DESC;
      `)
    });
  }
  if (method === "POST" && path === "/api/children") {
    requireParent(req);
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    if (!name || password.length < 6) return send(res, 400, { error: "Name and a password with at least 6 characters are required" });
    if (nameAlreadyUsed(name)) return send(res, 400, { error: "This login name is already used. Choose a different name." });
    exec(sql`INSERT INTO children (name, avatar, total_points) VALUES (${name}, ${body.avatar || "star"}, 0);`);
    const child = db("SELECT id FROM children ORDER BY id DESC LIMIT 1;")[0];
    exec(sql`INSERT INTO users (name, email, password_hash, role, child_id) VALUES (${name}, ${localEmailFor(name, "child", child.id)}, ${hashPassword(password)}, 'child', ${child.id});`);
    exec(sql`INSERT OR IGNORE INTO activity_assignments (child_id, activity_id, enabled) SELECT ${child.id}, id, 1 FROM activities WHERE active = 1;`);
    return send(res, 201, { ok: true });
  }
  if (method === "PUT" && path.startsWith("/api/children/")) {
    requireParent(req);
    const id = Number(path.split("/").pop());
    const name = String(body.name || "").trim();
    if (!name) return send(res, 400, { error: "Name is required" });
    const existingUser = db(sql`SELECT id FROM users WHERE role = 'child' AND child_id = ${id};`)[0];
    if (nameAlreadyUsed(name, existingUser?.id || 0)) return send(res, 400, { error: "This login name is already used. Choose a different name." });
    exec(sql`
      UPDATE children SET name = ${name}, avatar = ${body.avatar || "star"} WHERE id = ${id};
      UPDATE users SET name = ${name}, email = ${localEmailFor(name, "child", id)} WHERE role = 'child' AND child_id = ${id};
    `);
    if (body.password) {
      if (String(body.password).length < 6) return send(res, 400, { error: "Password must be at least 6 characters" });
      exec(sql`UPDATE users SET password_hash = ${hashPassword(String(body.password))} WHERE role = 'child' AND child_id = ${id};`);
    }
    return send(res, 200, { ok: true });
  }
  if (method === "DELETE" && path.startsWith("/api/children/")) {
    requireParent(req);
    const id = Number(path.split("/").pop());
    const [{ count }] = db("SELECT COUNT(*) AS count FROM children;");
    if (count <= 1) return send(res, 400, { error: "Keep at least one child account" });
    exec(sql`
      DELETE FROM activity_logs WHERE child_id = ${id};
      DELETE FROM reward_redemptions WHERE child_id = ${id};
      DELETE FROM point_transactions WHERE child_id = ${id};
      DELETE FROM badges WHERE child_id = ${id};
      DELETE FROM daily_challenge_completions WHERE child_id = ${id};
      DELETE FROM family_quest_awards WHERE child_id = ${id};
      DELETE FROM parent_challenge_awards WHERE child_id = ${id};
      DELETE FROM avatar_purchases WHERE child_id = ${id};
      DELETE FROM treasure_chests WHERE child_id = ${id};
      DELETE FROM power_ups WHERE child_id = ${id};
      DELETE FROM mystery_boxes WHERE child_id = ${id};
      DELETE FROM child_reflections WHERE child_id = ${id};
      DELETE FROM early_bird_checkins WHERE child_id = ${id};
      DELETE FROM quran_favorite_surahs WHERE child_id = ${id};
      DELETE FROM quran_revision_logs WHERE child_id = ${id};
      DELETE FROM quran_memorization_logs WHERE child_id = ${id};
      DELETE FROM quran_juz_awards WHERE child_id = ${id};
      DELETE FROM quran_surah_progress WHERE child_id = ${id};
      DELETE FROM hifz_plan WHERE user_id = ${id};
      UPDATE parent_challenges SET active = 0 WHERE child_id = ${id};
      DELETE FROM activity_assignments WHERE child_id = ${id};
      DELETE FROM users WHERE role = 'child' AND child_id = ${id};
      DELETE FROM children WHERE id = ${id};
    `);
    return send(res, 200, { ok: true });
  }
  if (method === "PUT" && path === "/api/parent-account") {
    const user = requireParent(req);
    const name = String(body.name || "").trim();
    if (!name) return send(res, 400, { error: "Name is required" });
    if (nameAlreadyUsed(name, user.id)) return send(res, 400, { error: "This login name is already used. Choose a different name." });
    exec(sql`UPDATE users SET name = ${name}, email = ${localEmailFor(name, "parent", user.id)} WHERE id = ${user.id};`);
    if (body.password) {
      if (String(body.password).length < 6) return send(res, 400, { error: "Password must be at least 6 characters" });
      exec(sql`UPDATE users SET password_hash = ${hashPassword(String(body.password))} WHERE id = ${user.id};`);
    }
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/activity-assignments") {
    requireParent(req);
    const childId = Number(body.childId);
    const activityId = Number(body.activityId);
    const enabled = body.enabled ? 1 : 0;
    if (!childId || !activityId) return send(res, 400, { error: "Child and activity are required" });
    exec(sql`
      INSERT INTO activity_assignments (child_id, activity_id, enabled) VALUES (${childId}, ${activityId}, ${enabled})
      ON CONFLICT(child_id, activity_id) DO UPDATE SET enabled = ${enabled};
    `);
    return send(res, 200, { ok: true });
  }
  if (method === "PUT" && path === "/api/my-avatar") {
    const user = requireUser(req);
    if (user.role !== "child") return send(res, 403, { error: "Child access required" });
    const avatar = String(body.avatar || "⭐").trim().slice(0, 16);
    exec(sql`UPDATE children SET avatar = ${avatar} WHERE id = ${user.child_id};`);
    return send(res, 200, dashboardFor(user.child_id));
  }
  if (method === "POST" && path === "/api/activities/complete") {
    const childId = childIdFor(req, body.childId);
    const activity = db(sql`SELECT * FROM activities WHERE id = ${body.activityId} AND active = 1;`)[0];
    if (!activity) return send(res, 404, { error: "Activity not found" });
    let log = ensureLog(childId, activity.id);
    let status = activity.requires_approval || activity.proof_required ? "completed" : "approved";
    let prayerState = log.prayer_state || "{}";
    if (activity.is_prayer) {
      const prayer = String(body.prayer || "");
      const windowStatus = prayerWindowStatus(prayer);
      if (Boolean(body.checked) && !windowStatus.allowed) {
        return send(res, 400, { error: windowStatus.tooEarly ? windowStatus.message : `${prayer} cannot be completed after ${windowStatus.window?.end || "its time"}. No points added.` });
      }
      const current = JSON.parse(prayerState || "{}");
      prayerState = JSON.stringify({ ...current, [prayer]: Boolean(body.checked) });
      const completedCount = Object.values(JSON.parse(prayerState)).filter(Boolean).length;
      const partialPoints = PRAYER_POINTS * completedCount;
      exec(sql`UPDATE activity_logs SET prayer_state = ${prayerState}, status = 'approved', awarded_points = ${partialPoints}, updated_at = CURRENT_TIMESTAMP WHERE id = ${log.id};`);
      const totalAwarded = db(sql`SELECT COALESCE(SUM(points), 0) AS total FROM point_transactions WHERE child_id = ${childId} AND source_type = 'activity' AND source_id = ${log.id};`)[0].total;
      const delta = partialPoints - totalAwarded;
      if (delta !== 0) addPoints(childId, delta, "activity", log.id, `${activity.title} prayer update`);
      log = db(sql`SELECT * FROM activity_logs WHERE id = ${log.id};`)[0];
      awardDailyBadgeIfNeeded(log, activity);
      awardStreakBadgesIfNeeded(childId);
      return send(res, 200, dashboardFor(childId));
    }
    exec(sql`UPDATE activity_logs SET status = ${status}, proof = ${body.proof || ""}, updated_at = CURRENT_TIMESTAMP WHERE id = ${log.id};`);
    log = db(sql`SELECT * FROM activity_logs WHERE id = ${log.id};`)[0];
    awardActivityIfNeeded(log, activity);
    return send(res, 200, dashboardFor(childId));
  }
  if (method === "POST" && path === "/api/quran/memorize") {
    const childId = childIdFor(req, body.childId);
    smChildForFeature(childId);
    const surah = QURAN_SURAHS.find((item) => Number(item.id) === Number(body.surahId));
    if (!surah) return send(res, 404, { error: "Surah not found" });
    const existing = db(sql`SELECT * FROM quran_surah_progress WHERE child_id = ${childId} AND surah_id = ${surah.id} LIMIT 1;`)[0] || {};
    const previous = Math.max(0, Math.min(Number(surah.total_verses), Number(existing.memorized_verses || 0)));
    const requested = body.memorizedVerses === undefined ? previous + 1 : Number(body.memorizedVerses);
    const nextCount = Math.max(0, Math.min(Number(surah.total_verses), Number(requested || 0)));
    const versesAdded = Math.max(0, nextCount - previous);
    exec(sql`
      INSERT INTO quran_surah_progress (child_id, surah_id, memorized_verses, surah_bonus_awarded, updated_at)
      VALUES (${childId}, ${surah.id}, ${nextCount}, ${Number(existing.surah_bonus_awarded || 0)}, CURRENT_TIMESTAMP)
      ON CONFLICT(child_id, surah_id) DO UPDATE SET memorized_verses = ${nextCount}, updated_at = CURRENT_TIMESTAMP;
    `);
    if (versesAdded > 0) {
      addPoints(childId, versesAdded, "quran", surah.id, `${surah.surah_name}: ${versesAdded} verse${versesAdded === 1 ? "" : "s"} memorized`);
      exec(sql`INSERT INTO quran_memorization_logs (child_id, surah_id, log_date, verses_added) VALUES (${childId}, ${surah.id}, ${today()}, ${versesAdded});`);
    }
    if (nextCount === Number(surah.total_verses) && !Number(existing.surah_bonus_awarded || 0)) {
      exec(sql`UPDATE quran_surah_progress SET surah_bonus_awarded = 1 WHERE child_id = ${childId} AND surah_id = ${surah.id};`);
      addPoints(childId, 20, "quran_bonus", surah.id, `${surah.surah_name}: Surah completed bonus`);
    }
    const juzAwarded = awardCompletedJuzIfNeeded(childId);
    const nextDashboard = dashboardFor(childId);
    nextDashboard.quranMessage = juzAwarded.length
      ? `Amazing! You completed Juz ${juzAwarded.join(", ")} and earned bonus points.`
      : versesAdded > 0
        ? `Great job! ${versesAdded} verse${versesAdded === 1 ? "" : "s"} memorized.`
        : "Progress updated.";
    return send(res, 200, nextDashboard);
  }
  if (method === "POST" && path === "/api/quran/revise") {
    const childId = childIdFor(req, body.childId);
    smChildForFeature(childId);
    const surah = QURAN_SURAHS.find((item) => Number(item.id) === Number(body.surahId));
    if (!surah) return send(res, 404, { error: "Surah not found" });
    const progress = db(sql`SELECT memorized_verses FROM quran_surah_progress WHERE child_id = ${childId} AND surah_id = ${surah.id} LIMIT 1;`)[0];
    if (!progress || Number(progress.memorized_verses || 0) < Number(surah.total_verses)) {
      return send(res, 400, { error: "Complete this Surah before adding revision." });
    }
    const date = today();
    const existing = db(sql`SELECT id FROM quran_revision_logs WHERE child_id = ${childId} AND surah_id = ${surah.id} AND revision_date = ${date} LIMIT 1;`)[0];
    if (!existing) {
      exec(sql`INSERT INTO quran_revision_logs (child_id, surah_id, revision_date, awarded_points) VALUES (${childId}, ${surah.id}, ${date}, 5);`);
      addPoints(childId, 5, "quran_revision", surah.id, `${surah.surah_name}: revision task`);
    }
    const nextDashboard = dashboardFor(childId);
    nextDashboard.quranMessage = existing ? "This Surah was already revised today." : `Excellent revision. ${surah.surah_name} is getting stronger.`;
    return send(res, 200, nextDashboard);
  }
  if (method === "POST" && path === "/api/quran/favorite") {
    const childId = childIdFor(req, body.childId);
    smChildForFeature(childId);
    const surah = QURAN_SURAHS.find((item) => Number(item.id) === Number(body.surahId));
    if (!surah) return send(res, 404, { error: "Surah not found" });
    if (body.favorite === false) {
      exec(sql`DELETE FROM quran_favorite_surahs WHERE child_id = ${childId} AND surah_id = ${surah.id};`);
    } else {
      exec(sql`INSERT OR IGNORE INTO quran_favorite_surahs (child_id, surah_id) VALUES (${childId}, ${surah.id});`);
    }
    const nextDashboard = dashboardFor(childId);
    nextDashboard.quranMessage = body.favorite === false ? `${surah.surah_name} removed from favorites.` : `${surah.surah_name} added to favorites.`;
    return send(res, 200, nextDashboard);
  }
  if (method === "POST" && path === "/api/hifz/update") {
    return send(res, 410, { error: "Qur’an Hifz Journey has been removed." });
    const user = requireUser(req);
    if (user.role !== "child") return send(res, 403, { error: "Only SM can complete Qur’an Hifz tasks." });
    const childId = user.child_id;
    const child = db(sql`SELECT * FROM children WHERE id = ${childId};`)[0];
    if (!isHifzChild(child)) return send(res, 403, { error: "Qur’an Hifz Tracker is only available for SM." });
    ensureHifzPlan(child);
    const row = db(sql`SELECT * FROM hifz_plan WHERE id = ${Number(body.id)} AND user_id = ${childId} LIMIT 1;`)[0];
    if (!row) return send(res, 404, { error: "Hifz page not found." });
    const nextRow = {
      ...row,
      memorized: body.memorized === undefined ? Number(row.memorized || 0) : boolInt(body.memorized),
      revised: body.revised === undefined ? Number(row.revised || 0) : boolInt(body.revised),
      weekly_review_done: body.weeklyReviewDone === undefined ? Number(row.weekly_review_done || 0) : boolInt(body.weeklyReviewDone),
      juz_review_done: body.juzReviewDone === undefined ? Number(row.juz_review_done || 0) : boolInt(body.juzReviewDone),
      notes: body.notes === undefined ? row.notes || "" : String(body.notes || "").slice(0, 1000)
    };
    if (nextRow.weekly_review_done && Number(row.page_number) % 7 !== 0) nextRow.weekly_review_done = 0;
    if (nextRow.juz_review_done && Number(row.page_in_juz) !== 20) nextRow.juz_review_done = 0;
    const oldPoints = Number(row.points_earned || 0);
    const nextPoints = hifzPointsFor(nextRow);
    const completedAt = nextRow.memorized ? (row.completed_at || new Date().toISOString()) : null;
    const existingRows = db(sql`SELECT * FROM hifz_plan WHERE user_id = ${childId} ORDER BY page_number;`);
    const projectedRows = existingRows.map((item) => item.id === row.id ? { ...item, ...nextRow } : item);
    const projectedStreak = hifzStreakFor(projectedRows);
    const projectedCompletedPages = projectedRows.filter((item) => Number(item.memorized || 0)).length;
    const projectedCompletedJuz = HIFZ_JUZ_ORDER.filter((juz) => projectedRows.filter((item) => Number(item.juz_number) === juz && Number(item.memorized || 0)).length >= HIFZ_PAGES_PER_JUZ);
    const projectedCompletedSurahs = new Set(projectedRows.filter((item) => Number(item.memorized || 0) && item.surah_name && item.surah_name !== "Select Surah").map((item) => item.surah_name)).size;
    const projectedStrongRevision = projectedRows.filter((item) => Number(item.revised || 0)).length >= 7 || projectedRows.some((item) => Number(item.weekly_review_done || 0) || Number(item.juz_review_done || 0));
    const badgesEarned = hifzBadgesFor({
      completedPages: projectedCompletedPages,
      completedSurahs: projectedCompletedSurahs,
      completedJuz: projectedCompletedJuz,
      currentStreak: projectedStreak,
      strongRevision: projectedStrongRevision
    }).filter((badge) => badge.earned).map((badge) => badge.title).join(", ");
    exec(sql`
      UPDATE hifz_plan
      SET memorized = ${nextRow.memorized}, revised = ${nextRow.revised}, weekly_review_done = ${nextRow.weekly_review_done}, juz_review_done = ${nextRow.juz_review_done}, notes = ${nextRow.notes}, points_earned = ${nextPoints}, badges_earned = ${badgesEarned}, streak_count = ${projectedStreak}, completed_at = ${completedAt}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${row.id};
    `);
    const delta = nextPoints - oldPoints;
    if (delta !== 0) addPoints(childId, delta, "quran", row.id, `Hifz page ${row.page_number}`);
    const hifz = hifzPlanFor(child);
    const justCompletedJuz = nextRow.memorized && !Number(row.memorized || 0) && Number(row.page_number) % HIFZ_PAGES_PER_JUZ === 0;
    const sameSurahRows = row.surah_name && row.surah_name !== "Select Surah"
      ? db(sql`SELECT memorized FROM hifz_plan WHERE user_id = ${childId} AND surah_name = ${row.surah_name};`)
      : [];
    const justCompletedSurah = nextRow.memorized && !Number(row.memorized || 0) && sameSurahRows.length > 0 && sameSurahRows.every((item) => Number(item.memorized || 0));
    const nextDashboard = dashboardFor(childId);
    const justCompletedWeekly = nextRow.weekly_review_done && !Number(row.weekly_review_done || 0);
    const justCompletedJuzReview = nextRow.juz_review_done && !Number(row.juz_review_done || 0);
    nextDashboard.hifzMessage = Number(hifz.total_pages_memorized || 0) >= HIFZ_TOTAL_PAGES
      ? "SubhanAllah! 10 Juz completed."
      : justCompletedJuz
      ? `Amazing! Juz ${row.juz_number} completed.`
      : justCompletedSurah
        ? `Wonderful! ${row.surah_name} completed.`
      : justCompletedJuzReview
        ? `Strong revision! Juz ${row.juz_number} review completed.`
      : justCompletedWeekly
        ? "Excellent weekly review. Your memorization is getting stronger."
      : nextRow.memorized && nextRow.revised
        ? "Excellent! Memorization and revision completed today."
        : nextRow.memorized
          ? `Page ${row.page_number} memorized.`
          : "Hifz plan updated.";
    nextDashboard.hifzCelebration = Number(hifz.total_pages_memorized || 0) >= HIFZ_TOTAL_PAGES ? "final" : justCompletedJuz ? "juz" : justCompletedSurah ? "surah" : delta > 0 ? "page" : "";
    nextDashboard.hifz = hifz;
    return send(res, 200, nextDashboard);
  }
  if (method === "POST" && path === "/api/hifz/parent-update") {
    return send(res, 410, { error: "Qur’an Hifz Journey has been removed." });
    requireParent(req);
    const row = db(sql`SELECT hp.*, c.name AS child_name FROM hifz_plan hp JOIN children c ON c.id = hp.user_id WHERE hp.id = ${Number(body.id)} LIMIT 1;`)[0];
    if (!row || row.child_name !== HIFZ_CHILD_NAME) return send(res, 404, { error: "SM Hifz page not found." });
    exec(sql`
      UPDATE hifz_plan
      SET parent_reviewed = ${body.parentReviewed === undefined ? Number(row.parent_reviewed || 0) : boolInt(body.parentReviewed)},
        parent_notes = ${body.parentNotes === undefined ? row.parent_notes || "" : String(body.parentNotes || "").slice(0, 1000)},
        surah_name = ${body.surahName === undefined ? row.surah_name || "Select Surah" : String(body.surahName || "Select Surah").slice(0, 160)},
        surah_name_english = ${body.surahName === undefined ? row.surah_name_english || row.surah_name || "Select Surah" : String(body.surahName || "Select Surah").slice(0, 160)},
        surah_name_arabic = ${body.surahNameArabic === undefined ? row.surah_name_arabic || "" : String(body.surahNameArabic || "").slice(0, 160)},
        surah_number = ${body.surahNumber === undefined ? row.surah_number || "" : String(body.surahNumber || "").slice(0, 40)},
        ayah_range = ${body.ayahRange === undefined ? row.ayah_range || "" : String(body.ayahRange || "").slice(0, 160)},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${row.id};
    `);
    return send(res, 200, { ok: true, hifz: hifzPlanFor(db(sql`SELECT * FROM children WHERE id = ${row.user_id};`)[0]) });
  }
  if (method === "POST" && path === "/api/activities") {
    requireParent(req);
    const days = [0, 1, 2, 3, 4, 5, 6].map((day) => body[`day_${day}`] !== undefined ? boolInt(body[`day_${day}`]) : (day === 0 || day === 6 ? boolInt(body.show_weekends) : boolInt(body.show_weekdays !== false)));
    const showWeekdays = days.slice(1, 6).some(Boolean) ? 1 : 0;
    const showWeekends = days[0] || days[6] ? 1 : 0;
    exec(sql`INSERT INTO activities (title, description, points, duration_minutes, frequency, show_weekdays, show_weekends, day_0, day_1, day_2, day_3, day_4, day_5, day_6, task_date, proof_required, requires_approval) VALUES (${body.title}, ${body.description}, ${Number(body.points)}, ${Number(body.duration_minutes || 0)}, ${body.frequency}, ${showWeekdays}, ${showWeekends}, ${days[0]}, ${days[1]}, ${days[2]}, ${days[3]}, ${days[4]}, ${days[5]}, ${days[6]}, ${body.task_date || null}, ${body.proof_required ? 1 : 0}, ${body.requires_approval ? 1 : 0});`);
    return send(res, 201, { ok: true });
  }
  if (method === "PUT" && path.startsWith("/api/activities/")) {
    requireParent(req);
    const id = Number(path.split("/").pop());
    const days = [0, 1, 2, 3, 4, 5, 6].map((day) => body[`day_${day}`] !== undefined ? boolInt(body[`day_${day}`]) : (day === 0 || day === 6 ? boolInt(body.show_weekends) : boolInt(body.show_weekdays)));
    const showWeekdays = days.slice(1, 6).some(Boolean) ? 1 : 0;
    const showWeekends = days[0] || days[6] ? 1 : 0;
    exec(sql`UPDATE activities SET title = ${body.title}, description = ${body.description}, points = ${Number(body.points)}, duration_minutes = ${Number(body.duration_minutes || 0)}, frequency = ${body.frequency}, show_weekdays = ${showWeekdays}, show_weekends = ${showWeekends}, day_0 = ${days[0]}, day_1 = ${days[1]}, day_2 = ${days[2]}, day_3 = ${days[3]}, day_4 = ${days[4]}, day_5 = ${days[5]}, day_6 = ${days[6]}, task_date = ${body.task_date || null}, proof_required = ${body.proof_required ? 1 : 0}, requires_approval = ${body.requires_approval ? 1 : 0} WHERE id = ${id};`);
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/today-task") {
    requireParent(req);
    const childId = Number(body.childId);
    const child = db(sql`SELECT id FROM children WHERE id = ${childId};`)[0];
    if (!child) return send(res, 400, { error: "Choose a child for this task" });
    const title = String(body.title || "").trim();
    if (!title) return send(res, 400, { error: "Task title is required" });
    const date = today();
    const days = [0, 0, 0, 0, 0, 0, 0];
    days[new Date(`${date}T12:00:00`).getDay()] = 1;
    exec(sql`
      INSERT INTO activities (title, description, points, duration_minutes, frequency, show_weekdays, show_weekends, day_0, day_1, day_2, day_3, day_4, day_5, day_6, task_date, proof_required, requires_approval)
      VALUES (${title}, ${body.description || "Special task for today."}, ${Number(body.points || 5)}, ${Number(body.duration_minutes || 0)}, 'one-time', ${days.slice(1, 6).some(Boolean) ? 1 : 0}, ${days[0] || days[6] ? 1 : 0}, ${days[0]}, ${days[1]}, ${days[2]}, ${days[3]}, ${days[4]}, ${days[5]}, ${days[6]}, ${date}, ${body.proof_required ? 1 : 0}, ${body.requires_approval ? 1 : 0});
    `);
    const activity = db("SELECT id FROM activities ORDER BY id DESC LIMIT 1;")[0];
    exec(sql`
      INSERT OR IGNORE INTO activity_assignments (child_id, activity_id, enabled)
      SELECT id, ${activity.id}, CASE WHEN id = ${childId} THEN 1 ELSE 0 END FROM children;
    `);
    return send(res, 201, { ok: true });
  }
  if (method === "POST" && path === "/api/treasure/open") {
    const childId = childIdFor(req, body.childId);
    const state = treasureFor(childId);
    if (!state.ready) return send(res, 400, { error: `Complete ${state.needed} more mission(s) to open the treasure chest.` });
    if (state.opened) return send(res, 200, dashboardFor(childId));
    const date = today();
    const rewards = [
      { reward_type: "points", reward_value: 10, message: "You found 10 bonus points!" },
      { reward_type: "points", reward_value: 15, message: "Amazing! You found 15 bonus points!" },
      { reward_type: "badge", reward_value: 0, message: "You found a treasure badge!" }
    ];
    const selected = rewards[(Number(date.replaceAll("-", "")) + childId) % rewards.length];
    exec(sql`INSERT INTO treasure_chests (child_id, chest_date, reward_type, reward_value, message) VALUES (${childId}, ${date}, ${selected.reward_type}, ${selected.reward_value}, ${selected.message});`);
    if (selected.reward_type === "points") addPoints(childId, selected.reward_value, "treasure", 0, selected.message);
    if (selected.reward_type === "badge") {
      exec(sql`INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon) VALUES (${childId}, ${date}, ${-900000 - childId}, 'Treasure Finder', '🧰');`);
    }
    return send(res, 200, dashboardFor(childId));
  }
  if (method === "POST" && path === "/api/mystery/open") {
    const childId = childIdFor(req, body.childId);
    const state = mysteryBoxFor(childId);
    if (!state.ready) return send(res, 400, { error: `Complete ${state.needed} more activity(s) to open the mystery box.` });
    if (state.opened) return send(res, 200, dashboardFor(childId));
    const date = today();
    const rewards = [
      { reward_type: "points", reward_value: 10, message: "Mystery box: 10 bonus points!" },
      { reward_type: "points", reward_value: 15, message: "Mystery box: 15 bonus points!" },
      { reward_type: "power_up", reward_value: 0, power_type: "point_bonus", message: "Mystery box: Double Points power-up!" },
      { reward_type: "power_up", reward_value: 0, power_type: "reward_discount", message: "Mystery box: 10% Reward Discount power-up!" },
      { reward_type: "power_up", reward_value: 0, power_type: "instant_points", message: "Mystery box: Bonus Coins power-up!" }
    ];
    const selected = rewards[(Number(date.replaceAll("-", "")) + childId * 3) % rewards.length];
    exec(sql`
      INSERT INTO mystery_boxes (child_id, box_date, reward_type, reward_value, message)
      VALUES (${childId}, ${date}, ${selected.reward_type}, ${selected.reward_value}, ${selected.message});
    `);
    if (selected.reward_type === "points") addPoints(childId, selected.reward_value, "mystery_box", 0, selected.message);
    if (selected.reward_type === "power_up") awardPowerUp(childId, selected.power_type);
    return send(res, 200, dashboardFor(childId));
  }
  if (method === "POST" && path === "/api/power-ups/use") {
    const childId = childIdFor(req, body.childId);
    const power = db(sql`SELECT * FROM power_ups WHERE id = ${Number(body.powerUpId)} AND child_id = ${childId} AND status IN ('owned','active') LIMIT 1;`)[0];
    if (!power) return send(res, 404, { error: "Power-up not found" });
    if (power.power_type === "instant_points") {
      addPoints(childId, Number(power.value || 10), "power_up", power.id, power.title);
      exec(sql`UPDATE power_ups SET status = 'used', used_at = CURRENT_TIMESTAMP WHERE id = ${power.id};`);
      return send(res, 200, dashboardFor(childId));
    }
    exec(sql`
      UPDATE power_ups SET status = 'owned' WHERE child_id = ${childId} AND power_type = ${power.power_type} AND status = 'active';
      UPDATE power_ups SET status = 'active' WHERE id = ${power.id};
    `);
    return send(res, 200, dashboardFor(childId));
  }
  if (method === "POST" && path === "/api/reflections") {
    const childId = childIdFor(req, body.childId);
    const enjoyed = String(body.enjoyed_activity || "").trim();
    const feeling = String(body.feeling || "").trim();
    const note = String(body.note || "").trim().slice(0, 500);
    if (!enjoyed || !feeling) return send(res, 400, { error: "Choose what you enjoyed and how you felt." });
    exec(sql`
      INSERT INTO child_reflections (child_id, reflection_date, enjoyed_activity, feeling, note)
      VALUES (${childId}, ${today()}, ${enjoyed}, ${feeling}, ${note})
      ON CONFLICT(child_id, reflection_date) DO UPDATE SET
        enjoyed_activity = ${enjoyed},
        feeling = ${feeling},
        note = ${note},
        created_at = CURRENT_TIMESTAMP;
    `);
    return send(res, 200, dashboardFor(childId));
  }
  if (method === "POST" && path === "/api/early-bird") {
    const childId = childIdFor(req, body.childId);
    const date = today();
    const existing = db(sql`SELECT * FROM early_bird_checkins WHERE child_id = ${childId} AND checkin_date = ${date} LIMIT 1;`)[0];
    if (existing) {
      const message = existing.status === "early"
        ? "You already got your Early Bird bonus today."
        : "You already checked in today. Tomorrow is a fresh chance.";
      return send(res, 200, { ...dashboardFor(childId), earlyBirdMessage: message });
    }
    const time = localTimeString();
    const isEarly = time < "07:00";
    const points = isEarly ? 20 : 0;
    exec(sql`
      INSERT INTO early_bird_checkins (child_id, checkin_date, checkin_time, status, awarded_points)
      VALUES (${childId}, ${date}, ${time}, ${isEarly ? "early" : "late"}, ${points});
    `);
    if (isEarly) addPoints(childId, points, "early_bird", 0, "Early Bird bonus");
    const message = isEarly
      ? "Early Bird! You earned 20 points for waking up before 7:00 AM."
      : "You got up late this morning. Tomorrow is a new chance.";
    return send(res, 200, { ...dashboardFor(childId), earlyBirdMessage: message });
  }
  if (method === "POST" && path === "/api/parent-challenges") {
    requireParent(req);
    const title = String(body.title || "").trim();
    if (!title) return send(res, 400, { error: "Challenge title is required" });
    exec(sql`
      INSERT INTO parent_challenges (title, description, target_count, bonus_points, start_date, end_date, child_id)
      VALUES (${title}, ${body.description || "Complete the challenge goal."}, ${Number(body.target_count || 3)}, ${Number(body.bonus_points || 10)}, ${body.start_date || today()}, ${body.end_date || today()}, ${body.child_id ? Number(body.child_id) : null});
    `);
    return send(res, 201, { ok: true });
  }
  if (method === "DELETE" && path.startsWith("/api/activities/")) {
    requireParent(req);
    exec(sql`UPDATE activities SET active = 0 WHERE id = ${Number(path.split("/").pop())};`);
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/rewards") {
    requireParent(req);
    exec(sql`INSERT INTO rewards (title, description, required_points) VALUES (${body.title}, ${body.description}, ${Number(body.required_points)});`);
    return send(res, 201, { ok: true });
  }
  if (method === "PUT" && path.startsWith("/api/rewards/")) {
    requireParent(req);
    const id = Number(path.split("/").pop());
    exec(sql`UPDATE rewards SET title = ${body.title}, description = ${body.description}, required_points = ${Number(body.required_points)} WHERE id = ${id};`);
    return send(res, 200, { ok: true });
  }
  if (method === "DELETE" && path.startsWith("/api/rewards/")) {
    requireParent(req);
    exec(sql`UPDATE rewards SET active = 0 WHERE id = ${Number(path.split("/").pop())};`);
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/approvals") {
    requireParent(req);
    const log = db(sql`SELECT * FROM activity_logs WHERE id = ${body.logId};`)[0];
    const activity = db(sql`SELECT * FROM activities WHERE id = ${log.activity_id};`)[0];
    const status = body.approved ? "approved" : "rejected";
    exec(sql`UPDATE activity_logs SET status = ${status}, updated_at = CURRENT_TIMESTAMP WHERE id = ${log.id};`);
    if (body.approved) awardActivityIfNeeded({ ...log, status: "approved" }, activity);
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/reward-approvals") {
    requireParent(req);
    const request = db(sql`SELECT * FROM reward_redemptions WHERE id = ${body.redemptionId};`)[0];
    if (!request) return send(res, 404, { error: "Reward request not found" });
    if (!body.approved) {
      exec(sql`UPDATE reward_redemptions SET status = 'rejected' WHERE id = ${request.id};`);
      return send(res, 200, { ok: true });
    }
    const child = db(sql`SELECT * FROM children WHERE id = ${request.child_id};`)[0];
    if (child.total_points < request.points_spent) return send(res, 400, { error: "Child does not have enough points anymore" });
    exec(sql`UPDATE reward_redemptions SET status = 'redeemed' WHERE id = ${request.id};`);
    addPoints(request.child_id, -request.points_spent, "reward", request.reward_id, "Reward approved and redeemed");
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/redeem") {
    const childId = childIdFor(req, body.childId);
    const child = db(sql`SELECT * FROM children WHERE id = ${childId};`)[0];
    const reward = db(sql`SELECT * FROM rewards WHERE id = ${body.rewardId} AND active = 1;`)[0];
    if (!reward) return send(res, 404, { error: "Reward not found" });
    const discount = rewardDiscountsOfPeriod().find((item) => Number(item.id) === Number(reward.id));
    let pointsToSpend = discount && Number(discount.id) === Number(reward.id)
      ? Math.ceil(reward.required_points * (100 - discount.discount_percent) / 100)
      : reward.required_points;
    const powerDiscount = db(sql`
      SELECT *
      FROM power_ups
      WHERE child_id = ${childId} AND power_type = 'reward_discount' AND status = 'active'
      ORDER BY earned_at ASC
      LIMIT 1;
    `)[0];
    if (powerDiscount) {
      pointsToSpend = Math.ceil(pointsToSpend * (100 - Number(powerDiscount.value || 10)) / 100);
    }
    if (db(sql`SELECT id FROM reward_redemptions WHERE child_id = ${childId} AND reward_id = ${reward.id} AND status = 'pending' LIMIT 1;`)[0]) {
      return send(res, 400, { error: "This reward is already waiting for parent approval." });
    }
    if (child.total_points < pointsToSpend) return send(res, 400, { error: "Not enough points yet. Keep going!" });
    exec(sql`INSERT INTO reward_redemptions (child_id, reward_id, points_spent, status) VALUES (${childId}, ${reward.id}, ${pointsToSpend}, 'pending');`);
    if (powerDiscount) {
      exec(sql`UPDATE power_ups SET status = 'used', used_at = CURRENT_TIMESTAMP WHERE id = ${powerDiscount.id};`);
    }
    return send(res, 200, dashboardFor(childId));
  }
  if (method === "GET" && path === "/api/backup") {
    requireParent(req);
    return send(res, 200, {
      exported_at: new Date().toISOString(),
      users: db("SELECT id, name, email, password_hash, role, child_id, created_at FROM users ORDER BY id;"),
      children: db("SELECT * FROM children ORDER BY id;"),
      activities: db("SELECT * FROM activities ORDER BY id;"),
      activity_logs: db("SELECT * FROM activity_logs ORDER BY id;"),
      activity_assignments: db("SELECT * FROM activity_assignments ORDER BY child_id, activity_id;"),
      rewards: db("SELECT * FROM rewards ORDER BY id;"),
      reward_redemptions: db("SELECT * FROM reward_redemptions ORDER BY id;"),
      point_transactions: db("SELECT * FROM point_transactions ORDER BY id;"),
      daily_challenges: db("SELECT * FROM daily_challenges ORDER BY challenge_date;"),
      badges: db("SELECT * FROM badges ORDER BY id;"),
      daily_challenge_completions: db("SELECT * FROM daily_challenge_completions ORDER BY id;"),
      reward_discounts: db("SELECT * FROM reward_discounts ORDER BY period_key;"),
      family_quest_awards: db("SELECT * FROM family_quest_awards ORDER BY id;"),
      avatar_items: db("SELECT * FROM avatar_items ORDER BY id;"),
      avatar_purchases: db("SELECT * FROM avatar_purchases ORDER BY id;"),
      treasure_chests: db("SELECT * FROM treasure_chests ORDER BY id;"),
      parent_challenges: db("SELECT * FROM parent_challenges ORDER BY id;"),
      parent_challenge_awards: db("SELECT * FROM parent_challenge_awards ORDER BY id;"),
      power_ups: db("SELECT * FROM power_ups ORDER BY id;"),
      mystery_boxes: db("SELECT * FROM mystery_boxes ORDER BY id;"),
      child_reflections: db("SELECT * FROM child_reflections ORDER BY id;"),
      early_bird_checkins: db("SELECT * FROM early_bird_checkins ORDER BY id;"),
      quran_favorite_surahs: db("SELECT * FROM quran_favorite_surahs ORDER BY child_id, surah_id;"),
      quran_revision_logs: db("SELECT * FROM quran_revision_logs ORDER BY id;"),
      quran_surah_progress: db("SELECT * FROM quran_surah_progress ORDER BY child_id, surah_id;"),
      quran_juz_awards: db("SELECT * FROM quran_juz_awards ORDER BY child_id, juz_number;"),
      quran_memorization_logs: db("SELECT * FROM quran_memorization_logs ORDER BY id;"),
      hifz_plan: db("SELECT * FROM hifz_plan ORDER BY user_id, page_number;")
    });
  }
  if (method === "POST" && path === "/api/restore") {
    requireParent(req);
    restoreBackup(body);
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: "Not found" });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = normalize(join(STATIC_DIR, requested));
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  try {
    const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".jsx": "text/babel" }[extname(filePath)] || "text/plain";
    const file = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": mime });
    res.end(file);
  } catch {
    if (res.headersSent) return;
    res.writeHead(404);
    res.end("Not found");
  }
}
const PORT = process.env.PORT || 3002;
const HOST = "0.0.0.0";

initDb();

createServer(async (req, res) => {
  try {
    const path = new URL(req.url, `http://${req.headers.host}`).pathname;

    if (path.startsWith("/api/")) {
      return await api(req, res, path);
    }

    serveStatic(req, res);

  } catch (error) {
    if (!res.headersSent) {
      send(res, error.status || 500, {
        error: error.message || "Server error"
      });
    }
  }
}).listen(PORT, HOST, () => {
  console.log(`Kids Performance Tracker running at http://${HOST}:${PORT}`);
});