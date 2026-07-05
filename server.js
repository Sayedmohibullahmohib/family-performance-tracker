import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { SEERAH_CATEGORY_KEY, SEERAH_CATEGORY_NAME, SEERAH_QUESTIONS } from "./seerahQuizData.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DATA_DIR = join(__dirname, "data");
const DB_PATH = join(DATA_DIR, "app.db");
const STATIC_DIR = join(__dirname, "static");
const SPORTS_VIDEO_DIR = join(STATIC_DIR, "media", "sports-videos");
const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const TOKEN_SECRET = process.env.TOKEN_SECRET || "change-this-secret-before-hosting";
const SQLITE_MAX_BUFFER = 200 * 1024 * 1024;

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(SPORTS_VIDEO_DIR)) mkdirSync(SPORTS_VIDEO_DIR, { recursive: true });

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
  const result = spawnSync("sqlite3", ["-json", DB_PATH, query], { encoding: "utf8", maxBuffer: SQLITE_MAX_BUFFER });
  if (result.status !== 0) throw new Error(result.stderr || "SQLite command failed");
  return result.stdout.trim() ? JSON.parse(result.stdout) : [];
}

function exec(query) {
  const result = spawnSync("sqlite3", [DB_PATH], { input: query, encoding: "utf8", maxBuffer: SQLITE_MAX_BUFFER });
  if (result.status !== 0) throw new Error(result.stderr || "SQLite command failed");
}

function columnExists(table, column) {
  return db(`PRAGMA table_info(${table});`).some((item) => item.name === column);
}

function boolInt(value) {
  return value ? 1 : 0;
}

function hashCode(value) {
  return String(value || "").split("").reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
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
const PRAYER_WINDOWS = {};
const SPORTS_SUBJECT = "Sports & Physical Development";
const SPORTS_BADGES = [
  { title: "Strong Legs Hero", icon: "🦵", description: "Complete 5 leg strength activities.", category: "Leg Strength", target: 5 },
  { title: "Speed Star", icon: "⚡", description: "Complete 5 speed and agility activities.", category: "Speed & Agility", target: 5 },
  { title: "Balance Champion", icon: "⚖️", description: "Complete 5 balance and coordination activities.", category: "Balance & Coordination", target: 5 },
  { title: "Fitness Explorer", icon: "🏃", description: "Complete 10 sports activities.", target: 10 },
  { title: "Daily Mover", icon: "🌟", description: "Complete a full daily sports session.", dailySession: true, target: 1 },
  { title: "Weekly Sports Winner", icon: "🏅", description: "Complete 5 sports activities this week.", weekly: true, target: 5 },
  { title: "Sports Master", icon: "🏆", description: "Complete 30 sports activities.", target: 30 },
  { title: "Healthy Lifestyle Champion", icon: "💚", description: "Complete 60 sports activities.", target: 60 }
];

const SPORTS_ACTIVITIES = [
  ["Marching in place", "Warm up by marching gently and lifting your knees.", "1 minute", "Easy", 5, "Warm-up", "march", 1, [1, 2, 3, 4, 5]],
  ["Light jogging in place", "Jog softly in one spot and keep breathing calmly.", "1 minute", "Easy", 5, "Warm-up", "jog", 1, [1, 2, 3, 4, 5]],
  ["Jumping jacks", "Jump out, clap up, jump back in, and smile.", "15 reps", "Medium", 10, "Warm-up", "jumping-jacks", 1, [1, 3, 5]],
  ["Arm circles", "Make small and big circles with both arms.", "30 seconds each way", "Easy", 5, "Warm-up", "arm-circles", 1, [2, 4]],
  ["Squats", "Bend your knees like sitting on a chair, then stand tall.", "10 reps", "Medium", 10, "Leg Strength", "squats", 2, [1, 3, 5]],
  ["Wall sit", "Lean on a wall and sit like an invisible chair.", "30 seconds", "Hard", 15, "Leg Strength", "wall-sit", 2, [2, 4]],
  ["Lunges", "Step forward, bend both knees, then switch legs.", "8 each leg", "Hard", 15, "Leg Strength", "lunges", 3, [1, 4]],
  ["Calf raises", "Stand tall and lift your heels up and down.", "15 reps", "Easy", 5, "Leg Strength", "calf-raises", 1, [2, 5]],
  ["Step-ups on stairs", "Step up and down safely on a low stair.", "10 each leg", "Medium", 10, "Leg Strength", "step-ups", 2, [3, 6]],
  ["Glute bridges", "Lie down, bend knees, and lift your hips gently.", "12 reps", "Medium", 10, "Leg Strength", "glute-bridges", 2, [0, 4]],
  ["Fast feet running in place", "Move your feet quickly like a football player.", "20 seconds", "Medium", 10, "Speed & Agility", "fast-feet", 1, [1, 3, 5]],
  ["Shuttle run", "Run to a marker, come back, and repeat safely.", "4 rounds", "Hard", 15, "Speed & Agility", "shuttle-run", 3, [2, 5]],
  ["Side-to-side jumps", "Jump gently from side to side with soft knees.", "20 jumps", "Medium", 10, "Speed & Agility", "side-jumps", 2, [1, 4]],
  ["High knees", "Run in place while lifting knees high.", "30 seconds", "Medium", 10, "Speed & Agility", "high-knees", 1, [2, 4, 6]],
  ["Zigzag run using bottles or cones", "Run around safe markers in a zigzag path.", "3 rounds", "Hard", 15, "Speed & Agility", "zigzag-run", 3, [3, 6]],
  ["Short sprint challenge", "Sprint a short safe distance and walk back.", "5 sprints", "Hard", 15, "Speed & Agility", "sprint", 3, [0, 5]],
  ["Stand on one leg", "Balance on one leg, then switch sides.", "20 seconds each leg", "Easy", 5, "Balance & Coordination", "one-leg-balance", 1, [1, 3, 5]],
  ["Heel-to-toe walking", "Walk in a straight line, heel touching toe.", "10 steps", "Easy", 5, "Balance & Coordination", "heel-to-toe", 1, [2, 4]],
  ["Jump and freeze", "Jump once and freeze like a statue.", "10 jumps", "Easy", 5, "Balance & Coordination", "jump-freeze", 1, [1, 5]],
  ["Single-leg jumps", "Hop gently on one foot, then switch.", "8 each leg", "Medium", 10, "Balance & Coordination", "single-leg-jumps", 2, [3, 6]],
  ["Bear walk", "Walk on hands and feet like a strong bear.", "20 seconds", "Hard", 15, "Balance & Coordination", "bear-walk", 3, [2, 5]],
  ["Frog jump", "Squat low and jump forward like a frog.", "10 jumps", "Medium", 10, "Balance & Coordination", "frog-jump", 2, [0, 4]],
  ["Crab walk", "Sit, lift your body, and walk carefully.", "20 seconds", "Hard", 15, "Balance & Coordination", "crab-walk", 3, [1, 6]]
];

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

const QURAN_SURAH_ARABIC_NAMES = [
  "الفاتحة", "البقرة", "آل عمران", "النساء", "المائدة", "الأنعام", "الأعراف", "الأنفال", "التوبة", "يونس",
  "هود", "يوسف", "الرعد", "إبراهيم", "الحجر", "النحل", "الإسراء", "الكهف", "مريم", "طه",
  "الأنبياء", "الحج", "المؤمنون", "النور", "الفرقان", "الشعراء", "النمل", "القصص", "العنكبوت", "الروم",
  "لقمان", "السجدة", "الأحزاب", "سبأ", "فاطر", "يس", "الصافات", "ص", "الزمر", "غافر",
  "فصلت", "الشورى", "الزخرف", "الدخان", "الجاثية", "الأحقاف", "محمد", "الفتح", "الحجرات", "ق",
  "الذاريات", "الطور", "النجم", "القمر", "الرحمن", "الواقعة", "الحديد", "المجادلة", "الحشر", "الممتحنة",
  "الصف", "الجمعة", "المنافقون", "التغابن", "الطلاق", "التحريم", "الملك", "القلم", "الحاقة", "المعارج",
  "نوح", "الجن", "المزمل", "المدثر", "القيامة", "الإنسان", "المرسلات", "النبأ", "النازعات", "عبس",
  "التكوير", "الإنفطار", "المطففين", "الإنشقاق", "البروج", "الطارق", "الأعلى", "الغاشية", "الفجر", "البلد",
  "الشمس", "الليل", "الضحى", "الشرح", "التين", "العلق", "القدر", "البينة", "الزلزلة", "العاديات",
  "القارعة", "التكاثر", "العصر", "الهمزة", "الفيل", "قريش", "الماعون", "الكوثر", "الكافرون", "النصر",
  "المسد", "الإخلاص", "الفلق", "الناس"
];

function quranSurahMeta(surahId) {
  const surah = QURAN_SURAHS.find((item) => Number(item.id) === Number(surahId));
  if (!surah) return null;
  return {
    surah_number: Number(surah.id),
    surah_name_arabic: QURAN_SURAH_ARABIC_NAMES[Number(surah.id) - 1] || surah.surah_name,
    surah_name_english: surah.surah_name,
    ayah_count: Number(surah.total_verses),
    possible_hasanat: Number(surah.total_verses) * 10
  };
}

const QURAN_READING_BADGES = [
  { title: "First Surah Completed", icon: "📖", target: 1 },
  { title: "10 Surahs Completed", icon: "🌟", target: 10 },
  { title: "25 Surahs Completed", icon: "🏅", target: 25 },
  { title: "50 Surahs Completed", icon: "🏆", target: 50 },
  { title: "100 Surahs Completed", icon: "💎", target: 100 },
  { title: "Juz Amma Champion", icon: "🌙", target: "juz-amma" },
  { title: "Quran Reading Star", icon: "⭐", target: 5 },
  { title: "Ayah Master", icon: "✨", target: "ayah-master" }
];

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
      role TEXT NOT NULL CHECK(role IN ('admin','parent','child')),
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
    CREATE TABLE IF NOT EXISTS activity_daily_skips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      activity_id INTEGER NOT NULL,
      skip_date TEXT NOT NULL,
      reason TEXT DEFAULT '',
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(child_id, activity_id, skip_date),
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
    CREATE TABLE IF NOT EXISTS quran_reading_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      surah_id INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0,
      target_date TEXT,
      priority TEXT DEFAULT 'normal',
      private_notes TEXT DEFAULT '',
      status TEXT DEFAULT 'assigned' CHECK(status IN ('assigned','submitted','approved','repeat')),
      child_submitted_at TEXT,
      parent_feedback TEXT DEFAULT '',
      encouragement TEXT DEFAULT '',
      approved_at TEXT,
      approved_by INTEGER,
      hasanat_awarded INTEGER DEFAULT 0,
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(child_id, surah_id),
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
    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT 'Reading',
      quiz_type TEXT NOT NULL DEFAULT 'select_3',
      instructions TEXT DEFAULT '',
      difficulty TEXT DEFAULT 'easy' CHECK(difficulty IN ('easy','medium','hard')),
      level INTEGER DEFAULT 1,
      question_text TEXT NOT NULL,
      story_text TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      audio_url TEXT DEFAULT '',
      emoji_prompt TEXT DEFAULT '',
      options TEXT DEFAULT '[]',
      correct_answer TEXT DEFAULT '',
      multiple_correct_answers TEXT DEFAULT '[]',
      explanation TEXT DEFAULT '',
      timer_seconds INTEGER DEFAULT 0,
      hearts INTEGER DEFAULT 0,
      required_score_to_pass INTEGER DEFAULT 1,
      xp_reward INTEGER DEFAULT 0,
      coin_reward INTEGER DEFAULT 0,
      badge_reward TEXT DEFAULT '',
      unlock_next_level INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive')),
      created_by_parent_id INTEGER NOT NULL,
      assigned_to_kid_id INTEGER,
      due_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by_parent_id) REFERENCES users(id),
      FOREIGN KEY(assigned_to_kid_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      kid_id INTEGER NOT NULL,
      parent_id INTEGER NOT NULL,
      answer TEXT DEFAULT '',
      selected_answers TEXT DEFAULT '[]',
      score INTEGER DEFAULT 0,
      passed INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 1,
      time_used_seconds INTEGER DEFAULT 0,
      hearts_left INTEGER DEFAULT 0,
      streak_bonus INTEGER DEFAULT 0,
      xp_earned INTEGER DEFAULT 0,
      coins_earned INTEGER DEFAULT 0,
      completed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      feedback TEXT DEFAULT '',
      FOREIGN KEY(quiz_id) REFERENCES quizzes(id),
      FOREIGN KEY(kid_id) REFERENCES children(id),
      FOREIGN KEY(parent_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS quiz_category_assignments (
      category_key TEXT NOT NULL,
      child_id INTEGER NOT NULL,
      assigned_by_parent_id INTEGER NOT NULL,
      enabled INTEGER DEFAULT 1,
      assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(category_key, child_id),
      FOREIGN KEY(child_id) REFERENCES children(id),
      FOREIGN KEY(assigned_by_parent_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS child_wallets (
      child_id INTEGER PRIMARY KEY,
      xp INTEGER DEFAULT 0,
      coins INTEGER DEFAULT 0,
      gems INTEGER DEFAULT 0,
      keys INTEGER DEFAULT 0,
      treasure_tickets INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS seerah_quiz_progress (
      child_id INTEGER PRIMARY KEY,
      current_question INTEGER DEFAULT 1,
      current_level INTEGER DEFAULT 1,
      questions_completed_in_level INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS seerah_review_settings (
      child_id INTEGER PRIMARY KEY,
      enabled INTEGER DEFAULT 1,
      question_count INTEGER DEFAULT 10,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS seerah_review_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      review_date TEXT NOT NULL,
      status TEXT DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','completed')),
      total_questions INTEGER DEFAULT 0,
      current_index INTEGER DEFAULT 0,
      correct_answers INTEGER DEFAULT 0,
      wrong_answers INTEGER DEFAULT 0,
      hasnat_earned INTEGER DEFAULT 0,
      completion_bonus INTEGER DEFAULT 0,
      perfect_bonus INTEGER DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(child_id, review_date),
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS seerah_review_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      quiz_id INTEGER NOT NULL,
      option_order TEXT DEFAULT '[]',
      answer TEXT DEFAULT '',
      correct INTEGER,
      hasnat_earned INTEGER DEFAULT 0,
      answered_at TEXT,
      UNIQUE(session_id, position),
      FOREIGN KEY(session_id) REFERENCES seerah_review_sessions(id),
      FOREIGN KEY(quiz_id) REFERENCES quizzes(id)
    );
    CREATE TABLE IF NOT EXISTS seerah_review_practice (
      child_id INTEGER NOT NULL,
      quiz_id INTEGER NOT NULL,
      wrong_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 0,
      last_wrong_at TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(child_id, quiz_id),
      FOREIGN KEY(child_id) REFERENCES children(id),
      FOREIGN KEY(quiz_id) REFERENCES quizzes(id)
    );
    CREATE TABLE IF NOT EXISTS streak_recovery_settings (
      child_id INTEGER PRIMARY KEY,
      enabled INTEGER DEFAULT 1,
      max_shields INTEGER DEFAULT 3,
      recovery_difficulty TEXT DEFAULT 'normal',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS streak_states (
      child_id INTEGER PRIMARY KEY,
      current_streak INTEGER DEFAULT 0,
      shields INTEGER DEFAULT 0,
      last_active_date TEXT,
      last_processed_date TEXT,
      active_days_since_shield INTEGER DEFAULT 0,
      tree_points INTEGER DEFAULT 0,
      tree_health INTEGER DEFAULT 100,
      recovery_status TEXT DEFAULT 'none' CHECK(recovery_status IN ('none','active')),
      missed_days INTEGER DEFAULT 0,
      recovery_required INTEGER DEFAULT 0,
      recovery_completed INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS streak_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      event_date TEXT NOT NULL,
      event_type TEXT NOT NULL,
      streak_before INTEGER DEFAULT 0,
      streak_after INTEGER DEFAULT 0,
      shields_before INTEGER DEFAULT 0,
      shields_after INTEGER DEFAULT 0,
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS recovery_missions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      recovery_key TEXT NOT NULL,
      mission_type TEXT NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      completed_at TEXT,
      source_type TEXT DEFAULT '',
      source_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(child_id, recovery_key, mission_type),
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS rescue_quiz_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      recovery_key TEXT NOT NULL,
      status TEXT DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed','failed')),
      total_questions INTEGER DEFAULT 5,
      current_index INTEGER DEFAULT 0,
      correct_answers INTEGER DEFAULT 0,
      passed INTEGER DEFAULT 0,
      hasnat_earned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      UNIQUE(child_id, recovery_key),
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS rescue_quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      quiz_id INTEGER NOT NULL,
      option_order TEXT DEFAULT '[]',
      answer TEXT DEFAULT '',
      correct INTEGER,
      answered_at TEXT,
      UNIQUE(session_id, position),
      FOREIGN KEY(session_id) REFERENCES rescue_quiz_sessions(id),
      FOREIGN KEY(quiz_id) REFERENCES quizzes(id)
    );
    CREATE TABLE IF NOT EXISTS child_pets (
      child_id INTEGER PRIMARY KEY,
      pet_type TEXT DEFAULT 'puppy',
      pet_name TEXT DEFAULT 'Buddy',
      happiness INTEGER DEFAULT 40,
      pet_level INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS child_moods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      mood_date TEXT NOT NULL,
      mood TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(child_id, mood_date),
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS parent_praise_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER NOT NULL,
      child_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'unread' CHECK(status IN ('unread','seen')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      seen_at TEXT,
      FOREIGN KEY(parent_id) REFERENCES users(id),
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS child_quranic_settings (
      child_id INTEGER PRIMARY KEY,
      visible INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(child_id) REFERENCES children(id)
    );
    CREATE TABLE IF NOT EXISTS sports_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'url',
      video_url TEXT NOT NULL DEFAULT '',
      thumbnail_url TEXT DEFAULT '',
      explanation TEXT DEFAULT '',
      safety_tips TEXT DEFAULT '',
      difficulty TEXT DEFAULT 'Easy',
      duration_seconds INTEGER DEFAULT 20,
      enabled INTEGER DEFAULT 1,
      ai_analysis_ready INTEGER DEFAULT 0,
      ai_feedback_prompt TEXT DEFAULT '',
      created_by_parent_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const userTableSql = db("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users';")[0]?.sql || "";
  if (userTableSql.includes("CHECK(role IN ('parent','child'))")) {
    exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE users_next (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','parent','child')),
        child_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO users_next (id, name, email, password_hash, role, child_id, created_at)
      SELECT id, name, email, password_hash, role, child_id, created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_next RENAME TO users;
      PRAGMA foreign_keys = ON;
    `);
  }

  if (!columnExists("children", "parent_id")) {
    exec("ALTER TABLE children ADD COLUMN parent_id INTEGER;");
  }
  if (!columnExists("activities", "parent_id")) {
    exec("ALTER TABLE activities ADD COLUMN parent_id INTEGER;");
  }
  if (!columnExists("activities", "subject")) {
    exec("ALTER TABLE activities ADD COLUMN subject TEXT DEFAULT 'Reading';");
  }
  if (!columnExists("activities", "task_type")) {
    exec("ALTER TABLE activities ADD COLUMN task_type TEXT DEFAULT 'standard';");
  }
  if (!columnExists("activities", "task_data")) {
    exec("ALTER TABLE activities ADD COLUMN task_data TEXT DEFAULT '{}';");
  }
  if (!columnExists("activity_logs", "interactive_answer")) {
    exec("ALTER TABLE activity_logs ADD COLUMN interactive_answer TEXT DEFAULT '';");
  }
  if (!columnExists("activity_logs", "interactive_score")) {
    exec("ALTER TABLE activity_logs ADD COLUMN interactive_score INTEGER DEFAULT 0;");
  }
  if (!columnExists("rewards", "parent_id")) {
    exec("ALTER TABLE rewards ADD COLUMN parent_id INTEGER;");
  }
  if (!columnExists("parent_challenges", "parent_id")) {
    exec("ALTER TABLE parent_challenges ADD COLUMN parent_id INTEGER;");
  }
  const firstParent = db("SELECT id FROM users WHERE role IN ('admin','parent') ORDER BY id LIMIT 1;")[0];
  if (firstParent) {
    exec(sql`
      UPDATE users SET role = 'admin' WHERE id = ${firstParent.id} AND role = 'parent';
      UPDATE children SET parent_id = ${firstParent.id} WHERE parent_id IS NULL;
      UPDATE rewards SET parent_id = ${firstParent.id} WHERE parent_id IS NULL;
      UPDATE parent_challenges SET parent_id = ${firstParent.id} WHERE parent_id IS NULL;
    `);
  }
  exec(`
    UPDATE activities SET subject = 'Quran' WHERE lower(title) LIKE '%quran%';
    UPDATE activities SET subject = 'Math' WHERE lower(title) LIKE '%math%' OR lower(title) LIKE '%mathematics%';
    UPDATE activities SET subject = 'Reading' WHERE lower(title) LIKE '%reading%';
    UPDATE activities SET subject = 'Fitness' WHERE lower(title) LIKE '%sport%' OR lower(title) LIKE '%fitness%';
    UPDATE activities SET subject = 'Housework' WHERE lower(title) LIKE '%mother%' OR lower(title) LIKE '%bedroom%' OR lower(title) LIKE '%organization%';
    UPDATE activities SET subject = 'Teamwork' WHERE lower(title) LIKE '%teamwork%';
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
  if (!columnExists("quizzes", "category_key")) {
    exec("ALTER TABLE quizzes ADD COLUMN category_key TEXT DEFAULT '';");
  }
  if (!columnExists("quizzes", "category_question_id")) {
    exec("ALTER TABLE quizzes ADD COLUMN category_question_id INTEGER;");
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

  exec(`
    INSERT OR IGNORE INTO child_wallets (child_id, xp, coins)
    SELECT id, total_points, total_points FROM children;
    INSERT OR IGNORE INTO child_pets (child_id)
    SELECT id FROM children;
    INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES ('seasonal_theme', 'learning');
    INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES ('sound_enabled', 'true');
    INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES ('seerah_restart_on_wrong', 'true');
    INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES ('seerah_level_size', '10');
    INSERT OR IGNORE INTO child_quranic_settings (child_id, visible)
    SELECT id, 1 FROM children;
    INSERT OR IGNORE INTO seerah_quiz_progress (child_id)
    SELECT id FROM children;
    INSERT OR IGNORE INTO seerah_review_settings (child_id, enabled, question_count)
    SELECT id, 1, 10 FROM children;
    INSERT OR IGNORE INTO streak_recovery_settings (child_id, enabled, max_shields, recovery_difficulty)
    SELECT id, 1, 3, 'normal' FROM children;
    INSERT OR IGNORE INTO streak_states (
      child_id, current_streak, shields, last_active_date, last_processed_date,
      active_days_since_shield, tree_points, tree_health
    )
    SELECT id, 28, 3, date('now', '-1 day'), date('now'), 0, 28, 100 FROM children;
  `);
  exec(`
    DROP TABLE IF EXISTS daily_surprises;
    DROP TABLE IF EXISTS power_ups;
    DROP TABLE IF EXISTS mystery_boxes;
    DROP TABLE IF EXISTS treasure_chests;
  `);
  seedSportsActivities();
  seedSeerahQuiz();
  migrateSeerahProgress();

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
      SELECT c.id, a.id, CASE WHEN a.subject = ${quote(SPORTS_SUBJECT)} OR a.task_type = 'sports' THEN 0 ELSE 1 END
      FROM children c CROSS JOIN activities a
      WHERE a.active = 1;
    `);
    const sportsDisabledApplied = db(sql`SELECT setting_value FROM app_settings WHERE setting_key = 'sports_default_disabled_applied';`)[0];
    if (!sportsDisabledApplied) {
      exec(sql`
        UPDATE activity_assignments
        SET enabled = 0
        WHERE activity_id IN (
          SELECT id FROM activities WHERE subject = ${SPORTS_SUBJECT} OR task_type = 'sports'
        );
        INSERT INTO app_settings (setting_key, setting_value)
        VALUES ('sports_default_disabled_applied', 'true')
        ON CONFLICT(setting_key) DO UPDATE SET setting_value = 'true', updated_at = CURRENT_TIMESTAMP;
      `);
    }
    return;
  }

  exec(sql`
    INSERT INTO children (name, avatar, total_points) VALUES ('Amina', 'rainbow', 0);
    INSERT INTO children (name, avatar, total_points) VALUES ('Yusuf', 'rocket', 0);
    INSERT INTO users (name, email, password_hash, role) VALUES ('Parent Admin', 'parent@example.com', ${hashPassword("parent123")}, 'parent');
    INSERT INTO users (name, email, password_hash, role, child_id) VALUES ('Amina', 'amina@example.com', ${hashPassword("child123")}, 'child', 1);
    INSERT INTO users (name, email, password_hash, role, child_id) VALUES ('Yusuf', 'yusuf@example.com', ${hashPassword("child123")}, 'child', 2);
  `);
  const seededParent = db("SELECT id FROM users WHERE role = 'parent' ORDER BY id LIMIT 1;")[0];
  if (seededParent) {
    exec(sql`
      UPDATE users SET role = 'admin' WHERE id = ${seededParent.id};
      UPDATE children SET parent_id = ${seededParent.id} WHERE parent_id IS NULL;
    `);
  }

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
  seedSportsActivities();
  seedSeerahQuiz();
  migrateSeerahProgress();
  exec(sql`
    INSERT OR IGNORE INTO activity_assignments (child_id, activity_id, enabled)
    SELECT c.id, a.id, CASE WHEN a.subject = ${SPORTS_SUBJECT} OR a.task_type = 'sports' THEN 0 ELSE 1 END
    FROM children c CROSS JOIN activities a
    WHERE a.active = 1;
    INSERT INTO app_settings (setting_key, setting_value)
    VALUES ('sports_default_disabled_applied', 'true')
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = 'true', updated_at = CURRENT_TIMESTAMP;
  `);
}

function addPoints(childId, points, sourceType, sourceId, note) {
  exec(sql`
    INSERT INTO point_transactions (child_id, source_type, source_id, points, note) VALUES (${childId}, ${sourceType}, ${sourceId}, ${points}, ${note});
    UPDATE children SET total_points = total_points + ${points} WHERE id = ${childId};
    INSERT OR IGNORE INTO child_wallets (child_id, xp, coins) VALUES (${childId}, 0, 0);
    UPDATE child_wallets
      SET xp = xp + ${Math.max(0, Number(points || 0))},
          coins = coins + ${Number(points || 0)},
          updated_at = CURRENT_TIMESTAMP
      WHERE child_id = ${childId};
  `);
  if (Number(points || 0) > 0) addPetJoy(childId, Math.min(8, Math.max(2, Math.floor(Number(points) / 5))));
}

function addPetJoy(childId, amount = 3) {
  exec(sql`
    INSERT OR IGNORE INTO child_pets (child_id) VALUES (${childId});
    UPDATE child_pets
      SET happiness = MIN(100, happiness + ${Number(amount)}),
          pet_level = MAX(pet_level, CAST((happiness + ${Number(amount)}) / 25 AS INTEGER) + 1),
          updated_at = CURRENT_TIMESTAMP
      WHERE child_id = ${childId};
  `);
}

function seedSeerahQuiz() {
  const admin = db("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1;")[0];
  if (!admin) return;
  for (const item of SEERAH_QUESTIONS) {
    exec(sql`
      INSERT INTO quizzes (
        title, subject, quiz_type, instructions, difficulty, level, question_text, options,
        correct_answer, explanation, required_score_to_pass, xp_reward, coin_reward,
        status, created_by_parent_id, category_key, category_question_id
      )
      SELECT
        ${`${SEERAH_CATEGORY_NAME} · Frage ${item.id}`},
        ${SEERAH_CATEGORY_NAME},
        'select_3',
        'Wähle die richtige Antwort aus drei Möglichkeiten.',
        ${item.difficulty},
        ${item.id},
        ${item.question},
        ${JSON.stringify(item.options)},
        ${item.correctAnswer},
        ${item.explanation},
        1,
        ${item.hasnat},
        ${item.hasnat},
        'active',
        ${admin.id},
        ${SEERAH_CATEGORY_KEY},
        ${item.id}
      WHERE NOT EXISTS (
        SELECT 1 FROM quizzes
        WHERE category_key = ${SEERAH_CATEGORY_KEY} AND category_question_id = ${item.id}
      );
    `);
  }
  exec(sql`
    INSERT OR IGNORE INTO quiz_category_assignments (category_key, child_id, assigned_by_parent_id, enabled)
    SELECT ${SEERAH_CATEGORY_KEY}, c.id, ${admin.id}, 1 FROM children c;
    INSERT OR IGNORE INTO seerah_quiz_progress (child_id)
    SELECT id FROM children;
  `);
}

function migrateSeerahProgress() {
  const migrated = db("SELECT setting_value FROM app_settings WHERE setting_key = 'seerah_progress_migrated';")[0];
  if (migrated?.setting_value === "true") return;
  const levelSize = Math.max(1, Math.min(25, Number(settingsMap().seerah_level_size || 10)));
  for (const child of db("SELECT id FROM children ORDER BY id;")) {
    const passed = new Set(db(sql`
      SELECT DISTINCT q.category_question_id
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.kid_id = ${child.id} AND qa.passed = 1 AND q.category_key = ${SEERAH_CATEGORY_KEY};
    `).map((row) => Number(row.category_question_id)));
    let currentQuestion = 1;
    while (currentQuestion <= SEERAH_QUESTIONS.length && passed.has(currentQuestion)) currentQuestion += 1;
    const completed = currentQuestion > SEERAH_QUESTIONS.length;
    const currentLevel = completed
      ? Math.ceil(SEERAH_QUESTIONS.length / levelSize)
      : Math.floor((currentQuestion - 1) / levelSize) + 1;
    const levelStart = (currentLevel - 1) * levelSize + 1;
    exec(sql`
      INSERT INTO seerah_quiz_progress (child_id, current_question, current_level, questions_completed_in_level, completed)
      VALUES (${child.id}, ${currentQuestion}, ${currentLevel}, ${completed ? Math.min(levelSize, SEERAH_QUESTIONS.length - levelStart + 1) : currentQuestion - levelStart}, ${completed ? 1 : 0})
      ON CONFLICT(child_id) DO UPDATE SET
        current_question = excluded.current_question,
        current_level = excluded.current_level,
        questions_completed_in_level = excluded.questions_completed_in_level,
        completed = excluded.completed,
        updated_at = CURRENT_TIMESTAMP;
    `);
  }
  exec(`
    INSERT INTO app_settings (setting_key, setting_value) VALUES ('seerah_progress_migrated', 'true')
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = 'true', updated_at = CURRENT_TIMESTAMP;
  `);
}

function seedSportsActivities() {
  const firstParent = db("SELECT id FROM users WHERE role IN ('admin','parent') ORDER BY id LIMIT 1;")[0];
  const parentId = firstParent?.id || null;
  for (const [title, description, recommendation, difficulty, points, category, exerciseKey, level, days] of SPORTS_ACTIVITIES) {
    const taskData = JSON.stringify({
      category,
      recommendation,
      difficulty,
      exerciseKey,
      level,
      instructions: sportsInstructions(exerciseKey),
      safety: "Move in a safe space, keep breathing, and stop if anything hurts."
    });
    const dayValues = [0, 0, 0, 0, 0, 0, 0].map((_, index) => days.includes(index) ? 1 : 0);
    exec(sql`
      INSERT INTO activities (
        title, description, points, duration_minutes, frequency, show_weekdays, show_weekends,
        day_0, day_1, day_2, day_3, day_4, day_5, day_6,
        proof_required, requires_approval, parent_id, subject, task_type, task_data
      )
      SELECT ${title}, ${description}, ${points}, ${level}, 'weekly', 1, 1,
        ${dayValues[0]}, ${dayValues[1]}, ${dayValues[2]}, ${dayValues[3]}, ${dayValues[4]}, ${dayValues[5]}, ${dayValues[6]},
        0, 0, ${parentId}, ${SPORTS_SUBJECT}, 'sports', ${taskData}
      WHERE NOT EXISTS (
        SELECT 1 FROM activities WHERE lower(title) = lower(${title}) AND subject = ${SPORTS_SUBJECT}
      );
    `);
    exec(sql`
      INSERT INTO sports_videos (
        exercise_key, title, source_type, explanation, safety_tips, difficulty, duration_seconds, enabled, ai_feedback_prompt, created_by_parent_id
      )
      SELECT ${exerciseKey}, ${title}, 'url', ${description}, 'Warm up first. Drink water. Stop if you feel pain. Ask a parent for help.', ${difficulty}, 20, 0, 'Future AI posture feedback placeholder for this exercise.', ${parentId}
      WHERE NOT EXISTS (SELECT 1 FROM sports_videos WHERE exercise_key = ${exerciseKey});
    `);
  }
  exec(sql`
    INSERT OR IGNORE INTO activity_assignments (child_id, activity_id, enabled)
    SELECT c.id, a.id, 0 FROM children c CROSS JOIN activities a WHERE a.active = 1 AND a.subject = ${SPORTS_SUBJECT};
    INSERT OR IGNORE INTO child_quranic_settings (child_id, visible)
    SELECT id, 1 FROM children;
  `);
}

function sportsInstructions(exerciseKey) {
  const map = {
    squats: ["Stand tall with feet apart.", "Bend knees like sitting on a chair.", "Stand back up slowly."],
    "wall-sit": ["Put your back on the wall.", "Slide down into a chair shape.", "Hold and breathe."],
    lunges: ["Step forward carefully.", "Bend both knees gently.", "Push back and switch legs."],
    "calf-raises": ["Stand tall.", "Lift your heels.", "Lower slowly."],
    "step-ups": ["Use a safe low step.", "Step up with one foot.", "Step down and switch."],
    "glute-bridges": ["Lie on your back.", "Bend your knees.", "Lift hips and lower slowly."],
    "high-knees": ["Run in place.", "Lift knees high.", "Keep arms moving."],
    "fast-feet": ["Stand ready.", "Move feet quickly.", "Stay light and balanced."],
    "side-jumps": ["Stand with soft knees.", "Jump side to side.", "Land gently."],
    "shuttle-run": ["Run to the marker.", "Touch and turn.", "Run back safely."],
    "zigzag-run": ["Place safe markers.", "Run around them.", "Keep control."],
    "one-leg-balance": ["Stand tall.", "Lift one foot.", "Hold, then switch."],
    "bear-walk": ["Hands and feet on floor.", "Walk forward slowly.", "Keep your back steady."],
    "frog-jump": ["Squat low.", "Jump forward.", "Land softly."],
    "crab-walk": ["Sit down.", "Lift your body.", "Walk carefully."]
  };
  return map[exerciseKey] || ["Start slowly.", "Keep control.", "Finish with a smile."];
}

function sportsStatsFor(childId, date = today()) {
  const logs = db(sql`
    SELECT l.*, a.title, a.points, a.duration_minutes, a.task_data
    FROM activity_logs l
    JOIN activities a ON a.id = l.activity_id
    WHERE l.child_id = ${childId} AND a.subject = ${SPORTS_SUBJECT}
    ORDER BY l.log_date DESC, l.updated_at DESC;
  `).map((row) => {
    let taskData = {};
    try { taskData = JSON.parse(row.task_data || "{}"); } catch {}
    return { ...row, task_data: taskData };
  });
  const todayLogs = logs.filter((row) => row.log_date === date);
  const completedToday = todayLogs.filter((row) => ["completed", "approved"].includes(row.status));
  const weekStart = addDays(date, -6);
  const monthStart = date.slice(0, 8) + "01";
  const weeklyLogs = logs.filter((row) => row.log_date >= weekStart && ["completed", "approved"].includes(row.status));
  const monthlyLogs = logs.filter((row) => row.log_date >= monthStart && ["completed", "approved"].includes(row.status));
  const todayActivities = db(sql`
    SELECT a.*, COALESCE(l.status, 'pending') AS status
    FROM activities a
    LEFT JOIN activity_assignments aa ON aa.activity_id = a.id AND aa.child_id = ${childId}
    LEFT JOIN activity_logs l ON l.activity_id = a.id AND l.child_id = ${childId} AND l.log_date = ${date}
    LEFT JOIN activity_daily_skips ads ON ads.activity_id = a.id AND ads.child_id = ${childId} AND ads.skip_date = ${date}
    WHERE a.active = 1 AND a.subject = ${SPORTS_SUBJECT} AND a.${dayColumn(date)} = 1 AND COALESCE(aa.enabled, 1) = 1 AND ads.id IS NULL;
  `);
  const totalHasanat = db(sql`
    SELECT COALESCE(SUM(pt.points), 0) AS total
    FROM point_transactions pt
    LEFT JOIN activity_logs l ON l.id = pt.source_id AND pt.source_type = 'activity'
    LEFT JOIN activities a ON a.id = l.activity_id
    WHERE pt.child_id = ${childId} AND (a.subject = ${SPORTS_SUBJECT} OR pt.source_type LIKE 'sports_%');
  `)[0].total;
  const categoryCounts = {};
  for (const row of logs.filter((item) => ["completed", "approved"].includes(item.status))) {
    const category = row.task_data.category || "Sports";
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  }
  const badges = SPORTS_BADGES.map((badge) => {
    const progress = badge.category ? Number(categoryCounts[badge.category] || 0)
      : badge.dailySession ? (todayActivities.length && completedToday.length >= todayActivities.length ? 1 : 0)
        : badge.weekly ? weeklyLogs.length
          : logs.filter((row) => ["completed", "approved"].includes(row.status)).length;
    return { ...badge, progress: Math.min(progress, badge.target), earned: progress >= badge.target };
  });
  return {
    title: SPORTS_SUBJECT,
    today_total: todayActivities.length,
    today_completed: completedToday.length,
    today_remaining: Math.max(0, todayActivities.length - completedToday.length),
    weekly_completed: weeklyLogs.length,
    monthly_completed: monthlyLogs.length,
    completion_rate: todayActivities.length ? Math.round((completedToday.length / todayActivities.length) * 100) : 0,
    sports_streak: sportsStreakFor(childId),
    total_hasnat: Number(totalHasanat || 0),
    total_time: logs.filter((row) => ["completed", "approved"].includes(row.status)).reduce((sum, row) => sum + Number(row.duration_minutes || 1), 0),
    badges
  };
}

function sportsStreakFor(childId) {
  const rows = db(sql`
    SELECT DISTINCT l.log_date
    FROM activity_logs l
    JOIN activities a ON a.id = l.activity_id
    WHERE l.child_id = ${childId} AND a.subject = ${SPORTS_SUBJECT} AND l.status IN ('completed','approved')
    ORDER BY l.log_date DESC;
  `);
  const days = new Set(rows.map((row) => row.log_date));
  let streak = 0;
  const cursor = dateFromLocal(today());
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function awardSportsBonusesIfNeeded(childId, date = today()) {
  const stats = sportsStatsFor(childId, date);
  if (stats.today_total && stats.today_completed >= stats.today_total) {
    const note = `Daily sports session bonus ${date}`;
    if (!db(sql`SELECT id FROM point_transactions WHERE child_id = ${childId} AND source_type = 'sports_daily' AND note = ${note} LIMIT 1;`)[0]) {
      addPoints(childId, 25, "sports_daily", 0, note);
      exec(sql`INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon) VALUES (${childId}, ${date}, -810001, 'Daily Mover', '🌟');`);
    }
  }
  const week = new Date(`${date}T12:00:00`).toISOString().slice(0, 10).slice(0, 7) + `-${Math.ceil(Number(date.slice(8, 10)) / 7)}`;
  if (stats.weekly_completed >= 5) {
    const note = `Weekly sports goal bonus ${week}`;
    if (!db(sql`SELECT id FROM point_transactions WHERE child_id = ${childId} AND source_type = 'sports_weekly' AND note = ${note} LIMIT 1;`)[0]) {
      addPoints(childId, 100, "sports_weekly", 0, note);
      exec(sql`INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon) VALUES (${childId}, ${date}, -810002, 'Weekly Sports Winner', '🏅');`);
    }
  }
  const month = date.slice(0, 7);
  if (stats.monthly_completed >= 20) {
    const note = `Monthly sports champion bonus ${month}`;
    if (!db(sql`SELECT id FROM point_transactions WHERE child_id = ${childId} AND source_type = 'sports_monthly' AND note = ${note} LIMIT 1;`)[0]) {
      addPoints(childId, 300, "sports_monthly", 0, note);
      exec(sql`INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon) VALUES (${childId}, ${date}, -810003, 'Sports Master', '🏆');`);
    }
  }
  for (const badge of sportsStatsFor(childId, date).badges.filter((item) => item.earned)) {
    exec(sql`INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon) VALUES (${childId}, ${date}, ${-820000 - SPORTS_BADGES.findIndex((item) => item.title === badge.title)}, ${badge.title}, ${badge.icon});`);
  }
}

function walletFor(childId) {
  exec(sql`INSERT OR IGNORE INTO child_wallets (child_id, xp, coins) SELECT id, total_points, total_points FROM children WHERE id = ${childId};`);
  const wallet = db(sql`SELECT * FROM child_wallets WHERE child_id = ${childId};`)[0] || {};
  const child = db(sql`SELECT total_points FROM children WHERE id = ${childId};`)[0] || { total_points: 0 };
  return {
    xp: Math.max(Number(wallet.xp || 0), Number(child.total_points || 0)),
    coins: Number(child.total_points || wallet.coins || 0),
    gems: Number(wallet.gems || 0),
    keys: Number(wallet.keys || 0),
    treasure_tickets: Number(wallet.treasure_tickets || 0)
  };
}

function petFor(childId) {
  exec(sql`INSERT OR IGNORE INTO child_pets (child_id) VALUES (${childId});`);
  return db(sql`SELECT * FROM child_pets WHERE child_id = ${childId};`)[0] || { pet_type: "puppy", pet_name: "Buddy", happiness: 40, pet_level: 1 };
}

function settingsMap() {
  const rows = db("SELECT setting_key, setting_value FROM app_settings;");
  return Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
}

function quranicMotivationVisible(childId) {
  exec(sql`INSERT OR IGNORE INTO child_quranic_settings (child_id, visible) VALUES (${childId}, 1);`);
  const row = db(sql`SELECT visible FROM child_quranic_settings WHERE child_id = ${childId};`)[0];
  return !row || Number(row.visible) === 1;
}

function sportsVideoMap() {
  const rows = db("SELECT * FROM sports_videos WHERE enabled = 1 ORDER BY exercise_key;");
  return Object.fromEntries(rows.map((row) => [row.exercise_key, row]));
}

function normalizeVideoPayload(body, user) {
  const exerciseKey = String(body.exercise_key || body.exerciseKey || "").trim();
  const title = String(body.title || exerciseKey || "Sports demo").trim();
  const sourceType = String(body.source_type || body.sourceType || "url").trim();
  const allowed = ["upload", "url", "youtube", "self_hosted"];
  return {
    exerciseKey,
    title,
    sourceType: allowed.includes(sourceType) ? sourceType : "url",
    videoUrl: String(body.video_url || body.videoUrl || "").trim(),
    thumbnailUrl: String(body.thumbnail_url || body.thumbnailUrl || "").trim(),
    explanation: String(body.explanation || "").trim().slice(0, 800),
    safetyTips: String(body.safety_tips || body.safetyTips || "Warm up first. Drink water. Stop if you feel pain. Ask a parent for help.").trim().slice(0, 800),
    difficulty: String(body.difficulty || "Easy").trim(),
    durationSeconds: Math.max(5, Math.min(180, Number(body.duration_seconds || body.durationSeconds || 20))),
    enabled: body.enabled === undefined ? 1 : boolInt(body.enabled),
    aiFeedbackPrompt: String(body.ai_feedback_prompt || body.aiFeedbackPrompt || "Future AI posture feedback for safe child-friendly exercise guidance.").trim().slice(0, 800),
    parentId: user?.id || null
  };
}

function safeMediaName(value) {
  return String(value || "exercise").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "exercise";
}

function storeSportsVideoUpload(payload) {
  if (payload.sourceType !== "upload" || !String(payload.videoUrl || "").startsWith("data:video/")) return payload;
  const match = String(payload.videoUrl).match(/^data:(video\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return payload;
  const mime = match[1].toLowerCase();
  const extension = mime.includes("webm") ? "webm" : mime.includes("quicktime") || mime.includes("mov") ? "mov" : "mp4";
  const fileName = `${safeMediaName(payload.exerciseKey)}-${Date.now()}.${extension}`;
  writeFileSync(join(SPORTS_VIDEO_DIR, fileName), Buffer.from(match[2], "base64"));
  return { ...payload, sourceType: "self_hosted", videoUrl: `/media/sports-videos/${fileName}` };
}

function moodFor(childId, date = today()) {
  return db(sql`SELECT * FROM child_moods WHERE child_id = ${childId} AND mood_date = ${date} LIMIT 1;`)[0] || null;
}

function praiseFor(childId) {
  return db(sql`
    SELECT pm.*, u.name AS parent_name
    FROM parent_praise_messages pm
    JOIN users u ON u.id = pm.parent_id
    WHERE pm.child_id = ${childId}
    ORDER BY pm.created_at DESC
    LIMIT 5;
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

function quranReadingRows(childId) {
  return db(sql`
    SELECT *
    FROM quran_reading_assignments
    WHERE child_id = ${childId}
    ORDER BY sort_order ASC, id ASC;
  `).map((row) => {
    const meta = quranSurahMeta(row.surah_id) || {};
    return {
      ...row,
      ...meta,
      assigned_by_parent: true,
      parent_approval_status: row.status,
      progress_percentage: row.status === "approved" ? 100 : row.status === "submitted" ? 75 : row.status === "repeat" ? 35 : 25,
      hasanat_earned: Number(row.hasanat_awarded || 0)
    };
  });
}

function quranReadingStats(childId) {
  const assignments = quranReadingRows(childId);
  const completed = assignments.filter((row) => row.status === "approved");
  const pending = assignments.filter((row) => row.status === "submitted");
  const current = assignments.find((row) => ["assigned", "repeat", "submitted"].includes(row.status)) || assignments[0] || null;
  const nextAssigned = assignments.find((row) => row.status === "assigned" && Number(row.id) !== Number(current?.id)) || null;
  const completedSurahIds = new Set(completed.map((row) => Number(row.surah_id)));
  const totalAyahsCompleted = completed.reduce((sum, row) => sum + Number(row.ayah_count || 0), 0);
  const totalHasanat = completed.reduce((sum, row) => sum + Number(row.hasanat_awarded || 0), 0);
  const juzAmmaIds = QURAN_SURAHS.filter((surah) => surah.id >= 78).map((surah) => surah.id);
  const juzAmmaComplete = juzAmmaIds.every((id) => completedSurahIds.has(Number(id)));
  const badges = QURAN_READING_BADGES.map((badge) => {
    const earned = badge.target === "juz-amma"
      ? juzAmmaComplete
      : badge.target === "ayah-master"
        ? totalAyahsCompleted >= 500
        : completed.length >= Number(badge.target);
    return { ...badge, earned };
  });
  return {
    feature_name: "Quran Reading & Recitation",
    assignments,
    current_surah: current,
    next_surah: nextAssigned,
    total_assigned: assignments.length,
    total_completed: completed.length,
    total_surahs: 114,
    pending_approval: pending.length,
    total_ayahs_completed: totalAyahsCompleted,
    total_quran_hasanat: totalHasanat,
    total_quran_ayahs: 6236,
    progress_percentage: Math.round((completed.length / 114) * 100),
    ayah_progress_percentage: Math.round((totalAyahsCompleted / 6236) * 100),
    recent_achievements: badges.filter((badge) => badge.earned).slice(0, 4),
    badges
  };
}

function awardQuranReadingBadges(childId) {
  const stats = quranReadingStats(childId);
  for (const badge of stats.badges.filter((item) => item.earned)) {
    exec(sql`
      INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon)
      VALUES (${childId}, ${today()}, ${-900000 - Math.abs(hashCode(badge.title)) % 9999}, ${badge.title}, ${badge.icon});
    `);
  }
}

function quranReadingParentRows(user) {
  const childScope = visibleChildWhere(user, "c");
  return db(`
    SELECT qra.*, c.name AS child_name
    FROM quran_reading_assignments qra
    JOIN children c ON c.id = qra.child_id
    WHERE ${childScope}
    ORDER BY c.name ASC, qra.sort_order ASC, qra.id ASC;
  `).map((row) => ({ ...row, ...(quranSurahMeta(row.surah_id) || {}) }));
}

function quranReadingParentReports(user) {
  const rows = quranReadingParentRows(user);
  const byChild = new Map();
  for (const row of rows) {
    if (!byChild.has(row.child_id)) {
      byChild.set(row.child_id, {
        child_id: row.child_id,
        child_name: row.child_name,
        assigned_surahs: 0,
        completed_surahs: 0,
        pending_approval: 0,
        total_ayahs_recited: 0,
        total_hasanat_earned: 0
      });
    }
    const item = byChild.get(row.child_id);
    item.assigned_surahs += 1;
    if (row.status === "submitted") item.pending_approval += 1;
    if (row.status === "approved") {
      item.completed_surahs += 1;
      item.total_ayahs_recited += Number(row.ayah_count || 0);
      item.total_hasanat_earned += Number(row.hasanat_awarded || 0);
    }
  }
  const weekly = db(`
    SELECT c.name AS child_name, date(qra.approved_at, 'weekday 0', '-6 days') AS week, COUNT(*) AS completed
    FROM quran_reading_assignments qra
    JOIN children c ON c.id = qra.child_id
    WHERE qra.status = 'approved' AND qra.approved_at IS NOT NULL AND ${visibleChildWhere(user, "c")}
    GROUP BY c.id, week
    ORDER BY week DESC, c.name ASC
    LIMIT 20;
  `);
  const monthly = db(`
    SELECT c.name AS child_name, substr(qra.approved_at, 1, 7) AS month, COUNT(*) AS completed
    FROM quran_reading_assignments qra
    JOIN children c ON c.id = qra.child_id
    WHERE qra.status = 'approved' AND qra.approved_at IS NOT NULL AND ${visibleChildWhere(user, "c")}
    GROUP BY c.id, month
    ORDER BY month DESC, c.name ASC
    LIMIT 20;
  `);
  return { children: Array.from(byChild.values()), weekly, monthly };
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function quizRow(row) {
  if (!row) return null;
  return {
    ...row,
    options: parseJsonArray(row.options),
    multiple_correct_answers: parseJsonArray(row.multiple_correct_answers),
    unlock_next_level: Boolean(Number(row.unlock_next_level || 0))
  };
}

function quizzesForKid(childId) {
  const quizzes = db(sql`
    SELECT q.*,
      (
        SELECT COUNT(*) FROM quiz_attempts qa
        WHERE qa.quiz_id = q.id AND qa.kid_id = ${childId}
      ) AS attempts,
      (
        SELECT score FROM quiz_attempts qa
        WHERE qa.quiz_id = q.id AND qa.kid_id = ${childId}
        ORDER BY qa.completed_at DESC LIMIT 1
      ) AS last_score,
      (
        SELECT MAX(passed) FROM quiz_attempts qa
        WHERE qa.quiz_id = q.id AND qa.kid_id = ${childId}
      ) AS last_passed
    FROM quizzes q
    WHERE q.status = 'active'
      AND (q.assigned_to_kid_id IS NULL OR q.assigned_to_kid_id = ${childId})
      AND (
        COALESCE(q.category_key, '') = ''
        OR EXISTS (
          SELECT 1 FROM quiz_category_assignments qca
          WHERE qca.category_key = q.category_key AND qca.child_id = ${childId} AND qca.enabled = 1
        )
      )
      AND (q.due_date IS NULL OR q.due_date >= ${today()})
       AND (
         q.created_by_parent_id = (SELECT parent_id FROM children WHERE id = ${childId})
         OR q.created_by_parent_id IN (SELECT id FROM users WHERE role = 'admin')
       )
    ORDER BY
      CASE WHEN q.category_key = ${SEERAH_CATEGORY_KEY} THEN 0 ELSE 1 END,
      q.category_question_id ASC,
      q.due_date IS NULL,
      q.due_date ASC,
      q.level ASC,
      q.id DESC;
  `).map(quizRow);
  const seerahPositionOffset = Math.floor(Math.random() * 3);
  return quizzes.map((quiz) => {
    let publicOptions = shuffled(quiz.options);
    if (quiz.category_key === SEERAH_CATEGORY_KEY && quiz.options.length > 1) {
      const distractors = shuffled(quiz.options.filter((option) => option !== quiz.correct_answer));
      const targetPosition = (Number(quiz.category_question_id || 1) - 1 + seerahPositionOffset) % quiz.options.length;
      publicOptions = [...distractors];
      publicOptions.splice(targetPosition, 0, quiz.correct_answer);
    }
    const { correct_answer, multiple_correct_answers, ...publicQuiz } = quiz;
    return { ...publicQuiz, options: publicOptions };
  });
}

function seerahQuizProgressFor(childId) {
  exec(sql`INSERT OR IGNORE INTO seerah_quiz_progress (child_id) VALUES (${childId});`);
  const assignment = db(sql`
    SELECT enabled FROM quiz_category_assignments
    WHERE category_key = ${SEERAH_CATEGORY_KEY} AND child_id = ${childId};
  `)[0];
  const correctlyAnswered = Number(db(sql`
    SELECT COUNT(DISTINCT qa.quiz_id) AS count
    FROM quiz_attempts qa
    JOIN quizzes q ON q.id = qa.quiz_id
    WHERE qa.kid_id = ${childId} AND qa.passed = 1 AND q.category_key = ${SEERAH_CATEGORY_KEY};
  `)[0]?.count || 0);
  const settings = settingsMap();
  const levelSize = Math.max(1, Math.min(25, Number(settings.seerah_level_size || 10)));
  const row = db(sql`SELECT * FROM seerah_quiz_progress WHERE child_id = ${childId};`)[0] || {};
  const currentQuestion = Math.max(1, Math.min(SEERAH_QUESTIONS.length + 1, Number(row.current_question || 1)));
  const completed = currentQuestion > SEERAH_QUESTIONS.length;
  const currentLevel = completed
    ? Math.ceil(SEERAH_QUESTIONS.length / levelSize)
    : Math.floor((currentQuestion - 1) / levelSize) + 1;
  const levelStart = (currentLevel - 1) * levelSize + 1;
  const levelEnd = Math.min(SEERAH_QUESTIONS.length, levelStart + levelSize - 1);
  const completedInLevel = completed ? levelEnd - levelStart + 1 : currentQuestion - levelStart;
  const totalProgress = completed ? SEERAH_QUESTIONS.length : currentQuestion - 1;
  const earnedHasnat = Number(db(sql`
    SELECT COALESCE(SUM(pt.points), 0) AS points
    FROM point_transactions pt
    JOIN quizzes q ON q.id = pt.source_id
    WHERE pt.child_id = ${childId} AND pt.source_type = 'quiz' AND q.category_key = ${SEERAH_CATEGORY_KEY};
  `)[0]?.points || 0);
  return {
    key: SEERAH_CATEGORY_KEY,
    name: SEERAH_CATEGORY_NAME,
    assigned: Boolean(Number(assignment?.enabled || 0)),
    completed: totalProgress,
    correctly_answered: correctlyAnswered,
    total: SEERAH_QUESTIONS.length,
    remaining: Math.max(0, SEERAH_QUESTIONS.length - totalProgress),
    percentage: Math.round((totalProgress / SEERAH_QUESTIONS.length) * 100),
    earned_hasnat: earnedHasnat,
    complete: completed,
    current_question: currentQuestion,
    current_level: currentLevel,
    level_size: levelSize,
    level_start: levelStart,
    level_end: levelEnd,
    questions_completed_in_level: completedInLevel,
    restart_on_wrong: settings.seerah_restart_on_wrong !== "false"
  };
}

function shuffled(items = []) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function seerahReviewReward(difficulty) {
  return difficulty === "hard" ? 8 : difficulty === "medium" ? 5 : 3;
}

function seerahReviewStreak(childId, date = today()) {
  const dates = new Set(db(sql`
    SELECT review_date FROM seerah_review_sessions
    WHERE child_id = ${childId} AND status = 'completed'
    ORDER BY review_date DESC;
  `).map((row) => row.review_date));
  let cursor = new Date(`${date}T12:00:00`);
  if (!dates.has(date)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function publicSeerahReviewQuestion(row) {
  if (!row) return null;
  return {
    review_question_id: row.review_question_id,
    position: Number(row.position),
    quiz_id: Number(row.quiz_id),
    question_number: Number(row.category_question_id),
    question_text: row.question_text,
    options: parseJsonArray(row.option_order),
    difficulty: row.difficulty,
    reward_hasnat: seerahReviewReward(row.difficulty),
    answered: row.correct !== null && row.correct !== undefined,
    correct: row.correct === null || row.correct === undefined ? null : Boolean(Number(row.correct))
  };
}

function seerahReviewFor(childId, date = today()) {
  exec(sql`
    INSERT OR IGNORE INTO seerah_review_settings (child_id, enabled, question_count)
    VALUES (${childId}, 1, 10);
  `);
  const settings = db(sql`SELECT * FROM seerah_review_settings WHERE child_id = ${childId};`)[0] || {};
  const progress = seerahQuizProgressFor(childId);
  const unlockedCount = Math.min(SEERAH_QUESTIONS.length, Math.max(0, Number(progress.current_question || 1)));
  const session = db(sql`
    SELECT * FROM seerah_review_sessions
    WHERE child_id = ${childId} AND review_date = ${date}
    LIMIT 1;
  `)[0];
  const history = db(sql`
    SELECT review_date, total_questions, correct_answers, wrong_answers, hasnat_earned, completed_at
    FROM seerah_review_sessions
    WHERE child_id = ${childId} AND status = 'completed'
    ORDER BY review_date DESC
    LIMIT 30;
  `);
  const needsPractice = db(sql`
    SELECT q.category_question_id AS question_number, q.question_text, srp.wrong_count, srp.correct_count, srp.priority
    FROM seerah_review_practice srp
    JOIN quizzes q ON q.id = srp.quiz_id
    WHERE srp.child_id = ${childId} AND srp.priority > 0
    ORDER BY srp.priority DESC, srp.last_wrong_at DESC
    LIMIT 20;
  `);
  const currentQuestion = session && session.status === "in_progress"
    ? publicSeerahReviewQuestion(db(sql`
        SELECT srq.id AS review_question_id, srq.*, q.category_question_id, q.question_text, q.difficulty
        FROM seerah_review_questions srq
        JOIN quizzes q ON q.id = srq.quiz_id
        WHERE srq.session_id = ${session.id} AND srq.position = ${Number(session.current_index || 0) + 1}
        LIMIT 1;
      `)[0])
    : null;
  const maxQuestionReward = Number(settings.question_count || 10) * 8;
  return {
    enabled: Boolean(Number(settings.enabled || 0)),
    question_count: Number(settings.question_count || 10),
    unlocked_questions: unlockedCount,
    status: session?.status || "not_started",
    session_id: session?.id || null,
    current_index: Number(session?.current_index || 0),
    total_questions: session
      ? Number(session.total_questions || 0)
      : Math.min(Number(settings.question_count || 10), unlockedCount),
    correct_answers: Number(session?.correct_answers || 0),
    wrong_answers: Number(session?.wrong_answers || 0),
    hasnat_earned: Number(session?.hasnat_earned || 0),
    completion_bonus: Number(session?.completion_bonus || 0),
    perfect_bonus: Number(session?.perfect_bonus || 0),
    current_question: currentQuestion,
    streak: seerahReviewStreak(childId, date),
    potential_hasnat: maxQuestionReward + 20 + 30,
    needs_practice: needsPractice,
    history
  };
}

function startSeerahReview(childId, date = today()) {
  const review = seerahReviewFor(childId, date);
  if (!review.enabled) throw Object.assign(new Error("Daily Seerah Review is not enabled for this child."), { status: 403 });
  if (review.status !== "not_started") return review;
  if (review.unlocked_questions < 1) throw Object.assign(new Error("Complete or unlock a Seerah question first."), { status: 400 });

  const requestedCount = [5, 10, 15].includes(Number(review.question_count)) ? Number(review.question_count) : 10;
  const total = Math.min(requestedCount, review.unlocked_questions);
  const available = db(sql`
    SELECT q.*
    FROM quizzes q
    WHERE q.category_key = ${SEERAH_CATEGORY_KEY}
      AND q.category_question_id <= ${review.unlocked_questions}
      AND q.status = 'active'
    ORDER BY q.category_question_id;
  `).map(quizRow);
  const priorityIds = db(sql`
    SELECT quiz_id FROM seerah_review_practice
    WHERE child_id = ${childId} AND priority > 0
    ORDER BY priority DESC, last_wrong_at DESC;
  `).map((row) => Number(row.quiz_id));
  const byId = new Map(available.map((quiz) => [Number(quiz.id), quiz]));
  const priority = priorityIds.map((id) => byId.get(id)).filter(Boolean);
  const selected = [];
  for (const quiz of shuffled(priority)) {
    if (selected.length >= Math.min(total, Math.ceil(total * 0.6))) break;
    if (!selected.some((item) => item.id === quiz.id)) selected.push(quiz);
  }
  for (const quiz of shuffled(available)) {
    if (selected.length >= total) break;
    if (!selected.some((item) => item.id === quiz.id)) selected.push(quiz);
  }
  const ordered = shuffled(selected);
  exec(sql`
    INSERT INTO seerah_review_sessions (
      child_id, review_date, status, total_questions, current_index, started_at
    ) VALUES (${childId}, ${date}, 'in_progress', ${ordered.length}, 0, CURRENT_TIMESTAMP)
    ON CONFLICT(child_id, review_date) DO UPDATE SET
      status = CASE WHEN seerah_review_sessions.status = 'not_started' THEN 'in_progress' ELSE seerah_review_sessions.status END,
      started_at = COALESCE(seerah_review_sessions.started_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP;
  `);
  const session = db(sql`SELECT id FROM seerah_review_sessions WHERE child_id = ${childId} AND review_date = ${date};`)[0];
  if (session) {
    ordered.forEach((quiz, index) => {
      exec(sql`
        INSERT OR IGNORE INTO seerah_review_questions (session_id, position, quiz_id, option_order)
        VALUES (${session.id}, ${index + 1}, ${quiz.id}, ${JSON.stringify(shuffled(quiz.options))});
      `);
    });
  }
  return seerahReviewFor(childId, date);
}

function awardSeerahReviewStreakBadges(childId, streak) {
  const milestones = [
    [3, -830003, "3-Day Seerah Review Streak", "🌱"],
    [7, -830007, "7-Day Seerah Review Streak", "⭐"],
    [30, -830030, "30-Day Seerah Review Champion", "🏆"]
  ];
  for (const [target, activityId, title, icon] of milestones) {
    if (streak < target) continue;
    exec(sql`
      INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon)
      VALUES (${childId}, ${today()}, ${activityId}, ${title}, ${icon});
    `);
  }
}

function quizResultsForParent(user) {
  const scope = visibleChildWhere(user, "c");
  return db(`
    SELECT qa.*, q.title, q.subject, q.quiz_type, c.name AS kid_name
    FROM quiz_attempts qa
    JOIN quizzes q ON q.id = qa.quiz_id
    JOIN children c ON c.id = qa.kid_id
    WHERE ${scope}
    ORDER BY qa.completed_at DESC
    LIMIT 80;
  `);
}

function quizAnswerIsCorrect(quiz, answer, selectedAnswers = []) {
  const type = String(quiz.quiz_type || "");
  const correctMany = parseJsonArray(quiz.multiple_correct_answers).map((item) => String(item).trim()).filter(Boolean).sort();
  if (type === "multiple_correct" && correctMany.length) {
    const selected = (Array.isArray(selectedAnswers) ? selectedAnswers : parseJsonArray(selectedAnswers)).map((item) => String(item).trim()).filter(Boolean).sort();
    return selected.length === correctMany.length && selected.every((item, index) => item === correctMany[index]);
  }
  return String(answer || "").trim().toLowerCase() === String(quiz.correct_answer || "").trim().toLowerCase();
}

function normalizeQuizPayload(body = {}, user) {
  const options = Array.isArray(body.options)
    ? body.options
    : String(body.options_text || body.options || "").split("\n");
  const multiple = Array.isArray(body.multiple_correct_answers)
    ? body.multiple_correct_answers
    : String(body.multiple_correct_answers || "").split("\n");
  return {
    title: String(body.title || "").trim(),
    subject: String(body.subject || "Reading").trim(),
    quiz_type: String(body.quiz_type || "select_3").trim(),
    instructions: String(body.instructions || "").trim(),
    difficulty: ["easy", "medium", "hard"].includes(body.difficulty) ? body.difficulty : "easy",
    level: Math.max(1, Number(body.level || 1)),
    question_text: String(body.question_text || "").trim(),
    story_text: String(body.story_text || "").trim(),
    image_url: String(body.image_url || "").trim(),
    audio_url: String(body.audio_url || "").trim(),
    emoji_prompt: String(body.emoji_prompt || "").trim(),
    options: JSON.stringify(options.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)),
    correct_answer: String(body.correct_answer || "").trim(),
    multiple_correct_answers: JSON.stringify(multiple.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)),
    explanation: String(body.explanation || "").trim(),
    timer_seconds: Math.max(0, Number(body.timer_seconds || 0)),
    hearts: Math.max(0, Number(body.hearts || 0)),
    required_score_to_pass: Math.max(1, Number(body.required_score_to_pass || 1)),
    xp_reward: Math.max(0, Number(body.xp_reward || 10)),
    coin_reward: Math.max(0, Number(body.coin_reward || 5)),
    badge_reward: String(body.badge_reward || "").trim(),
    unlock_next_level: body.unlock_next_level === true || body.unlock_next_level === "on" || body.unlock_next_level === 1 ? 1 : 0,
    status: body.status === "inactive" ? "inactive" : "active",
    created_by_parent_id: Number(user.id),
    assigned_to_kid_id: body.assigned_to_kid_id ? Number(body.assigned_to_kid_id) : null,
    due_date: body.due_date || null
  };
}

function ensureQuizOwner(user, quizId) {
  const quiz = db(sql`SELECT * FROM quizzes WHERE id = ${Number(quizId)} LIMIT 1;`)[0];
  if (!quiz) throw Object.assign(new Error("Quiz not found."), { status: 404 });
  if (!isAdmin(user) && Number(quiz.created_by_parent_id) !== Number(user.id)) {
    throw Object.assign(new Error("You can only manage quizzes for your family."), { status: 403 });
  }
  return quizRow(quiz);
}

function ensureQuizChildAssignment(user, assignedKidId) {
  if (!assignedKidId) return;
  requireChildAccess(user, assignedKidId);
}

function awardQuizBadges(childId, quiz, correct, passed) {
  if (!correct) return;
  const date = today();
  const correctCount = Number(db(sql`
    SELECT COUNT(*) AS count
    FROM quiz_attempts
    WHERE kid_id = ${childId} AND score > 0;
  `)[0]?.count || 0);
  const badges = [];
  if (correctCount >= 5) badges.push({ id: -810005, title: "5 Quiz Answers", icon: "🎯" });
  if (correctCount >= 10) badges.push({ id: -810010, title: "10 Quiz Answers", icon: "🧠" });
  if (passed) badges.push({ id: -810100 - Number(quiz.id), title: "Perfect Quiz", icon: "⭐" });
  if (quiz.quiz_type === "daily_quiz_mission") badges.push({ id: -810200 - Number(quiz.id), title: "Daily Quiz Mission", icon: "📅" });
  if (quiz.badge_reward) badges.push({ id: -810300 - Number(quiz.id), title: quiz.badge_reward, icon: "🏅" });
  for (const badge of badges) {
    exec(sql`
      INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon)
      VALUES (${childId}, ${date}, ${badge.id}, ${badge.title}, ${badge.icon});
    `);
  }
}

function awardSeerahBadges(childId) {
  const completed = Number(seerahQuizProgressFor(childId).completed || 0);
  const milestones = [
    [1, -820001, "Seerah Beginner", "🌙"],
    [10, -820010, "Prophet’s Life Learner", "📖"],
    [25, -820025, "Good Akhlaq Star", "⭐"],
    [50, -820050, "50 Questions Champion", "🏆"],
    [100, -820100, "100 Questions Master", "👑"]
  ];
  for (const [target, activityId, title, icon] of milestones) {
    if (completed < target) continue;
    exec(sql`
      INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon)
      VALUES (${childId}, ${today()}, ${activityId}, ${title}, ${icon});
    `);
  }
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

function awardActivityIfNeeded(log, activity) {
  if (log.awarded_points > 0 || log.status !== "approved") return;
  addPoints(log.child_id, activity.points, "activity", log.id, `${activity.title} approved`);
  exec(sql`UPDATE activity_logs SET awarded_points = ${activity.points}, updated_at = CURRENT_TIMESTAMP WHERE id = ${log.id};`);
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
      DELETE FROM avatar_purchases;
      DELETE FROM avatar_items;
      DELETE FROM reward_discounts;
      DELETE FROM child_reflections;
      DELETE FROM early_bird_checkins;
      DELETE FROM quiz_attempts;
      DELETE FROM quiz_category_assignments;
      DELETE FROM seerah_review_questions;
      DELETE FROM seerah_review_sessions;
      DELETE FROM seerah_review_practice;
      DELETE FROM seerah_review_settings;
      DELETE FROM rescue_quiz_questions;
      DELETE FROM rescue_quiz_sessions;
      DELETE FROM recovery_missions;
      DELETE FROM streak_history;
      DELETE FROM streak_states;
      DELETE FROM streak_recovery_settings;
      DELETE FROM seerah_quiz_progress;
      DELETE FROM quizzes;
      DELETE FROM child_pets;
      DELETE FROM child_wallets;
      DELETE FROM child_moods;
      DELETE FROM parent_praise_messages;
      DELETE FROM app_settings;
      DELETE FROM sports_videos;
      DELETE FROM quran_favorite_surahs;
      DELETE FROM quran_revision_logs;
      DELETE FROM quran_memorization_logs;
      DELETE FROM quran_juz_awards;
      DELETE FROM quran_surah_progress;
      DELETE FROM quran_reading_assignments;
      DELETE FROM hifz_plan;
    DELETE FROM daily_challenge_completions;
    DELETE FROM badges;
    DELETE FROM point_transactions;
    DELETE FROM reward_redemptions;
      DELETE FROM rewards;
      DELETE FROM activity_daily_skips;
      DELETE FROM activity_assignments;
    DELETE FROM activity_logs;
    DELETE FROM activities;
    DELETE FROM users;
    DELETE FROM children;
  `);
  insertRows("children", backup.children, ["id", "name", "avatar", "total_points", "created_at", "parent_id"]);
  insertRows("users", backup.users, ["id", "name", "email", "password_hash", "role", "child_id", "created_at"]);
  insertRows("activities", backup.activities, ["id", "title", "description", "points", "duration_minutes", "frequency", "show_weekdays", "show_weekends", "day_0", "day_1", "day_2", "day_3", "day_4", "day_5", "day_6", "task_date", "proof_required", "requires_approval", "is_prayer", "active", "created_at", "parent_id", "subject", "task_type", "task_data"]);
  insertRows("activity_logs", backup.activity_logs, ["id", "child_id", "activity_id", "log_date", "status", "proof", "prayer_state", "awarded_points", "created_at", "updated_at", "interactive_answer", "interactive_score"]);
  insertRows("activity_assignments", backup.activity_assignments, ["child_id", "activity_id", "enabled"]);
  insertRows("activity_daily_skips", backup.activity_daily_skips || [], ["id", "child_id", "activity_id", "skip_date", "reason", "created_by", "created_at"]);
  insertRows("rewards", backup.rewards, ["id", "title", "description", "required_points", "active", "created_at", "parent_id"]);
  insertRows("reward_redemptions", backup.reward_redemptions, ["id", "child_id", "reward_id", "points_spent", "status", "redeemed_at"]);
  insertRows("point_transactions", backup.point_transactions, ["id", "child_id", "source_type", "source_id", "points", "note", "created_at"]);
  insertRows("daily_challenges", backup.daily_challenges, ["challenge_date", "activity_id", "created_at"]);
  insertRows("badges", backup.badges, ["id", "child_id", "badge_date", "activity_id", "title", "icon", "created_at"]);
  insertRows("daily_challenge_completions", backup.daily_challenge_completions, ["id", "child_id", "challenge_date", "activity_id", "created_at"]);
  insertRows("reward_discounts", backup.reward_discounts, ["period_key", "reward_id", "discount_percent", "created_at"]);
  insertRows("family_quest_awards", backup.family_quest_awards, ["id", "award_date", "child_id", "points", "created_at"]);
  insertRows("avatar_items", backup.avatar_items, ["id", "title", "icon", "item_type", "cost", "active", "created_at"]);
  insertRows("avatar_purchases", backup.avatar_purchases, ["id", "child_id", "item_id", "equipped", "purchased_at"]);
  insertRows("parent_challenges", backup.parent_challenges, ["id", "title", "description", "target_count", "bonus_points", "start_date", "end_date", "child_id", "active", "created_at", "parent_id"]);
  insertRows("parent_challenge_awards", backup.parent_challenge_awards, ["id", "challenge_id", "child_id", "points", "awarded_at"]);
  insertRows("child_reflections", backup.child_reflections, ["id", "child_id", "reflection_date", "enjoyed_activity", "feeling", "note", "created_at"]);
  insertRows("early_bird_checkins", backup.early_bird_checkins, ["id", "child_id", "checkin_date", "checkin_time", "status", "awarded_points", "created_at"]);
  insertRows("quizzes", backup.quizzes, ["id", "title", "subject", "quiz_type", "instructions", "difficulty", "level", "question_text", "story_text", "image_url", "audio_url", "emoji_prompt", "options", "correct_answer", "multiple_correct_answers", "explanation", "timer_seconds", "hearts", "required_score_to_pass", "xp_reward", "coin_reward", "badge_reward", "unlock_next_level", "status", "created_by_parent_id", "assigned_to_kid_id", "due_date", "created_at", "updated_at", "category_key", "category_question_id"]);
  insertRows("quiz_attempts", backup.quiz_attempts, ["id", "quiz_id", "kid_id", "parent_id", "answer", "selected_answers", "score", "passed", "attempts", "time_used_seconds", "hearts_left", "streak_bonus", "xp_earned", "coins_earned", "completed_at", "feedback"]);
  insertRows("quiz_category_assignments", backup.quiz_category_assignments, ["category_key", "child_id", "assigned_by_parent_id", "enabled", "assigned_at", "updated_at"]);
  insertRows("seerah_quiz_progress", backup.seerah_quiz_progress, ["child_id", "current_question", "current_level", "questions_completed_in_level", "completed", "updated_at"]);
  insertRows("seerah_review_settings", backup.seerah_review_settings, ["child_id", "enabled", "question_count", "updated_at"]);
  insertRows("seerah_review_sessions", backup.seerah_review_sessions, ["id", "child_id", "review_date", "status", "total_questions", "current_index", "correct_answers", "wrong_answers", "hasnat_earned", "completion_bonus", "perfect_bonus", "started_at", "completed_at", "created_at", "updated_at"]);
  insertRows("seerah_review_questions", backup.seerah_review_questions, ["id", "session_id", "position", "quiz_id", "option_order", "answer", "correct", "hasnat_earned", "answered_at"]);
  insertRows("seerah_review_practice", backup.seerah_review_practice, ["child_id", "quiz_id", "wrong_count", "correct_count", "priority", "last_wrong_at", "updated_at"]);
  insertRows("streak_recovery_settings", backup.streak_recovery_settings, ["child_id", "enabled", "max_shields", "recovery_difficulty", "updated_at"]);
  insertRows("streak_states", backup.streak_states, ["child_id", "current_streak", "shields", "last_active_date", "last_processed_date", "active_days_since_shield", "tree_points", "tree_health", "recovery_status", "missed_days", "recovery_required", "recovery_completed", "updated_at"]);
  insertRows("streak_history", backup.streak_history, ["id", "child_id", "event_date", "event_type", "streak_before", "streak_after", "shields_before", "shields_after", "note", "created_at"]);
  insertRows("recovery_missions", backup.recovery_missions, ["id", "child_id", "recovery_key", "mission_type", "title", "completed", "completed_at", "source_type", "source_id", "created_at"]);
  insertRows("rescue_quiz_sessions", backup.rescue_quiz_sessions, ["id", "child_id", "recovery_key", "status", "total_questions", "current_index", "correct_answers", "passed", "hasnat_earned", "created_at", "completed_at"]);
  insertRows("rescue_quiz_questions", backup.rescue_quiz_questions, ["id", "session_id", "position", "quiz_id", "option_order", "answer", "correct", "answered_at"]);
  insertRows("child_wallets", backup.child_wallets, ["child_id", "xp", "coins", "gems", "keys", "treasure_tickets", "updated_at"]);
  insertRows("child_pets", backup.child_pets, ["child_id", "pet_type", "pet_name", "happiness", "pet_level", "updated_at"]);
  insertRows("child_moods", backup.child_moods, ["id", "child_id", "mood_date", "mood", "note", "created_at"]);
  insertRows("parent_praise_messages", backup.parent_praise_messages, ["id", "parent_id", "child_id", "message", "status", "created_at", "seen_at"]);
  insertRows("app_settings", backup.app_settings, ["setting_key", "setting_value", "updated_at"]);
  insertRows("sports_videos", backup.sports_videos, ["id", "exercise_key", "title", "source_type", "video_url", "thumbnail_url", "explanation", "safety_tips", "difficulty", "duration_seconds", "enabled", "ai_analysis_ready", "ai_feedback_prompt", "created_by_parent_id", "created_at", "updated_at"]);
  insertRows("quran_favorite_surahs", backup.quran_favorite_surahs, ["child_id", "surah_id", "created_at"]);
  insertRows("quran_revision_logs", backup.quran_revision_logs, ["id", "child_id", "surah_id", "revision_date", "awarded_points", "created_at"]);
  insertRows("quran_surah_progress", backup.quran_surah_progress, ["child_id", "surah_id", "memorized_verses", "surah_bonus_awarded", "updated_at"]);
  insertRows("quran_juz_awards", backup.quran_juz_awards, ["child_id", "juz_number", "awarded_at"]);
  insertRows("quran_memorization_logs", backup.quran_memorization_logs, ["id", "child_id", "surah_id", "log_date", "verses_added", "created_at"]);
  insertRows("quran_reading_assignments", backup.quran_reading_assignments || [], ["id", "child_id", "surah_id", "sort_order", "target_date", "priority", "private_notes", "status", "child_submitted_at", "parent_feedback", "encouragement", "approved_at", "approved_by", "hasanat_awarded", "created_by", "created_at", "updated_at"]);
  insertRows("hifz_plan", backup.hifz_plan, ["id", "user_id", "plan_date", "day_name", "page_number", "juz_number", "page_in_juz", "surah_number", "surah_name", "surah_name_arabic", "surah_name_english", "ayah_range", "memorization_task", "revision_task", "memorized", "revised", "weekly_review_done", "juz_review_done", "parent_reviewed", "notes", "parent_notes", "points_earned", "badges_earned", "streak_count", "completed_at", "created_at", "updated_at"]);
  exec("PRAGMA foreign_keys = ON;");
  ensureActivityAssignments();
  seedSeerahQuiz();
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
  if (!["admin", "parent"].includes(user.role)) throw Object.assign(new Error("Parent access required"), { status: 403 });
  return user;
}

function isAdmin(user) {
  return user?.role === "admin";
}

function visibleChildIds(user) {
  if (isAdmin(user)) return db("SELECT id FROM children ORDER BY id;").map((child) => Number(child.id));
  if (user.role === "parent") return db(sql`SELECT id FROM children WHERE parent_id = ${user.id} ORDER BY id;`).map((child) => Number(child.id));
  return user.child_id ? [Number(user.child_id)] : [];
}

function canAccessChild(user, childId) {
  return visibleChildIds(user).includes(Number(childId));
}

function requireChildAccess(user, childId) {
  if (!canAccessChild(user, childId)) throw Object.assign(new Error("You can only access your own children."), { status: 403 });
}

function visibleChildWhere(user, alias = "c") {
  const ids = visibleChildIds(user);
  return ids.length ? `${alias}.id IN (${ids.map(Number).join(",")})` : "1 = 0";
}

function visibleActivityWhere(user, alias = "a") {
  if (isAdmin(user)) return "1 = 1";
  return `(${alias}.parent_id IS NULL OR ${alias}.parent_id = ${Number(user.id)})`;
}

function childIdFor(req, explicitId) {
  const user = requireUser(req);
  if (user.role === "child") return user.child_id;
  if (explicitId) {
    const child = db(sql`SELECT id FROM children WHERE id = ${Number(explicitId)};`)[0];
    if (child) requireChildAccess(user, child.id);
    if (child) return child.id;
  }
  return Number(visibleChildIds(user)[0] || 0);
}

function dateOffset(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function daysBetween(fromDate, toDate) {
  return Math.max(0, Math.round((new Date(`${toDate}T12:00:00`) - new Date(`${fromDate}T12:00:00`)) / 86400000));
}

function recoveryRequirement(missedDays) {
  if (missedDays <= 1) return 1;
  if (missedDays === 2) return 2;
  return 4;
}

const RECOVERY_MISSION_TYPES = [
  ["sports", "Complete a sports activity"],
  ["islamic", "Complete an Islamic activity"],
  ["reading", "Complete a reading activity"],
  ["family_helping", "Help your family"],
  ["daily_review", "Complete the Daily Seerah Review Quiz"]
];

function generateRecoveryMissions(childId, recoveryKey, required) {
  for (let index = 0; index < required; index += 1) {
    const [type, title] = RECOVERY_MISSION_TYPES[index % RECOVERY_MISSION_TYPES.length];
    exec(sql`
      INSERT OR IGNORE INTO recovery_missions (child_id, recovery_key, mission_type, title)
      VALUES (${childId}, ${recoveryKey}, ${type}, ${title});
    `);
  }
}

function processStreakRecovery(childId, date = today()) {
  exec(sql`
    INSERT OR IGNORE INTO streak_recovery_settings (child_id, enabled, max_shields, recovery_difficulty)
    VALUES (${childId}, 1, 3, 'normal');
    INSERT OR IGNORE INTO streak_states (
      child_id, current_streak, shields, last_active_date, last_processed_date,
      active_days_since_shield, tree_points, tree_health
    ) VALUES (${childId}, 28, 3, ${dateOffset(date, -1)}, ${date}, 0, 28, 100);
  `);
  const settings = db(sql`SELECT * FROM streak_recovery_settings WHERE child_id = ${childId};`)[0];
  let state = db(sql`SELECT * FROM streak_states WHERE child_id = ${childId};`)[0];
  if (!state || state.recovery_status === "active") return state;
  const yesterday = dateOffset(date, -1);
  const lastActive = state.last_active_date || yesterday;
  const missedDays = Math.max(0, daysBetween(lastActive, yesterday));
  if (missedDays === 0) {
    exec(sql`UPDATE streak_states SET last_processed_date = ${date}, updated_at = CURRENT_TIMESTAMP WHERE child_id = ${childId};`);
    return db(sql`SELECT * FROM streak_states WHERE child_id = ${childId};`)[0];
  }

  const beforeStreak = Number(state.current_streak || 0);
  const beforeShields = Number(state.shields || 0);
  if (!Number(settings?.enabled || 0)) {
    exec(sql`
      UPDATE streak_states SET current_streak = 0, shields = 0, last_active_date = ${yesterday},
        last_processed_date = ${date}, active_days_since_shield = 0, tree_health = 45,
        recovery_status = 'none', missed_days = 0, recovery_required = 0, recovery_completed = 0,
        updated_at = CURRENT_TIMESTAMP WHERE child_id = ${childId};
      INSERT INTO streak_history (child_id, event_date, event_type, streak_before, streak_after, shields_before, shields_after, note)
      VALUES (${childId}, ${date}, 'streak_lost', ${beforeStreak}, 0, ${beforeShields}, 0, ${`${missedDays} missed day(s); recovery disabled.`});
    `);
    return db(sql`SELECT * FROM streak_states WHERE child_id = ${childId};`)[0];
  }

  const shieldUses = Math.min(missedDays, beforeShields);
  const uncoveredDays = missedDays - shieldUses;
  const shieldsAfter = beforeShields - shieldUses;
  if (shieldUses > 0) {
    exec(sql`
      INSERT INTO streak_history (child_id, event_date, event_type, streak_before, streak_after, shields_before, shields_after, note)
      VALUES (${childId}, ${date}, 'shield_used', ${beforeStreak}, ${beforeStreak}, ${beforeShields}, ${shieldsAfter}, ${`${shieldUses} shield(s) protected the streak.`});
    `);
  }
  if (uncoveredDays === 0) {
    exec(sql`
      UPDATE streak_states SET shields = ${shieldsAfter}, last_active_date = ${yesterday},
        last_processed_date = ${date}, tree_health = MAX(75, tree_health - ${shieldUses * 5}),
        updated_at = CURRENT_TIMESTAMP WHERE child_id = ${childId};
    `);
    return db(sql`SELECT * FROM streak_states WHERE child_id = ${childId};`)[0];
  }

  const required = recoveryRequirement(uncoveredDays);
  const recoveryKey = `${date}-${uncoveredDays}`;
  exec(sql`
    UPDATE streak_states SET shields = ${shieldsAfter}, last_processed_date = ${date},
      recovery_status = 'active', missed_days = ${uncoveredDays}, recovery_required = ${required},
      recovery_completed = 0, tree_health = 45, updated_at = CURRENT_TIMESTAMP
    WHERE child_id = ${childId};
    INSERT INTO streak_history (child_id, event_date, event_type, streak_before, streak_after, shields_before, shields_after, note)
    VALUES (${childId}, ${date}, 'recovery_started', ${beforeStreak}, ${beforeStreak}, ${beforeShields}, ${shieldsAfter}, ${`${uncoveredDays} unprotected missed day(s).`});
  `);
  generateRecoveryMissions(childId, recoveryKey, required);
  return db(sql`SELECT * FROM streak_states WHERE child_id = ${childId};`)[0];
}

function completeRecovery(childId, source = "missions") {
  const state = db(sql`SELECT * FROM streak_states WHERE child_id = ${childId};`)[0];
  if (!state || state.recovery_status !== "active") return false;
  const rewardHasnat = 25 + Number(state.recovery_required || 0) * 5;
  const wallet = walletFor(childId);
  addPoints(childId, rewardHasnat, "streak_recovery", -Number(childId), "Streak comeback completed");
  exec(sql`
    UPDATE child_wallets SET gems = gems + 1, updated_at = CURRENT_TIMESTAMP WHERE child_id = ${childId};
    UPDATE streak_states SET recovery_status = 'none', missed_days = 0, recovery_required = 0,
      recovery_completed = 0, last_active_date = ${dateOffset(today(), -1)}, tree_health = 100,
      tree_points = tree_points + 2, updated_at = CURRENT_TIMESTAMP WHERE child_id = ${childId};
    INSERT INTO streak_history (child_id, event_date, event_type, streak_before, streak_after, shields_before, shields_after, note)
    VALUES (${childId}, ${today()}, 'recovery_completed', ${state.current_streak}, ${state.current_streak}, ${state.shields}, ${state.shields}, ${`Comeback completed through ${source}. +${rewardHasnat} Hasnat and +1 gem.`});
    INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon)
    VALUES (${childId}, ${today()}, -840002, 'Comeback Hero', '🌟');
  `);
  if (Number(state.missed_days || 0) >= 3) {
    exec(sql`INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon) VALUES (${childId}, ${today()}, -840003, 'Learning Warrior', '🛡️');`);
  }
  return Boolean(wallet);
}

function markDailyStreakActivity(childId, sourceType = "activity", sourceId = 0) {
  processStreakRecovery(childId);
  let state = db(sql`SELECT * FROM streak_states WHERE child_id = ${childId};`)[0];
  if (!state || state.recovery_status === "active" || state.last_active_date === today()) return;
  const settings = db(sql`SELECT * FROM streak_recovery_settings WHERE child_id = ${childId};`)[0] || {};
  const beforeStreak = Number(state.current_streak || 0);
  const beforeShields = Number(state.shields || 0);
  const nextStreak = state.last_active_date === dateOffset(today(), -1) ? beforeStreak + 1 : Math.max(1, beforeStreak);
  const activeDays = Number(state.active_days_since_shield || 0) + 1;
  const earnsShield = activeDays >= 7 && beforeShields < Number(settings.max_shields || 3);
  const nextShields = earnsShield ? beforeShields + 1 : beforeShields;
  exec(sql`
    UPDATE streak_states SET current_streak = ${nextStreak}, shields = ${nextShields},
      last_active_date = ${today()}, last_processed_date = ${today()},
      active_days_since_shield = ${earnsShield ? 0 : activeDays}, tree_points = tree_points + 1,
      tree_health = MIN(100, tree_health + 10), updated_at = CURRENT_TIMESTAMP
    WHERE child_id = ${childId};
    INSERT INTO streak_history (child_id, event_date, event_type, streak_before, streak_after, shields_before, shields_after, note)
    VALUES (${childId}, ${today()}, 'active_day', ${beforeStreak}, ${nextStreak}, ${beforeShields}, ${nextShields}, ${`${sourceType} ${sourceId}`});
  `);
  if (earnsShield) {
    exec(sql`
      INSERT INTO streak_history (child_id, event_date, event_type, streak_before, streak_after, shields_before, shields_after, note)
      VALUES (${childId}, ${today()}, 'shield_earned', ${nextStreak}, ${nextStreak}, ${beforeShields}, ${nextShields}, 'Seven active days earned a Streak Shield.');
      INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon)
      VALUES (${childId}, ${today()}, -840001, 'Streak Guardian', '🛡️');
    `);
  }
}

function activityRecoveryType(activity) {
  const text = `${activity.title || ""} ${activity.subject || ""}`.toLowerCase();
  if (text.includes("sport") || text.includes("fitness") || text.includes("squat") || text.includes("run") || text.includes("jump")) return "sports";
  if (text.includes("quran") || text.includes("prayer") || text.includes("islam")) return "islamic";
  if (text.includes("read") || text.includes("writing") || text.includes("english") || text.includes("german")) return "reading";
  if (text.includes("help") || text.includes("house") || text.includes("clean") || text.includes("teamwork") || text.includes("organization")) return "family_helping";
  return "";
}

function advanceRecoveryMission(childId, missionType, sourceType, sourceId) {
  if (!missionType) return;
  const state = processStreakRecovery(childId);
  if (!state || state.recovery_status !== "active") return;
  const mission = db(sql`
    SELECT * FROM recovery_missions
    WHERE child_id = ${childId} AND completed = 0 AND mission_type = ${missionType}
    ORDER BY id LIMIT 1;
  `)[0];
  if (!mission) return;
  exec(sql`
    UPDATE recovery_missions SET completed = 1, completed_at = CURRENT_TIMESTAMP,
      source_type = ${sourceType}, source_id = ${sourceId} WHERE id = ${mission.id};
    UPDATE streak_states SET recovery_completed = recovery_completed + 1, updated_at = CURRENT_TIMESTAMP
    WHERE child_id = ${childId};
  `);
  const next = db(sql`SELECT * FROM streak_states WHERE child_id = ${childId};`)[0];
  if (Number(next.recovery_completed || 0) >= Number(next.recovery_required || 0)) completeRecovery(childId, "recovery missions");
}

function learningTreeFor(state) {
  const points = Number(state.tree_points || 0);
  const stages = [
    [28, "Golden Tree", "🌳✨"],
    [21, "Strong Tree", "🌳"],
    [14, "Young Tree", "🌲"],
    [7, "Small Plant", "🌿"],
    [0, "Seed", "🌱"]
  ];
  const stage = stages.find(([target]) => points >= target) || stages.at(-1);
  return { stage: stage[1], icon: stage[2], points, health: Number(state.tree_health || 100), weak: Number(state.tree_health || 100) < 70 };
}

function rescueQuestionFor(session) {
  if (!session || session.status !== "in_progress") return null;
  const row = db(sql`
    SELECT rqq.id AS rescue_question_id, rqq.position, rqq.option_order, q.id AS quiz_id,
      q.category_question_id, q.question_text, q.difficulty
    FROM rescue_quiz_questions rqq
    JOIN quizzes q ON q.id = rqq.quiz_id
    WHERE rqq.session_id = ${session.id} AND rqq.position = ${Number(session.current_index || 0) + 1}
    LIMIT 1;
  `)[0];
  return row ? {
    rescue_question_id: row.rescue_question_id,
    position: Number(row.position),
    question_number: Number(row.category_question_id),
    question_text: row.question_text,
    difficulty: row.difficulty,
    options: parseJsonArray(row.option_order)
  } : null;
}

function startRescueQuiz(childId) {
  const recovery = streakRecoveryFor(childId);
  if (recovery.recovery_status !== "active") throw Object.assign(new Error("No streak recovery is needed right now."), { status: 400 });
  const recoveryKey = recovery.missions[0]?.recovery_key;
  if (!recoveryKey) throw Object.assign(new Error("Recovery missions are not ready yet."), { status: 400 });
  const count = recovery.difficulty === "hard" ? 10 : recovery.difficulty === "easy" ? 5 : 7;
  let session = db(sql`SELECT * FROM rescue_quiz_sessions WHERE child_id = ${childId} AND recovery_key = ${recoveryKey};`)[0];
  if (session?.status === "in_progress" || session?.status === "completed") return session;
  if (session?.status === "failed") {
    exec(sql`
      DELETE FROM rescue_quiz_questions WHERE session_id = ${session.id};
      UPDATE rescue_quiz_sessions SET status = 'in_progress', current_index = 0, correct_answers = 0,
        passed = 0, hasnat_earned = 0, created_at = CURRENT_TIMESTAMP, completed_at = NULL
      WHERE id = ${session.id};
    `);
  } else {
    exec(sql`
      INSERT INTO rescue_quiz_sessions (child_id, recovery_key, total_questions)
      VALUES (${childId}, ${recoveryKey}, ${count});
    `);
    session = db(sql`SELECT * FROM rescue_quiz_sessions WHERE child_id = ${childId} AND recovery_key = ${recoveryKey};`)[0];
  }
  const progress = seerahQuizProgressFor(childId);
  const unlocked = Math.max(1, Math.min(SEERAH_QUESTIONS.length, Number(progress.current_question || 1)));
  const available = db(sql`
    SELECT q.* FROM quizzes q
    WHERE q.category_key = ${SEERAH_CATEGORY_KEY} AND q.category_question_id <= ${unlocked} AND q.status = 'active';
  `).map(quizRow);
  const priorityIds = db(sql`
    SELECT quiz_id FROM seerah_review_practice WHERE child_id = ${childId} AND priority > 0 ORDER BY priority DESC;
  `).map((row) => Number(row.quiz_id));
  const byId = new Map(available.map((quiz) => [Number(quiz.id), quiz]));
  const selected = [];
  for (const id of priorityIds) {
    const quiz = byId.get(id);
    if (quiz && !selected.some((item) => item.id === quiz.id)) selected.push(quiz);
    if (selected.length >= count) break;
  }
  for (const quiz of shuffled(available)) {
    if (selected.length >= Math.min(count, available.length)) break;
    if (!selected.some((item) => item.id === quiz.id)) selected.push(quiz);
  }
  const learnedPool = shuffled(available);
  let repeatIndex = 0;
  while (selected.length < count && learnedPool.length > 0) {
    selected.push(learnedPool[repeatIndex % learnedPool.length]);
    repeatIndex += 1;
  }
  const ordered = shuffled(selected);
  exec(sql`UPDATE rescue_quiz_sessions SET total_questions = ${ordered.length} WHERE id = ${session.id};`);
  ordered.forEach((quiz, index) => {
    exec(sql`
      INSERT OR IGNORE INTO rescue_quiz_questions (session_id, position, quiz_id, option_order)
      VALUES (${session.id}, ${index + 1}, ${quiz.id}, ${JSON.stringify(shuffled(quiz.options))});
    `);
  });
  return db(sql`SELECT * FROM rescue_quiz_sessions WHERE id = ${session.id};`)[0];
}

function streakRecoveryFor(childId) {
  const state = processStreakRecovery(childId);
  const settings = db(sql`SELECT * FROM streak_recovery_settings WHERE child_id = ${childId};`)[0] || {};
  const missions = db(sql`
    SELECT * FROM recovery_missions
    WHERE child_id = ${childId}
      AND recovery_key = (SELECT recovery_key FROM recovery_missions WHERE child_id = ${childId} ORDER BY id DESC LIMIT 1)
    ORDER BY id;
  `);
  const activeRecoveryKey = missions[0]?.recovery_key || "";
  const rescue = activeRecoveryKey
    ? db(sql`SELECT * FROM rescue_quiz_sessions WHERE child_id = ${childId} AND recovery_key = ${activeRecoveryKey} LIMIT 1;`)[0] || null
    : null;
  const history = db(sql`SELECT * FROM streak_history WHERE child_id = ${childId} ORDER BY id DESC LIMIT 30;`);
  const child = db(sql`SELECT parent_id FROM children WHERE id = ${childId};`)[0];
  const familyStates = db(sql`
    SELECT ss.current_streak FROM streak_states ss JOIN children c ON c.id = ss.child_id
    WHERE c.parent_id = ${Number(child?.parent_id || 0)};
  `);
  if (Number(state.shields || 0) > 0) {
    exec(sql`INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon) VALUES (${childId}, ${today()}, -840001, 'Streak Guardian', '🛡️');`);
  }
  if (Number(state.tree_points || 0) >= 28) {
    exec(sql`INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon) VALUES (${childId}, ${today()}, -840005, 'Golden Tree Champion', '🌳');`);
  }
  return {
    enabled: Boolean(Number(settings.enabled || 0)),
    max_shields: Number(settings.max_shields || 3),
    difficulty: settings.recovery_difficulty || "normal",
    current_streak: Number(state.current_streak || 0),
    shields: Number(state.shields || 0),
    recovery_status: state.recovery_status,
    missed_days: Number(state.missed_days || 0),
    recovery_required: Number(state.recovery_required || 0),
    recovery_completed: Number(state.recovery_completed || 0),
    missions,
    rescue_quiz: rescue ? { ...rescue, current_question: rescueQuestionFor(rescue), pass_score: 80 } : null,
    tree: learningTreeFor(state),
    family_streak: familyStates.length ? Math.min(...familyStates.map((row) => Number(row.current_streak || 0))) : Number(state.current_streak || 0),
    history
  };
}

function dayStreakFor(childId) {
  return Number(processStreakRecovery(childId)?.current_streak || 0);
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
  const dayNumber = Math.floor((dateFromLocal(date) - dateFromLocal("2026-01-01")) / 86400000);
  const yesterday = addDays(date, -1);
  const yesterdayChallenge = db(sql`SELECT activity_id FROM daily_challenges WHERE challenge_date = ${yesterday} LIMIT 1;`)[0];
  let selected = activities[((dayNumber % activities.length) + activities.length) % activities.length] || activities[0];
  if (activities.length > 1 && yesterdayChallenge && Number(selected.id) === Number(yesterdayChallenge.activity_id)) {
    selected = activities[(activities.findIndex((activity) => Number(activity.id) === Number(selected.id)) + 1) % activities.length];
  }
  exec(sql`INSERT OR REPLACE INTO daily_challenges (challenge_date, activity_id) VALUES (${date}, ${selected.id});`);
  return db(sql`
    SELECT dc.challenge_date, a.*
    FROM daily_challenges dc
    JOIN activities a ON a.id = dc.activity_id
    WHERE dc.challenge_date = ${date};
  `)[0];
}

function ensureActivityAssignments() {
  exec(sql`
    INSERT OR IGNORE INTO activity_assignments (child_id, activity_id, enabled)
    SELECT c.id, a.id, CASE WHEN a.subject = ${SPORTS_SUBJECT} OR a.task_type = 'sports' THEN 0 ELSE 1 END
    FROM children c CROSS JOIN activities a
    WHERE a.active = 1;
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
  const period = days;
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
  const child = db(sql`SELECT parent_id FROM children WHERE id = ${childId};`)[0] || {};
  const challenges = db(sql`
    SELECT pc.*,
      (
        SELECT COUNT(*) FROM activity_logs l
        WHERE l.child_id = ${childId}
          AND l.log_date BETWEEN pc.start_date AND pc.end_date
          AND l.status IN ('completed','approved')
      ) AS progress
    FROM parent_challenges pc
    WHERE pc.active = 1 AND pc.start_date <= ${date} AND pc.end_date >= ${date} AND (pc.child_id IS NULL OR pc.child_id = ${childId}) AND (pc.parent_id IS NULL OR pc.parent_id = ${Number(child.parent_id || 0)})
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
  const familyQuest = null;
  const challenge = activityOfTheDay();
  const parentChallenges = parentChallengesFor(childId, date);
  const child = db(sql`SELECT * FROM children WHERE id = ${childId};`)[0];
  if (!child) {
    return {
      child: { id: 0, name: "No child yet", avatar: "⭐", total_points: 0 },
      date,
      activities: [],
      rewards: [],
      leaderboard: [],
      familyQuest,
      redemptionBoard: [],
      rewardDiscounts: [],
      activityOfTheDay: null,
      badges: [],
      missions: [],
      weeklyTheme: {},
      reflection: null,
      earlyBird: { rows: [] },
      quran: null,
      quranReading: { assignments: [], total_assigned: 0, total_completed: 0, pending_approval: 0, total_quran_hasanat: 0 },
      hifz: null,
      quizzes: [],
      wallet: { xp: 0, coins: 0, gems: 0, keys: 0, treasure_tickets: 0 },
      pet: null,
      praiseMessages: [],
      mood: null,
      settings: settingsMap(),
      quranicMotivationVisible: false,
      parentChallenges: [],
      personalBest: {},
      achievements: {},
      summary: { completed_today: 0, daily_target: 0, earned_points: 0, redeemed_points: 0, remaining_to_reward: 0 },
      points: { daily: 0, weekly: 0, total: 0 }
    };
  }
  const familyActivityScope = `(a.parent_id IS NULL OR a.parent_id = ${Number(child.parent_id || 0)})`;
  const activities = db(`
    SELECT a.*, COALESCE(l.status, 'pending') AS status, COALESCE(l.awarded_points, 0) AS awarded_points, COALESCE(l.prayer_state, '{}') AS prayer_state, COALESCE(l.interactive_answer, '') AS interactive_answer, COALESCE(l.interactive_score, 0) AS interactive_score, l.id AS log_id
    FROM activities a
    LEFT JOIN activity_assignments aa ON aa.activity_id = a.id AND aa.child_id = ${Number(childId)}
    LEFT JOIN activity_logs l ON l.activity_id = a.id AND l.child_id = ${Number(childId)} AND l.log_date = ${quote(date)}
    LEFT JOIN activity_daily_skips ads ON ads.activity_id = a.id AND ads.child_id = ${Number(childId)} AND ads.skip_date = ${quote(date)}
    WHERE a.active = 1 AND ${familyActivityScope} AND a.${scheduleColumn} = 1 AND COALESCE(aa.enabled, 1) = 1 AND ads.id IS NULL AND (a.task_date IS NULL OR a.task_date = ${quote(date)})
    ORDER BY
      CASE COALESCE(l.status, 'pending')
        WHEN 'pending' THEN 0
        WHEN 'rejected' THEN 1
        WHEN 'completed' THEN 2
        WHEN 'approved' THEN 3
        ELSE 0
      END,
      a.id;
  `).map((row) => {
    let taskData = {};
    try { taskData = JSON.parse(row.task_data || "{}"); } catch { taskData = {}; }
    return { ...row, task_data: taskData, is_daily_challenge: challenge && Number(row.id) === Number(challenge.id) ? 1 : 0, prayer_state: JSON.parse(row.prayer_state || "{}") };
  });
  const videoMap = sportsVideoMap();
  for (const activity of activities) {
    if (activity.subject === SPORTS_SUBJECT && activity.task_data?.exerciseKey) {
      activity.sports_video = videoMap[activity.task_data.exerciseKey] || null;
    }
  }
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
    LEFT JOIN activity_daily_skips ads ON ads.activity_id = a.id AND ads.child_id = ${Number(childId)} AND ads.skip_date = ${quote(date)}
    WHERE a.active = 1 AND ${familyActivityScope} AND a.frequency = 'daily' AND a.${scheduleColumn} = 1 AND COALESCE(aa.enabled, 1) = 1 AND ads.id IS NULL AND (a.task_date IS NULL OR a.task_date = ${quote(date)});
  `);
  const discounts = rewardDiscountsOfPeriod();
  const rewards = db(`SELECT * FROM rewards WHERE active = 1 AND (parent_id IS NULL OR parent_id = ${Number(child.parent_id || 0)}) ORDER BY required_points;`).map((reward) => ({
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
    WHERE parent_id = ${Number(child.parent_id || 0)}
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
    WHERE c.parent_id = ${Number(child.parent_id || 0)}
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
  const streakRecovery = streakRecoveryFor(childId);
  const missions = missionsFor(childId, date);
  const weeklyTheme = weeklyThemeFor(childId, date);
  const reflection = reflectionFor(childId, date);
  const earlyBird = earlyBirdBoard(date, childId);
  const personalBest = personalBestFor(childId);
  const quran = isHifzChild(child) ? quranProgressFor(childId) : null;
  const quranReading = quranReadingStats(childId);
  const quizzes = quizzesForKid(childId);
  const seerahQuiz = seerahQuizProgressFor(childId);
  const seerahReview = seerahReviewFor(childId, date);
  const wallet = walletFor(childId);
  const pet = petFor(childId);
  const praiseMessages = praiseFor(childId);
  const mood = moodFor(childId, date);
  const settings = settingsMap();
  const quranicVisible = quranicMotivationVisible(childId);
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
    weeklyTheme,
    reflection,
    earlyBird,
    quran,
    quranReading,
    hifz: null,
    quizzes,
    seerahQuiz,
    seerahReview,
    wallet,
    pet,
    praiseMessages,
    mood,
    settings,
    quranicMotivationVisible: quranicVisible,
    sports: sportsStatsFor(childId, date),
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
      { icon: "💎", title: "Hasanat Collector", requirement: "Reach 500 total Hasanat" },
      { icon: "🎁", title: "Reward Master", requirement: "Redeem 3 rewards" }
    ],
    streak,
    streakRecovery,
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

function parentTodayOverview(date = today(), user = null) {
  const scheduleColumn = dayColumn(date);
  const childScope = user ? `WHERE ${visibleChildWhere(user, "c")}` : "";
  const activityScope = user ? `AND ${visibleActivityWhere(user, "a")}` : "";
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
        LEFT JOIN activity_daily_skips ads ON ads.activity_id = a.id AND ads.child_id = c.id AND ads.skip_date = ${quote(date)}
        WHERE a.active = 1 AND a.${scheduleColumn} = 1 AND COALESCE(aa.enabled, 1) = 1 ${activityScope}
          AND (a.task_date IS NULL OR a.task_date = ${quote(date)})
          AND ads.id IS NULL
          AND COALESCE(l.status, 'pending') IN ('pending','rejected')
      ) AS missed_today,
      (
        SELECT COUNT(*) FROM activities a
        LEFT JOIN activity_assignments aa ON aa.activity_id = a.id AND aa.child_id = c.id
        LEFT JOIN activity_daily_skips ads ON ads.activity_id = a.id AND ads.child_id = c.id AND ads.skip_date = ${quote(date)}
        WHERE a.active = 1 AND a.${scheduleColumn} = 1 AND COALESCE(aa.enabled, 1) = 1 ${activityScope}
          AND (a.task_date IS NULL OR a.task_date = ${quote(date)})
          AND ads.id IS NULL
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
    ${childScope}
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

function parentSmartInsights(date = today(), user = null) {
  const week = weekInfo(date);
  const childScope = user ? `AND ${visibleChildWhere(user, "c")}` : "";
  const childJoinScope = user ? `WHERE ${visibleChildWhere(user, "c")}` : "";
  const activityScope = user ? `AND ${visibleActivityWhere(user, "a")}` : "";
  const bestActivity = db(`
    SELECT a.title, COUNT(*) AS count
    FROM activity_logs l JOIN activities a ON a.id = l.activity_id
    JOIN children c ON c.id = l.child_id
    WHERE l.log_date = ${quote(date)} AND l.status IN ('completed','approved') ${childScope} ${activityScope}
    GROUP BY a.id
    ORDER BY count DESC, a.title ASC
    LIMIT 1;
  `)[0] || null;
  const weakestActivity = db(`
    SELECT a.title, COUNT(*) AS missed
    FROM activities a
    LEFT JOIN activity_logs l ON l.activity_id = a.id AND l.log_date = ${quote(date)} AND l.status IN ('completed','approved')
    WHERE a.active = 1 AND l.id IS NULL ${activityScope}
    GROUP BY a.id
    ORDER BY missed DESC, a.title ASC
    LIMIT 1;
  `)[0] || null;
  const mostActive = db(`
    SELECT c.name, COUNT(l.id) AS completed
    FROM children c
    LEFT JOIN activity_logs l ON l.child_id = c.id AND l.log_date BETWEEN ${quote(week.start)} AND ${quote(week.end)} AND l.status IN ('completed','approved')
    ${childJoinScope}
    GROUP BY c.id
    ORDER BY completed DESC, c.name ASC
    LIMIT 1;
  `)[0] || null;
  const overview = parentTodayOverview(date, user);
  const needsAttention = [...overview].sort((a, b) => Number(b.missed_today || 0) - Number(a.missed_today || 0))[0] || null;
  const pendingApprovals = Number(db(`
    SELECT COUNT(*) AS count FROM activity_logs l
    JOIN children c ON c.id = l.child_id
    WHERE l.log_date = ${quote(date)} AND l.status = 'completed' ${user ? `AND ${visibleChildWhere(user, "c")}` : ""};
  `)[0].count || 0);
  const rewardRequests = Number(db(`
    SELECT COUNT(*) AS count FROM reward_redemptions rr
    JOIN children c ON c.id = rr.child_id
    WHERE rr.status = 'pending' ${user ? `AND ${visibleChildWhere(user, "c")}` : ""};
  `)[0].count || 0);
  return {
    best_activity_today: bestActivity?.title || "Not enough data yet",
    weakest_activity_today: weakestActivity?.title || "Not enough data yet",
    most_active_child_week: mostActive?.name || "Not enough data yet",
    child_needs_attention: needsAttention?.name || "No one right now",
    reward_requests_waiting: rewardRequests,
    pending_approvals_waiting: pendingApprovals
  };
}

function parentReflections(user = null) {
  const childScope = user ? `WHERE ${visibleChildWhere(user, "c")}` : "";
  return db(`
    SELECT cr.*, c.name AS child_name, c.avatar
    FROM child_reflections cr
    JOIN children c ON c.id = cr.child_id
    ${childScope}
    ORDER BY cr.reflection_date DESC, cr.created_at DESC
    LIMIT 30;
  `);
}

function reports(childId) {
  if (!Number(childId)) return { completed: [], weekly: [], monthly: [], best: null, missed: [], redeemed: [] };
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
    LEFT JOIN activity_daily_skips ads ON ads.activity_id = a.id AND ads.child_id = ${Number(childId)} AND ads.skip_date = ${quote(today())}
    WHERE a.active = 1 AND a.${scheduleColumn} = 1 AND COALESCE(aa.enabled, 1) = 1 AND ads.id IS NULL AND a.frequency = 'daily' AND (a.task_date IS NULL OR a.task_date = ${quote(today())}) AND COALESCE(l.status, 'pending') = 'pending';
  `);
  const redeemed = db(sql`
    SELECT rr.redeemed_at, r.title, rr.points_spent
    FROM reward_redemptions rr JOIN rewards r ON r.id = rr.reward_id
    WHERE rr.child_id = ${childId} AND rr.status = 'redeemed'
    ORDER BY rr.redeemed_at DESC LIMIT 20;
  `);
  const sports = sportsStatsFor(childId);
  const sportsTrends = db(sql`
    SELECT l.log_date AS date, COUNT(*) AS completed, COALESCE(SUM(a.duration_minutes), 0) AS duration
    FROM activity_logs l
    JOIN activities a ON a.id = l.activity_id
    WHERE l.child_id = ${childId} AND a.subject = ${SPORTS_SUBJECT} AND l.status IN ('completed','approved')
    GROUP BY l.log_date
    ORDER BY l.log_date DESC LIMIT 14;
  `);
  return { completed, weekly, monthly, best, missed, redeemed, sports, sportsTrends };
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

  if (method === "POST" && path === "/api/register-parent") {
    return send(res, 403, { error: "Parent registration is disabled. Admin must create parent accounts." });
  }

  if (method === "GET" && path === "/api/me") return send(res, 200, { user: requireUser(req) });
  if (method === "GET" && path === "/api/children") {
    const user = requireUser(req);
    return send(res, 200, { children: db(`SELECT * FROM children c WHERE ${visibleChildWhere(user, "c")} ORDER BY id;`) });
  }
  if (method === "GET" && path.startsWith("/api/dashboard")) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return send(res, 200, dashboardFor(childIdFor(req, url.searchParams.get("childId"))));
  }
  if (method === "GET" && path.startsWith("/api/reports")) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return send(res, 200, reports(childIdFor(req, url.searchParams.get("childId"))));
  }
  if (method === "GET" && path === "/api/admin") {
    const user = requireParent(req);
    ensureActivityAssignments();
    const childScope = visibleChildWhere(user, "c");
    const childIds = visibleChildIds(user);
    const childIdList = childIds.length ? childIds.join(",") : "0";
    const activityScope = visibleActivityWhere(user, "a");
    const quizScope = isAdmin(user) ? "1 = 1" : `q.created_by_parent_id = ${Number(user.id)}`;
    return send(res, 200, {
      children: db(`SELECT * FROM children c WHERE ${childScope} ORDER BY id;`),
      quranSurahs: QURAN_SURAHS.map((surah) => quranSurahMeta(surah.id)),
      quranReadingPlan: quranReadingParentRows(user),
      quranReadingPending: quranReadingParentRows(user).filter((row) => row.status === "submitted"),
      quranReadingReports: quranReadingParentReports(user),
      quranicVisibility: db(`SELECT c.id AS child_id, c.name, COALESCE(q.visible, 1) AS visible FROM children c LEFT JOIN child_quranic_settings q ON q.child_id = c.id WHERE ${childScope} ORDER BY c.name;`),
      sportsVideos: db("SELECT * FROM sports_videos ORDER BY exercise_key;"),
      sportsReports: db(`
        SELECT
          c.id AS child_id,
          c.name AS child_name,
          COUNT(CASE WHEN a.id IS NOT NULL AND l.status IN ('completed','approved') THEN 1 END) AS completed,
          COALESCE(SUM(CASE WHEN a.id IS NOT NULL AND l.status IN ('completed','approved') THEN a.duration_minutes ELSE 0 END), 0) AS duration,
          COALESCE((
            SELECT SUM(pt.points)
            FROM point_transactions pt
            LEFT JOIN activity_logs sl ON sl.id = pt.source_id AND pt.source_type = 'activity'
            LEFT JOIN activities sa ON sa.id = sl.activity_id
            WHERE pt.child_id = c.id AND (sa.subject = ${quote(SPORTS_SUBJECT)} OR pt.source_type LIKE 'sports_%')
          ), 0) AS hasnat
        FROM children c
        LEFT JOIN activity_logs l ON l.child_id = c.id
        LEFT JOIN activities a ON a.id = l.activity_id AND a.subject = ${quote(SPORTS_SUBJECT)}
        WHERE ${childScope}
        GROUP BY c.id
        ORDER BY hasnat DESC, completed DESC;
      `),
      streakRecoverySettings: db(`
        SELECT c.id AS child_id, c.name AS child_name, COALESCE(srs.enabled, 1) AS enabled,
          COALESCE(srs.max_shields, 3) AS max_shields, COALESCE(srs.recovery_difficulty, 'normal') AS recovery_difficulty,
          COALESCE(ss.current_streak, 28) AS current_streak, COALESCE(ss.shields, 3) AS shields,
          COALESCE(ss.recovery_status, 'none') AS recovery_status, COALESCE(ss.missed_days, 0) AS missed_days,
          COALESCE(ss.recovery_required, 0) AS recovery_required, COALESCE(ss.recovery_completed, 0) AS recovery_completed,
          COALESCE(ss.tree_points, 28) AS tree_points, COALESCE(ss.tree_health, 100) AS tree_health
        FROM children c
        LEFT JOIN streak_recovery_settings srs ON srs.child_id = c.id
        LEFT JOIN streak_states ss ON ss.child_id = c.id
        WHERE ${childScope}
        ORDER BY c.name;
      `),
      streakHistory: db(`
        SELECT sh.*, c.name AS child_name
        FROM streak_history sh JOIN children c ON c.id = sh.child_id
        WHERE ${childScope}
        ORDER BY sh.id DESC LIMIT 100;
      `),
      currentUser: { id: user.id, name: user.name, role: user.role },
      users: isAdmin(user)
        ? db("SELECT id, name, email, role, child_id, created_at FROM users ORDER BY role DESC, id;")
        : db(`SELECT id, name, email, role, child_id, created_at FROM users WHERE id = ${Number(user.id)} OR child_id IN (${childIdList}) ORDER BY role DESC, id;`),
      activities: db(`SELECT * FROM activities a WHERE active = 1 AND ${activityScope} AND (task_date IS NULL OR task_date >= ${quote(today())}) ORDER BY task_date IS NOT NULL DESC, id;`),
      activityAssignments: db(`SELECT aa.child_id, aa.activity_id, aa.enabled FROM activity_assignments aa JOIN children c ON c.id = aa.child_id JOIN activities a ON a.id = aa.activity_id WHERE ${childScope} AND ${activityScope};`),
      activityDailySkips: db(`
        SELECT ads.*, c.name AS child_name, a.title AS activity_title
        FROM activity_daily_skips ads
        JOIN children c ON c.id = ads.child_id
        JOIN activities a ON a.id = ads.activity_id
        WHERE ads.skip_date = ${quote(today())} AND ${childScope} AND ${activityScope}
        ORDER BY c.name, a.title;
      `),
      todayOverview: parentTodayOverview(today(), user),
      smartInsights: parentSmartInsights(today(), user),
      reflections: parentReflections(user),
      parentChallenges: db(`SELECT pc.* FROM parent_challenges pc LEFT JOIN children c ON c.id = pc.child_id WHERE pc.active = 1 AND (pc.child_id IS NULL OR ${childScope}) ${isAdmin(user) ? "" : `AND (pc.parent_id IS NULL OR pc.parent_id = ${Number(user.id)})`} ORDER BY end_date DESC, id DESC;`),
      quizzes: db(`
        SELECT q.*, c.name AS assigned_kid_name
        FROM quizzes q
        LEFT JOIN children c ON c.id = q.assigned_to_kid_id
        WHERE ${quizScope} AND COALESCE(q.category_key, '') = ''
        ORDER BY q.created_at DESC, q.id DESC;
      `).map(quizRow),
      quizCategoryAssignments: db(`
        SELECT
          c.id AS child_id,
          c.name AS child_name,
          COALESCE(qca.enabled, 0) AS enabled,
          MIN(${SEERAH_QUESTIONS.length}, MAX(0, COALESCE(sqp.current_question, 1) - 1)) AS completed,
          COALESCE(sqp.current_level, 1) AS current_level,
          COALESCE(srs.enabled, 1) AS review_enabled,
          COALESCE(srs.question_count, 10) AS review_question_count,
          (SELECT COUNT(*) FROM seerah_review_sessions ssession WHERE ssession.child_id = c.id AND ssession.status = 'completed') AS review_completed,
          (SELECT COALESCE(SUM(correct_answers), 0) FROM seerah_review_sessions ssession WHERE ssession.child_id = c.id) AS review_correct,
          (SELECT COALESCE(SUM(wrong_answers), 0) FROM seerah_review_sessions ssession WHERE ssession.child_id = c.id) AS review_wrong,
          (SELECT COALESCE(SUM(hasnat_earned), 0) FROM seerah_review_sessions ssession WHERE ssession.child_id = c.id) AS review_hasnat,
          (SELECT COUNT(*) FROM seerah_review_practice srp WHERE srp.child_id = c.id AND srp.priority > 0) AS needs_practice
        FROM children c
        LEFT JOIN quiz_category_assignments qca
          ON qca.child_id = c.id AND qca.category_key = ${quote(SEERAH_CATEGORY_KEY)}
        LEFT JOIN seerah_quiz_progress sqp ON sqp.child_id = c.id
        LEFT JOIN seerah_review_settings srs ON srs.child_id = c.id
        WHERE ${childScope}
        ORDER BY c.name;
      `),
      quizCategories: [{
        key: SEERAH_CATEGORY_KEY,
        name: SEERAH_CATEGORY_NAME,
        question_count: SEERAH_QUESTIONS.length,
        restart_on_wrong: settingsMap().seerah_restart_on_wrong !== "false",
        level_size: Number(settingsMap().seerah_level_size || 10)
      }],
      quizResults: quizResultsForParent(user),
      settings: settingsMap(),
      moods: db(`
        SELECT cm.*, c.name AS child_name, c.avatar
        FROM child_moods cm
        JOIN children c ON c.id = cm.child_id
        WHERE ${childScope}
        ORDER BY cm.mood_date DESC, cm.created_at DESC
        LIMIT 60;
      `),
      praiseMessages: db(`
        SELECT pm.*, c.name AS child_name, u.name AS parent_name
        FROM parent_praise_messages pm
        JOIN children c ON c.id = pm.child_id
        JOIN users u ON u.id = pm.parent_id
        WHERE ${childScope}
        ORDER BY pm.created_at DESC
        LIMIT 60;
      `),
      rewards: db(`SELECT * FROM rewards WHERE active = 1 ${isAdmin(user) ? "" : `AND (parent_id IS NULL OR parent_id = ${Number(user.id)})`} ORDER BY required_points;`),
      approvals: db(`
        SELECT l.*, c.name AS child_name, a.title AS activity_title, a.proof_required
        FROM activity_logs l
        JOIN children c ON c.id = l.child_id
        JOIN activities a ON a.id = l.activity_id
        WHERE l.status = 'completed' AND ${childScope} AND ${activityScope}
        ORDER BY l.updated_at DESC;
      `),
      rewardApprovals: db(`
        SELECT rr.*, c.name AS child_name, r.title AS reward_title
        FROM reward_redemptions rr
        JOIN children c ON c.id = rr.child_id
        JOIN rewards r ON r.id = rr.reward_id
        WHERE rr.status = 'pending' AND ${childScope}
        ORDER BY rr.redeemed_at DESC;
      `)
    });
  }

  const quizMatch = path.match(/^\/api\/quizzes\/(\d+)$/);
  const quizSubmitMatch = path.match(/^\/api\/quizzes\/(\d+)\/submit$/);

  if (method === "POST" && path === "/api/quiz-categories/assign") {
    const user = requireParent(req);
    const childId = Number(body.childId);
    requireChildAccess(user, childId);
    const categoryKey = String(body.categoryKey || "");
    if (categoryKey !== SEERAH_CATEGORY_KEY) return send(res, 400, { error: "Unknown quiz category." });
    const enabled = boolInt(body.enabled);
    exec(sql`
      INSERT INTO quiz_category_assignments (category_key, child_id, assigned_by_parent_id, enabled)
      VALUES (${categoryKey}, ${childId}, ${user.id}, ${enabled})
      ON CONFLICT(category_key, child_id) DO UPDATE SET
        assigned_by_parent_id = ${user.id},
        enabled = ${enabled},
        updated_at = CURRENT_TIMESTAMP;
    `);
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/quiz-categories/settings") {
    requireParent(req);
    const levelSize = Math.max(1, Math.min(25, Number(body.levelSize || 10)));
    const restartOnWrong = boolInt(body.restartOnWrong);
    exec(sql`
      INSERT INTO app_settings (setting_key, setting_value) VALUES ('seerah_restart_on_wrong', ${restartOnWrong ? "true" : "false"})
      ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP;
      INSERT INTO app_settings (setting_key, setting_value) VALUES ('seerah_level_size', ${String(levelSize)})
      ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP;
    `);
    exec(sql`
      UPDATE seerah_quiz_progress
      SET current_level = MIN(${Math.ceil(SEERAH_QUESTIONS.length / levelSize)}, CAST((MAX(1, current_question) - 1) / ${levelSize} AS INTEGER) + 1),
          questions_completed_in_level = (MAX(1, current_question) - 1) % ${levelSize},
          updated_at = CURRENT_TIMESTAMP;
    `);
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/quiz-categories/reset") {
    const user = requireParent(req);
    const childId = Number(body.childId);
    requireChildAccess(user, childId);
    if (String(body.categoryKey || "") !== SEERAH_CATEGORY_KEY) return send(res, 400, { error: "Unknown quiz category." });
    exec(sql`
      INSERT INTO seerah_quiz_progress (child_id, current_question, current_level, questions_completed_in_level, completed)
      VALUES (${childId}, 1, 1, 0, 0)
      ON CONFLICT(child_id) DO UPDATE SET
        current_question = 1,
        current_level = 1,
        questions_completed_in_level = 0,
        completed = 0,
        updated_at = CURRENT_TIMESTAMP;
      DELETE FROM badges
      WHERE child_id = ${childId} AND activity_id IN (-820001, -820010, -820025, -820050, -820100);
    `);
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/seerah-review/settings") {
    const user = requireParent(req);
    const childId = Number(body.childId);
    requireChildAccess(user, childId);
    const questionCount = [5, 10, 15].includes(Number(body.questionCount)) ? Number(body.questionCount) : 10;
    const enabled = boolInt(body.enabled);
    exec(sql`
      INSERT INTO seerah_review_settings (child_id, enabled, question_count)
      VALUES (${childId}, ${enabled}, ${questionCount})
      ON CONFLICT(child_id) DO UPDATE SET
        enabled = excluded.enabled,
        question_count = excluded.question_count,
        updated_at = CURRENT_TIMESTAMP;
    `);
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/seerah-review/reset") {
    const user = requireParent(req);
    const childId = Number(body.childId);
    requireChildAccess(user, childId);
    exec(sql`
      DELETE FROM seerah_review_questions
      WHERE session_id IN (SELECT id FROM seerah_review_sessions WHERE child_id = ${childId});
      DELETE FROM seerah_review_sessions WHERE child_id = ${childId};
      DELETE FROM seerah_review_practice WHERE child_id = ${childId};
      DELETE FROM badges
      WHERE child_id = ${childId} AND activity_id IN (-830003, -830007, -830030);
    `);
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/seerah-review/start") {
    const user = requireUser(req);
    if (user.role !== "child") return send(res, 403, { error: "Only kids can start a daily review." });
    startSeerahReview(Number(user.child_id), today());
    return send(res, 200, dashboardFor(Number(user.child_id)));
  }
  if (method === "POST" && path === "/api/seerah-review/answer") {
    const user = requireUser(req);
    if (user.role !== "child") return send(res, 403, { error: "Only kids can answer a daily review." });
    const childId = Number(user.child_id);
    const session = db(sql`
      SELECT * FROM seerah_review_sessions
      WHERE child_id = ${childId} AND review_date = ${today()} AND status = 'in_progress'
      LIMIT 1;
    `)[0];
    if (!session) return send(res, 409, { error: "Start today’s Seerah Review first." });
    const question = db(sql`
      SELECT srq.id AS review_question_id, srq.*, q.*
      FROM seerah_review_questions srq
      JOIN quizzes q ON q.id = srq.quiz_id
      WHERE srq.session_id = ${session.id}
        AND srq.position = ${Number(session.current_index || 0) + 1}
      LIMIT 1;
    `)[0];
    if (!question) return send(res, 409, { error: "The next review question could not be found." });
    if (question.correct !== null && question.correct !== undefined) return send(res, 409, { error: "This review question was already answered." });
    const answer = String(body.answer || "").trim();
    const correct = String(answer).toLowerCase() === String(question.correct_answer || "").trim().toLowerCase();
    const questionReward = correct ? seerahReviewReward(question.difficulty) : 0;
    exec(sql`
      UPDATE seerah_review_questions
      SET answer = ${answer},
          correct = ${correct ? 1 : 0},
          hasnat_earned = ${questionReward},
          answered_at = CURRENT_TIMESTAMP
      WHERE id = ${question.review_question_id};
      INSERT INTO seerah_review_practice (child_id, quiz_id, wrong_count, correct_count, priority, last_wrong_at)
      VALUES (${childId}, ${question.quiz_id}, ${correct ? 0 : 1}, ${correct ? 1 : 0}, ${correct ? 0 : 2}, ${correct ? null : new Date().toISOString()})
      ON CONFLICT(child_id, quiz_id) DO UPDATE SET
        wrong_count = wrong_count + ${correct ? 0 : 1},
        correct_count = correct_count + ${correct ? 1 : 0},
        priority = MAX(0, priority + ${correct ? -1 : 2}),
        last_wrong_at = CASE WHEN ${correct ? 1 : 0} = 1 THEN last_wrong_at ELSE CURRENT_TIMESTAMP END,
        updated_at = CURRENT_TIMESTAMP;
    `);
    if (questionReward > 0) {
      addPoints(childId, questionReward, "seerah_review", question.review_question_id, `Daily Seerah Review: question ${question.category_question_id}`);
    }

    const nextIndex = Number(session.current_index || 0) + 1;
    const completed = nextIndex >= Number(session.total_questions || 0);
    let completionBonus = 0;
    let perfectBonus = 0;
    if (completed) {
      completionBonus = 20;
      const wrongCount = Number(session.wrong_answers || 0) + (correct ? 0 : 1);
      perfectBonus = wrongCount === 0 ? 30 : 0;
      addPoints(childId, completionBonus, "seerah_review", -Number(session.id), "Daily Seerah Review completion bonus");
      if (perfectBonus) addPoints(childId, perfectBonus, "seerah_review", -100000 - Number(session.id), "Daily Seerah Review perfect score bonus");
    }
    exec(sql`
      UPDATE seerah_review_sessions
      SET current_index = ${nextIndex},
          correct_answers = correct_answers + ${correct ? 1 : 0},
          wrong_answers = wrong_answers + ${correct ? 0 : 1},
          hasnat_earned = hasnat_earned + ${questionReward + completionBonus + perfectBonus},
          completion_bonus = ${completionBonus},
          perfect_bonus = ${perfectBonus},
          status = ${completed ? "completed" : "in_progress"},
          completed_at = ${completed ? new Date().toISOString() : null},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${session.id};
    `);
    if (completed) {
      awardSeerahReviewStreakBadges(childId, seerahReviewStreak(childId, today()));
      advanceRecoveryMission(childId, "daily_review", "seerah_review", session.id);
      markDailyStreakActivity(childId, "seerah_review", session.id);
    }
    const next = dashboardFor(childId);
    next.seerahReviewAnswer = {
      correct,
      correctAnswer: question.correct_answer,
      explanation: question.explanation,
      earnedHasnat: questionReward,
      completionBonus,
      perfectBonus,
      completed
    };
    return send(res, 200, next);
  }
  if (method === "POST" && path === "/api/rescue-quiz/start") {
    const user = requireUser(req);
    if (user.role !== "child") return send(res, 403, { error: "Only kids can start a rescue quiz." });
    startRescueQuiz(Number(user.child_id));
    return send(res, 200, dashboardFor(Number(user.child_id)));
  }
  if (method === "POST" && path === "/api/rescue-quiz/answer") {
    const user = requireUser(req);
    if (user.role !== "child") return send(res, 403, { error: "Only kids can answer a rescue quiz." });
    const childId = Number(user.child_id);
    const session = db(sql`
      SELECT * FROM rescue_quiz_sessions
      WHERE child_id = ${childId} AND status = 'in_progress'
      ORDER BY id DESC LIMIT 1;
    `)[0];
    if (!session) return send(res, 409, { error: "Start the Daily Rescue Quiz first." });
    const question = db(sql`
      SELECT rqq.id AS rescue_question_id, rqq.*, q.correct_answer, q.explanation
      FROM rescue_quiz_questions rqq JOIN quizzes q ON q.id = rqq.quiz_id
      WHERE rqq.session_id = ${session.id} AND rqq.position = ${Number(session.current_index || 0) + 1}
      LIMIT 1;
    `)[0];
    if (!question) return send(res, 409, { error: "The next rescue question could not be found." });
    const answer = String(body.answer || "").trim();
    const correct = answer.toLowerCase() === String(question.correct_answer || "").trim().toLowerCase();
    const nextIndex = Number(session.current_index || 0) + 1;
    const correctAnswers = Number(session.correct_answers || 0) + (correct ? 1 : 0);
    const finished = nextIndex >= Number(session.total_questions || 0);
    const score = finished ? Math.round((correctAnswers / Math.max(1, Number(session.total_questions || 0))) * 100) : 0;
    const passed = finished && score >= 80;
    exec(sql`
      UPDATE rescue_quiz_questions SET answer = ${answer}, correct = ${correct ? 1 : 0}, answered_at = CURRENT_TIMESTAMP
      WHERE id = ${question.rescue_question_id};
      UPDATE rescue_quiz_sessions SET current_index = ${nextIndex}, correct_answers = ${correctAnswers},
        status = ${finished ? (passed ? "completed" : "failed") : "in_progress"}, passed = ${passed ? 1 : 0},
        completed_at = ${finished ? new Date().toISOString() : null}
      WHERE id = ${session.id};
    `);
    if (passed) {
      completeRecovery(childId, "Daily Rescue Quiz");
      markDailyStreakActivity(childId, "rescue_quiz", session.id);
      exec(sql`INSERT OR IGNORE INTO badges (child_id, badge_date, activity_id, title, icon) VALUES (${childId}, ${today()}, -840004, 'Quiz Master', '🧠');`);
    }
    const next = dashboardFor(childId);
    next.rescueQuizAnswer = {
      correct,
      correctAnswer: question.correct_answer,
      explanation: question.explanation,
      finished,
      passed,
      score
    };
    return send(res, 200, next);
  }
  if (method === "POST" && path === "/api/streak-recovery/settings") {
    const user = requireParent(req);
    const childId = Number(body.childId);
    requireChildAccess(user, childId);
    const maxShields = Math.max(0, Math.min(3, Number(body.maxShields ?? 3)));
    const shields = Math.max(0, Math.min(maxShields, Number(body.shields ?? maxShields)));
    const difficulty = ["easy", "normal", "hard"].includes(body.difficulty) ? body.difficulty : "normal";
    exec(sql`
      INSERT INTO streak_recovery_settings (child_id, enabled, max_shields, recovery_difficulty)
      VALUES (${childId}, ${boolInt(body.enabled)}, ${maxShields}, ${difficulty})
      ON CONFLICT(child_id) DO UPDATE SET enabled = excluded.enabled, max_shields = excluded.max_shields,
        recovery_difficulty = excluded.recovery_difficulty, updated_at = CURRENT_TIMESTAMP;
      UPDATE streak_states SET shields = ${shields}, updated_at = CURRENT_TIMESTAMP WHERE child_id = ${childId};
    `);
    return send(res, 200, { ok: true });
  }

  if (method === "POST" && path === "/api/quizzes") {
    const user = requireParent(req);
    const payload = normalizeQuizPayload(body, user);
    if (!payload.title || !payload.question_text) return send(res, 400, { error: "Quiz title and question are required." });
    ensureQuizChildAssignment(user, payload.assigned_to_kid_id);
    exec(sql`
      INSERT INTO quizzes (
        title, subject, quiz_type, instructions, difficulty, level, question_text, story_text, image_url, audio_url, emoji_prompt,
        options, correct_answer, multiple_correct_answers, explanation, timer_seconds, hearts, required_score_to_pass,
        xp_reward, coin_reward, badge_reward, unlock_next_level, status, created_by_parent_id, assigned_to_kid_id, due_date
      ) VALUES (
        ${payload.title}, ${payload.subject}, ${payload.quiz_type}, ${payload.instructions}, ${payload.difficulty}, ${payload.level},
        ${payload.question_text}, ${payload.story_text}, ${payload.image_url}, ${payload.audio_url}, ${payload.emoji_prompt},
        ${payload.options}, ${payload.correct_answer}, ${payload.multiple_correct_answers}, ${payload.explanation}, ${payload.timer_seconds},
        ${payload.hearts}, ${payload.required_score_to_pass}, ${payload.xp_reward}, ${payload.coin_reward}, ${payload.badge_reward},
        ${payload.unlock_next_level}, ${payload.status}, ${payload.created_by_parent_id}, ${payload.assigned_to_kid_id}, ${payload.due_date}
      );
    `);
    return send(res, 201, { ok: true });
  }

  if (quizMatch && method === "PUT") {
    const user = requireParent(req);
    const quizId = Number(quizMatch[1]);
    ensureQuizOwner(user, quizId);
    const payload = normalizeQuizPayload(body, user);
    if (!payload.title || !payload.question_text) return send(res, 400, { error: "Quiz title and question are required." });
    ensureQuizChildAssignment(user, payload.assigned_to_kid_id);
    exec(sql`
      UPDATE quizzes SET
        title = ${payload.title},
        subject = ${payload.subject},
        quiz_type = ${payload.quiz_type},
        instructions = ${payload.instructions},
        difficulty = ${payload.difficulty},
        level = ${payload.level},
        question_text = ${payload.question_text},
        story_text = ${payload.story_text},
        image_url = ${payload.image_url},
        audio_url = ${payload.audio_url},
        emoji_prompt = ${payload.emoji_prompt},
        options = ${payload.options},
        correct_answer = ${payload.correct_answer},
        multiple_correct_answers = ${payload.multiple_correct_answers},
        explanation = ${payload.explanation},
        timer_seconds = ${payload.timer_seconds},
        hearts = ${payload.hearts},
        required_score_to_pass = ${payload.required_score_to_pass},
        xp_reward = ${payload.xp_reward},
        coin_reward = ${payload.coin_reward},
        badge_reward = ${payload.badge_reward},
        unlock_next_level = ${payload.unlock_next_level},
        status = ${payload.status},
        assigned_to_kid_id = ${payload.assigned_to_kid_id},
        due_date = ${payload.due_date},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${quizId};
    `);
    return send(res, 200, { ok: true });
  }

  if (quizMatch && method === "DELETE") {
    const user = requireParent(req);
    const quizId = Number(quizMatch[1]);
    ensureQuizOwner(user, quizId);
    exec(sql`UPDATE quizzes SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ${quizId};`);
    return send(res, 200, { ok: true });
  }

  if (quizSubmitMatch && method === "POST") {
    const user = requireUser(req);
    if (user.role !== "child") return send(res, 403, { error: "Only kids can answer quizzes." });
    const childId = Number(user.child_id);
    const child = db(sql`SELECT * FROM children WHERE id = ${childId};`)[0];
    const quiz = quizRow(db(sql`SELECT * FROM quizzes WHERE id = ${Number(quizSubmitMatch[1])} AND status = 'active' LIMIT 1;`)[0]);
    if (!quiz) return send(res, 404, { error: "Quiz not found." });
    if (quiz.assigned_to_kid_id && Number(quiz.assigned_to_kid_id) !== childId) return send(res, 403, { error: "This quiz is assigned to another child." });
    const quizCreator = db(sql`SELECT role FROM users WHERE id = ${quiz.created_by_parent_id};`)[0];
    if (Number(quiz.created_by_parent_id) !== Number(child.parent_id) && quizCreator?.role !== "admin") return send(res, 403, { error: "This quiz is not assigned to your family." });
    const seerahBefore = quiz.category_key === SEERAH_CATEGORY_KEY ? seerahQuizProgressFor(childId) : null;
    if (seerahBefore && Number(quiz.category_question_id) !== Number(seerahBefore.current_question)) {
      return send(res, 409, { error: `Continue with question ${seerahBefore.current_question}.` });
    }
    const selectedAnswers = Array.isArray(body.selectedAnswers) ? body.selectedAnswers : parseJsonArray(body.selectedAnswers);
    const answer = String(body.answer || "").trim();
    const correct = quizAnswerIsCorrect(quiz, answer, selectedAnswers);
    const score = correct ? 1 : 0;
    const passed = score >= Number(quiz.required_score_to_pass || 1);
    const previousAttempts = Number(db(sql`SELECT COUNT(*) AS count FROM quiz_attempts WHERE quiz_id = ${quiz.id} AND kid_id = ${childId};`)[0]?.count || 0);
    const previouslyPassed = Boolean(db(sql`
      SELECT id FROM quiz_attempts
      WHERE quiz_id = ${quiz.id} AND kid_id = ${childId} AND passed = 1
      LIMIT 1;
    `)[0]);
    const streakBonus = correct && ["streak_quiz", "daily_quiz_mission", "fastest_finger"].includes(quiz.quiz_type) ? 5 : 0;
    const xpEarned = correct ? Number(quiz.xp_reward || 0) + streakBonus : 0;
    const categoryRewardAvailable = !quiz.category_key || !previouslyPassed;
    const coinsEarned = correct && categoryRewardAvailable ? Number(quiz.coin_reward || 0) : 0;
    const feedback = correct
      ? (quiz.explanation || "Correct answer. Great job!")
      : (quiz.explanation || "Good try. Read the hint and try again.");
    exec(sql`
      INSERT INTO quiz_attempts (
        quiz_id, kid_id, parent_id, answer, selected_answers, score, passed, attempts, time_used_seconds,
        hearts_left, streak_bonus, xp_earned, coins_earned, feedback
      ) VALUES (
        ${quiz.id}, ${childId}, ${child.parent_id}, ${answer}, ${JSON.stringify(selectedAnswers)}, ${score}, ${passed ? 1 : 0},
        ${previousAttempts + 1}, ${Math.max(0, Number(body.timeUsedSeconds || 0))}, ${Math.max(0, Number(body.heartsLeft || 0))},
        ${streakBonus}, ${xpEarned}, ${coinsEarned}, ${feedback}
      );
    `);
    if (coinsEarned > 0) addPoints(childId, coinsEarned, "quiz", quiz.id, `Quiz reward: ${quiz.title}`);
    awardQuizBadges(childId, quiz, correct, passed);
    let seerahMessage = "";
    let levelCompleted = false;
    let restarted = false;
    if (quiz.category_key === SEERAH_CATEGORY_KEY) {
      const levelSize = seerahBefore.level_size;
      const questionNumber = Number(quiz.category_question_id);
      const levelStart = Math.floor((questionNumber - 1) / levelSize) * levelSize + 1;
      const levelEnd = Math.min(SEERAH_QUESTIONS.length, levelStart + levelSize - 1);
      if (correct) {
        const nextQuestion = Math.min(SEERAH_QUESTIONS.length + 1, questionNumber + 1);
        levelCompleted = questionNumber === levelEnd;
        exec(sql`
          UPDATE seerah_quiz_progress
          SET current_question = ${nextQuestion},
              current_level = ${Math.min(Math.ceil(SEERAH_QUESTIONS.length / levelSize), Math.floor((nextQuestion - 1) / levelSize) + 1)},
              questions_completed_in_level = ${levelCompleted ? 0 : questionNumber - levelStart + 1},
              completed = ${nextQuestion > SEERAH_QUESTIONS.length ? 1 : 0},
              updated_at = CURRENT_TIMESTAMP
          WHERE child_id = ${childId};
        `);
        seerahMessage = levelCompleted
          ? "Excellent! You completed this level. The next level is unlocked."
          : (quiz.explanation || "Richtig! Sehr gut gemacht.");
      } else if (seerahBefore.restart_on_wrong) {
        restarted = true;
        exec(sql`
          UPDATE seerah_quiz_progress
          SET current_question = ${levelStart},
              current_level = ${seerahBefore.current_level},
              questions_completed_in_level = 0,
              completed = 0,
              updated_at = CURRENT_TIMESTAMP
          WHERE child_id = ${childId};
        `);
        seerahMessage = `Not correct this time. Let’s practise this level again from the beginning. ${quiz.explanation || ""}`.trim();
      } else {
        seerahMessage = quiz.explanation || "Good try. Read the explanation and try again.";
      }
      awardSeerahBadges(childId);
    }
    const next = dashboardFor(childId);
    next.quizFeedback = quiz.category_key === SEERAH_CATEGORY_KEY
      ? `${seerahMessage}${coinsEarned ? ` Du hast ${coinsEarned} Hasnat verdient.` : ""}`
      : `${correct ? "Richtig!" : "Versuche es noch einmal!"} ${feedback}${coinsEarned ? ` Du hast ${coinsEarned} Hasnat verdient.` : ""}`;
    next.quizAnswer = {
      correct,
      passed,
      feedback: quiz.category_key === SEERAH_CATEGORY_KEY ? seerahMessage : feedback,
      correctAnswer: correct ? null : quiz.correct_answer,
      earnedHasnat: coinsEarned,
      alreadyRewarded: correct && !categoryRewardAvailable,
      levelCompleted,
      restarted
    };
    return send(res, 200, next);
  }

  if (method === "POST" && path === "/api/children") {
    const user = requireParent(req);
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    if (!name || password.length < 6) return send(res, 400, { error: "Name and a password with at least 6 characters are required" });
    if (nameAlreadyUsed(name)) return send(res, 400, { error: "This login name is already used. Choose a different name." });
    exec(sql`INSERT INTO children (name, avatar, total_points, parent_id) VALUES (${name}, ${body.avatar || "star"}, 0, ${user.id});`);
    const child = db("SELECT id FROM children ORDER BY id DESC LIMIT 1;")[0];
    exec(sql`INSERT INTO users (name, email, password_hash, role, child_id) VALUES (${name}, ${localEmailFor(name, "child", child.id)}, ${hashPassword(password)}, 'child', ${child.id});`);
    exec(sql`
      INSERT OR IGNORE INTO activity_assignments (child_id, activity_id, enabled)
      SELECT ${child.id}, id, CASE WHEN subject = ${SPORTS_SUBJECT} OR task_type = 'sports' THEN 0 ELSE 1 END
      FROM activities
      WHERE active = 1;
    `);
    exec(sql`
      INSERT OR IGNORE INTO seerah_quiz_progress (child_id) VALUES (${child.id});
      INSERT OR IGNORE INTO seerah_review_settings (child_id, enabled, question_count) VALUES (${child.id}, 1, 10);
      INSERT OR IGNORE INTO streak_recovery_settings (child_id, enabled, max_shields, recovery_difficulty) VALUES (${child.id}, 1, 3, 'normal');
      INSERT OR IGNORE INTO streak_states (child_id, current_streak, shields, last_active_date, last_processed_date, tree_points, tree_health)
      VALUES (${child.id}, 28, 3, ${dateOffset(today(), -1)}, ${today()}, 28, 100);
      INSERT OR IGNORE INTO quiz_category_assignments (category_key, child_id, assigned_by_parent_id, enabled)
      VALUES (${SEERAH_CATEGORY_KEY}, ${child.id}, ${user.id}, 1);
    `);
    return send(res, 201, { ok: true });
  }

  if (method === "POST" && path === "/api/parents") {
    const user = requireParent(req);
    if (!isAdmin(user)) return send(res, 403, { error: "Only admin can create parent accounts." });
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    if (!name || password.length < 6) return send(res, 400, { error: "Parent name and a password with at least 6 characters are required" });
    if (nameAlreadyUsed(name)) return send(res, 400, { error: "This login name is already used. Choose a different name." });
    exec(sql`INSERT INTO users (name, email, password_hash, role) VALUES (${name}, ${localEmailFor(name, "parent", Date.now())}, ${hashPassword(password)}, 'parent');`);
    return send(res, 201, { ok: true });
  }

  if (method === "PUT" && path.startsWith("/api/parents/")) {
    const user = requireParent(req);
    if (!isAdmin(user)) return send(res, 403, { error: "Only admin can edit parent accounts." });
    const id = Number(path.split("/").pop());
    const parent = db(sql`SELECT * FROM users WHERE id = ${id} AND role = 'parent';`)[0];
    if (!parent) return send(res, 404, { error: "Parent account not found" });
    const name = String(body.name || "").trim();
    if (!name) return send(res, 400, { error: "Parent name is required" });
    if (nameAlreadyUsed(name, id)) return send(res, 400, { error: "This login name is already used. Choose a different name." });
    exec(sql`UPDATE users SET name = ${name}, email = ${localEmailFor(name, "parent", id)} WHERE id = ${id};`);
    if (body.password) {
      if (String(body.password).length < 6) return send(res, 400, { error: "Password must be at least 6 characters" });
      exec(sql`UPDATE users SET password_hash = ${hashPassword(String(body.password))} WHERE id = ${id};`);
    }
    return send(res, 200, { ok: true });
  }

  if (method === "PUT" && path.startsWith("/api/children/")) {
    const user = requireParent(req);
    const id = Number(path.split("/").pop());
    requireChildAccess(user, id);
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
    const user = requireParent(req);
    const id = Number(path.split("/").pop());
    requireChildAccess(user, id);
    const [{ count }] = db(`SELECT COUNT(*) AS count FROM children c WHERE ${visibleChildWhere(user, "c")};`);
    if (count <= 1) return send(res, 400, { error: "Keep at least one child account" });
    exec(sql`
      DELETE FROM activity_logs WHERE child_id = ${id};
      DELETE FROM activity_daily_skips WHERE child_id = ${id};
      DELETE FROM reward_redemptions WHERE child_id = ${id};
      DELETE FROM point_transactions WHERE child_id = ${id};
      DELETE FROM badges WHERE child_id = ${id};
      DELETE FROM daily_challenge_completions WHERE child_id = ${id};
      DELETE FROM family_quest_awards WHERE child_id = ${id};
      DELETE FROM parent_challenge_awards WHERE child_id = ${id};
      DELETE FROM avatar_purchases WHERE child_id = ${id};
      DELETE FROM child_reflections WHERE child_id = ${id};
      DELETE FROM early_bird_checkins WHERE child_id = ${id};
      DELETE FROM quran_favorite_surahs WHERE child_id = ${id};
      DELETE FROM quran_revision_logs WHERE child_id = ${id};
      DELETE FROM quran_memorization_logs WHERE child_id = ${id};
      DELETE FROM quran_juz_awards WHERE child_id = ${id};
      DELETE FROM quran_surah_progress WHERE child_id = ${id};
      DELETE FROM quran_reading_assignments WHERE child_id = ${id};
      DELETE FROM hifz_plan WHERE user_id = ${id};
      DELETE FROM quiz_attempts WHERE kid_id = ${id};
      DELETE FROM quiz_category_assignments WHERE child_id = ${id};
      DELETE FROM seerah_review_questions WHERE session_id IN (SELECT id FROM seerah_review_sessions WHERE child_id = ${id});
      DELETE FROM seerah_review_sessions WHERE child_id = ${id};
      DELETE FROM seerah_review_practice WHERE child_id = ${id};
      DELETE FROM seerah_review_settings WHERE child_id = ${id};
      DELETE FROM rescue_quiz_questions WHERE session_id IN (SELECT id FROM rescue_quiz_sessions WHERE child_id = ${id});
      DELETE FROM rescue_quiz_sessions WHERE child_id = ${id};
      DELETE FROM recovery_missions WHERE child_id = ${id};
      DELETE FROM streak_history WHERE child_id = ${id};
      DELETE FROM streak_states WHERE child_id = ${id};
      DELETE FROM streak_recovery_settings WHERE child_id = ${id};
      DELETE FROM seerah_quiz_progress WHERE child_id = ${id};
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
    const user = requireParent(req);
    const childId = Number(body.childId);
    const activityId = Number(body.activityId);
    const enabled = body.enabled ? 1 : 0;
    if (!childId || !activityId) return send(res, 400, { error: "Child and activity are required" });
    requireChildAccess(user, childId);
    const activity = db(sql`SELECT * FROM activities WHERE id = ${activityId};`)[0];
    if (!activity || (!isAdmin(user) && activity.parent_id && Number(activity.parent_id) !== Number(user.id))) return send(res, 403, { error: "You can only assign activities available to your family." });
    exec(sql`
      INSERT INTO activity_assignments (child_id, activity_id, enabled) VALUES (${childId}, ${activityId}, ${enabled})
      ON CONFLICT(child_id, activity_id) DO UPDATE SET enabled = ${enabled};
    `);
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/activity-daily-skips") {
    const user = requireParent(req);
    const childId = Number(body.childId);
    const activityId = Number(body.activityId);
    const skipDate = body.date || today();
    const hidden = body.hidden !== false;
    if (!childId || !activityId) return send(res, 400, { error: "Child and activity are required" });
    requireChildAccess(user, childId);
    const activity = db(sql`SELECT * FROM activities WHERE id = ${activityId};`)[0];
    if (!activity || (!isAdmin(user) && activity.parent_id && Number(activity.parent_id) !== Number(user.id))) {
      return send(res, 403, { error: "You can only manage activities available to your family." });
    }
    if (hidden) {
      exec(sql`
        INSERT INTO activity_daily_skips (child_id, activity_id, skip_date, reason, created_by)
        VALUES (${childId}, ${activityId}, ${skipDate}, ${body.reason || "Hidden for today by parent"}, ${user.id})
        ON CONFLICT(child_id, activity_id, skip_date) DO UPDATE SET reason = excluded.reason, created_by = excluded.created_by, created_at = CURRENT_TIMESTAMP;
      `);
    } else {
      exec(sql`DELETE FROM activity_daily_skips WHERE child_id = ${childId} AND activity_id = ${activityId} AND skip_date = ${skipDate};`);
    }
    return send(res, 200, { ok: true });
  }
  if (method === "PUT" && path === "/api/my-avatar") {
    const user = requireUser(req);
    if (user.role !== "child") return send(res, 403, { error: "Child access required" });
    const rawAvatar = String(body.avatar || "⭐").trim();
    const avatar = rawAvatar.startsWith("data:image/") ? rawAvatar : rawAvatar.slice(0, 32);
    exec(sql`UPDATE children SET avatar = ${avatar} WHERE id = ${user.child_id};`);
    return send(res, 200, dashboardFor(user.child_id));
  }
  if (method === "POST" && path === "/api/activities/complete") {
    const childId = childIdFor(req, body.childId);
    const child = db(sql`SELECT * FROM children WHERE id = ${childId};`)[0];
    const activity = db(sql`SELECT * FROM activities WHERE id = ${body.activityId} AND active = 1;`)[0];
    if (!activity) return send(res, 404, { error: "Activity not found" });
    if (activity.parent_id && Number(activity.parent_id) !== Number(child?.parent_id || 0)) return send(res, 403, { error: "This activity is not assigned to your family." });
    const hiddenToday = db(sql`
      SELECT id FROM activity_daily_skips
      WHERE child_id = ${childId} AND activity_id = ${activity.id} AND skip_date = ${today()}
      LIMIT 1;
    `)[0];
    if (hiddenToday) return send(res, 409, { error: "This activity is hidden for today and will return tomorrow." });
    let log = ensureLog(childId, activity.id);
    let status = activity.requires_approval || activity.proof_required ? "completed" : "approved";
    let prayerState = log.prayer_state || "{}";
    if (activity.is_prayer) {
      const prayer = String(body.prayer || "");
      const windowStatus = prayerWindowStatus(prayer);
      if (Boolean(body.checked) && !windowStatus.allowed) {
        return send(res, 400, { error: windowStatus.tooEarly ? windowStatus.message : `${prayer} cannot be completed after ${windowStatus.window?.end || "its time"}. No Hasanat added.` });
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
      advanceRecoveryMission(childId, activityRecoveryType(activity), "activity", log.id);
      markDailyStreakActivity(childId, "activity", log.id);
      awardStreakBadgesIfNeeded(childId);
      return send(res, 200, dashboardFor(childId));
    }
    const interactiveAnswer = body.interactiveAnswer === undefined ? log.interactive_answer || "" : JSON.stringify(body.interactiveAnswer || "");
    const interactiveScore = body.interactiveScore === undefined ? Number(log.interactive_score || 0) : Number(body.interactiveScore || 0);
    exec(sql`UPDATE activity_logs SET status = ${status}, proof = ${body.proof || ""}, interactive_answer = ${interactiveAnswer}, interactive_score = ${interactiveScore}, updated_at = CURRENT_TIMESTAMP WHERE id = ${log.id};`);
    log = db(sql`SELECT * FROM activity_logs WHERE id = ${log.id};`)[0];
    awardActivityIfNeeded(log, activity);
    if (log.status === "approved") {
      advanceRecoveryMission(childId, activityRecoveryType(activity), "activity", log.id);
      markDailyStreakActivity(childId, "activity", log.id);
    }
    if (activity.subject === SPORTS_SUBJECT && log.status === "approved") awardSportsBonusesIfNeeded(childId);
    return send(res, 200, dashboardFor(childId));
  }
  if (method === "POST" && path === "/api/quran-reading/assign") {
    const user = requireParent(req);
    const childId = Number(body.childId);
    requireChildAccess(user, childId);
    const surahIds = Array.isArray(body.surahIds) ? body.surahIds : [body.surahId];
    const targetDate = body.targetDate || null;
    const priority = ["normal", "high"].includes(body.priority) ? body.priority : "normal";
    const notes = String(body.privateNotes || "").slice(0, 1000);
    const baseOrder = Number(body.sortOrder || 0);
    let added = 0;
    for (const rawId of surahIds) {
      const surah = quranSurahMeta(Number(rawId));
      if (!surah) continue;
      exec(sql`
        INSERT INTO quran_reading_assignments (
          child_id, surah_id, sort_order, target_date, priority, private_notes, status, created_by
        )
        VALUES (${childId}, ${surah.surah_number}, ${baseOrder + added}, ${targetDate}, ${priority}, ${notes}, 'assigned', ${user.id})
        ON CONFLICT(child_id, surah_id) DO UPDATE SET
          sort_order = excluded.sort_order,
          target_date = excluded.target_date,
          priority = excluded.priority,
          private_notes = excluded.private_notes,
          status = CASE WHEN quran_reading_assignments.status = 'approved' THEN 'approved' ELSE 'assigned' END,
          updated_at = CURRENT_TIMESTAMP;
      `);
      added += 1;
    }
    return send(res, 200, { ok: true, added });
  }
  if (method === "POST" && path === "/api/quran-reading/submit") {
    const user = requireUser(req);
    if (user.role !== "child") return send(res, 403, { error: "Only children can submit Quran recitation." });
    const row = db(sql`
      SELECT * FROM quran_reading_assignments
      WHERE id = ${Number(body.assignmentId)} AND child_id = ${Number(user.child_id)}
      LIMIT 1;
    `)[0];
    if (!row) return send(res, 404, { error: "Assigned Surah not found." });
    if (row.status === "approved") return send(res, 400, { error: "This Surah is already approved." });
    exec(sql`
      UPDATE quran_reading_assignments
      SET status = 'submitted', child_submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${row.id};
    `);
    const nextDashboard = dashboardFor(Number(user.child_id));
    nextDashboard.quranReadingMessage = "Your recitation is waiting for parent approval.";
    return send(res, 200, nextDashboard);
  }
  if (method === "POST" && path === "/api/quran-reading/review") {
    const user = requireParent(req);
    const action = body.action === "approve" ? "approve" : "repeat";
    const row = db(sql`
      SELECT qra.*, c.name AS child_name
      FROM quran_reading_assignments qra
      JOIN children c ON c.id = qra.child_id
      WHERE qra.id = ${Number(body.assignmentId)}
      LIMIT 1;
    `)[0];
    if (!row) return send(res, 404, { error: "Quran assignment not found." });
    requireChildAccess(user, Number(row.child_id));
    const feedback = String(body.feedback || "").slice(0, 1000);
    const encouragement = String(body.encouragement || "").slice(0, 1000);
    if (action === "approve") {
      const meta = quranSurahMeta(row.surah_id);
      const hasanat = Number(meta?.possible_hasanat || 0);
      const alreadyAwarded = Number(row.hasanat_awarded || 0);
      exec(sql`
        UPDATE quran_reading_assignments
        SET status = 'approved',
          parent_feedback = ${feedback},
          encouragement = ${encouragement},
          approved_at = CURRENT_TIMESTAMP,
          approved_by = ${user.id},
          hasanat_awarded = ${hasanat},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${row.id};
      `);
      const delta = hasanat - alreadyAwarded;
      if (delta > 0) addPoints(Number(row.child_id), delta, "quran_reading", row.id, `${meta?.surah_name_english || "Quran"} recitation approved`);
      awardQuranReadingBadges(Number(row.child_id));
    } else {
      exec(sql`
        UPDATE quran_reading_assignments
        SET status = 'repeat',
          parent_feedback = ${feedback},
          encouragement = ${encouragement},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${row.id};
      `);
    }
    return send(res, 200, { ok: true });
  }
  if (method === "DELETE" && path.startsWith("/api/quran-reading/")) {
    const user = requireParent(req);
    const row = db(sql`SELECT * FROM quran_reading_assignments WHERE id = ${Number(path.split("/").pop())};`)[0];
    if (!row) return send(res, 404, { error: "Quran assignment not found." });
    requireChildAccess(user, Number(row.child_id));
    if (row.status === "approved" && Number(row.hasanat_awarded || 0) > 0) return send(res, 400, { error: "Approved Quran records are kept for reports." });
    exec(sql`DELETE FROM quran_reading_assignments WHERE id = ${row.id};`);
    return send(res, 200, { ok: true });
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
    const user = requireParent(req);
    const days = [0, 1, 2, 3, 4, 5, 6].map((day) => body[`day_${day}`] !== undefined ? boolInt(body[`day_${day}`]) : (day === 0 || day === 6 ? boolInt(body.show_weekends) : boolInt(body.show_weekdays !== false)));
    const showWeekdays = days.slice(1, 6).some(Boolean) ? 1 : 0;
    const showWeekends = days[0] || days[6] ? 1 : 0;
    exec(sql`INSERT INTO activities (title, description, points, duration_minutes, frequency, show_weekdays, show_weekends, day_0, day_1, day_2, day_3, day_4, day_5, day_6, task_date, proof_required, requires_approval, parent_id, subject, task_type, task_data) VALUES (${body.title}, ${body.description}, ${Number(body.points)}, ${Number(body.duration_minutes || 0)}, ${body.frequency}, ${showWeekdays}, ${showWeekends}, ${days[0]}, ${days[1]}, ${days[2]}, ${days[3]}, ${days[4]}, ${days[5]}, ${days[6]}, ${body.task_date || null}, ${body.proof_required ? 1 : 0}, ${body.requires_approval ? 1 : 0}, ${isAdmin(user) ? null : user.id}, ${body.subject || "Reading"}, ${body.task_type || "standard"}, ${body.task_data || "{}"});`);
    return send(res, 201, { ok: true });
  }
  if (method === "PUT" && path.startsWith("/api/activities/")) {
    const user = requireParent(req);
    const id = Number(path.split("/").pop());
    const existing = db(sql`SELECT * FROM activities WHERE id = ${id};`)[0];
    if (!existing || (!isAdmin(user) && Number(existing.parent_id || 0) !== Number(user.id))) return send(res, 403, { error: "You can only edit activities you created. You can still assign shared activities to your children." });
    const days = [0, 1, 2, 3, 4, 5, 6].map((day) => body[`day_${day}`] !== undefined ? boolInt(body[`day_${day}`]) : (day === 0 || day === 6 ? boolInt(body.show_weekends) : boolInt(body.show_weekdays)));
    const showWeekdays = days.slice(1, 6).some(Boolean) ? 1 : 0;
    const showWeekends = days[0] || days[6] ? 1 : 0;
    exec(sql`UPDATE activities SET title = ${body.title}, description = ${body.description}, points = ${Number(body.points)}, duration_minutes = ${Number(body.duration_minutes || 0)}, frequency = ${body.frequency}, show_weekdays = ${showWeekdays}, show_weekends = ${showWeekends}, day_0 = ${days[0]}, day_1 = ${days[1]}, day_2 = ${days[2]}, day_3 = ${days[3]}, day_4 = ${days[4]}, day_5 = ${days[5]}, day_6 = ${days[6]}, task_date = ${body.task_date || null}, proof_required = ${body.proof_required ? 1 : 0}, requires_approval = ${body.requires_approval ? 1 : 0}, subject = ${body.subject || "Reading"}, task_type = ${body.task_type || "standard"}, task_data = ${body.task_data || "{}"} WHERE id = ${id};`);
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/today-task") {
    const user = requireParent(req);
    const childId = Number(body.childId);
    requireChildAccess(user, childId);
    const child = db(sql`SELECT id FROM children WHERE id = ${childId};`)[0];
    if (!child) return send(res, 400, { error: "Choose a child for this task" });
    const title = String(body.title || "").trim();
    if (!title) return send(res, 400, { error: "Task title is required" });
    const date = today();
    const days = [0, 0, 0, 0, 0, 0, 0];
    days[new Date(`${date}T12:00:00`).getDay()] = 1;
    exec(sql`
      INSERT INTO activities (title, description, points, duration_minutes, frequency, show_weekdays, show_weekends, day_0, day_1, day_2, day_3, day_4, day_5, day_6, task_date, proof_required, requires_approval, parent_id, subject, task_type, task_data)
      VALUES (${title}, ${body.description || "Special task for today."}, ${Number(body.points || 5)}, ${Number(body.duration_minutes || 0)}, 'one-time', ${days.slice(1, 6).some(Boolean) ? 1 : 0}, ${days[0] || days[6] ? 1 : 0}, ${days[0]}, ${days[1]}, ${days[2]}, ${days[3]}, ${days[4]}, ${days[5]}, ${days[6]}, ${date}, ${body.proof_required ? 1 : 0}, ${body.requires_approval ? 1 : 0}, ${isAdmin(user) ? null : user.id}, ${body.subject || "Reading"}, ${body.task_type || "standard"}, ${body.task_data || "{}"});
    `);
    const activity = db("SELECT id FROM activities ORDER BY id DESC LIMIT 1;")[0];
    exec(sql`
      INSERT OR IGNORE INTO activity_assignments (child_id, activity_id, enabled)
      SELECT id, ${activity.id}, CASE WHEN id = ${childId} THEN 1 ELSE 0 END FROM children;
    `);
    return send(res, 201, { ok: true });
  }
  if (method === "POST" && path === "/api/mood") {
    const childId = childIdFor(req, body.childId);
    const mood = String(body.mood || "").trim();
    const note = String(body.note || "").trim().slice(0, 300);
    const allowed = ["happy", "tired", "excited", "sad", "angry", "calm"];
    if (!allowed.includes(mood)) return send(res, 400, { error: "Choose one mood." });
    exec(sql`
      INSERT INTO child_moods (child_id, mood_date, mood, note)
      VALUES (${childId}, ${today()}, ${mood}, ${note})
      ON CONFLICT(child_id, mood_date) DO UPDATE SET
        mood = ${mood},
        note = ${note},
        created_at = CURRENT_TIMESTAMP;
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
  if (method === "POST" && path === "/api/my-pet") {
    const childId = childIdFor(req, body.childId);
    const petType = String(body.pet_type || "puppy").trim();
    const petName = String(body.pet_name || "Buddy").trim().slice(0, 24) || "Buddy";
    const allowed = ["cat", "lion", "bird", "dolphin", "dragon", "puppy"];
    if (!allowed.includes(petType)) return send(res, 400, { error: "Choose a pet from the list." });
    exec(sql`
      INSERT INTO child_pets (child_id, pet_type, pet_name)
      VALUES (${childId}, ${petType}, ${petName})
      ON CONFLICT(child_id) DO UPDATE SET
        pet_type = ${petType},
        pet_name = ${petName},
        updated_at = CURRENT_TIMESTAMP;
    `);
    return send(res, 200, dashboardFor(childId));
  }
  if (method === "POST" && path === "/api/praise") {
    const user = requireParent(req);
    const childId = Number(body.child_id || body.childId);
    requireChildAccess(user, childId);
    const message = String(body.message || "").trim().slice(0, 160);
    if (!message) return send(res, 400, { error: "Write a short praise message." });
    exec(sql`INSERT INTO parent_praise_messages (parent_id, child_id, message) VALUES (${user.id}, ${childId}, ${message});`);
    return send(res, 201, { ok: true });
  }
  if (method === "POST" && path === "/api/praise/seen") {
    const childId = childIdFor(req, body.childId);
    exec(sql`UPDATE parent_praise_messages SET status = 'seen', seen_at = CURRENT_TIMESTAMP WHERE child_id = ${childId} AND status = 'unread';`);
    return send(res, 200, dashboardFor(childId));
  }
  if (method === "POST" && path === "/api/settings") {
    requireParent(req);
    const seasonalTheme = String(body.seasonal_theme || "learning").trim();
    const soundEnabled = body.sound_enabled === true || body.sound_enabled === "true" || body.sound_enabled === "on" ? "true" : "false";
    const allowedThemes = ["learning", "ramadan", "eid", "winter", "football", "school", "summer"];
    if (!allowedThemes.includes(seasonalTheme)) return send(res, 400, { error: "Choose a valid seasonal theme." });
    exec(sql`
      INSERT INTO app_settings (setting_key, setting_value) VALUES ('seasonal_theme', ${seasonalTheme})
      ON CONFLICT(setting_key) DO UPDATE SET setting_value = ${seasonalTheme}, updated_at = CURRENT_TIMESTAMP;
      INSERT INTO app_settings (setting_key, setting_value) VALUES ('sound_enabled', ${soundEnabled})
      ON CONFLICT(setting_key) DO UPDATE SET setting_value = ${soundEnabled}, updated_at = CURRENT_TIMESTAMP;
    `);
    return send(res, 200, { ok: true, settings: settingsMap() });
  }
  if (method === "POST" && path === "/api/quranic-visibility") {
    const user = requireParent(req);
    const childId = Number(body.childId);
    requireChildAccess(user, childId);
    exec(sql`
      INSERT INTO child_quranic_settings (child_id, visible)
      VALUES (${childId}, ${body.visible ? 1 : 0})
      ON CONFLICT(child_id) DO UPDATE SET visible = ${body.visible ? 1 : 0}, updated_at = CURRENT_TIMESTAMP;
    `);
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/bonus-hasnat") {
    const user = requireParent(req);
    const childId = Number(body.childId);
    requireChildAccess(user, childId);
    const amount = Math.max(1, Math.min(1000, Number(body.amount || 0)));
    const note = String(body.note || "Parent bonus Hasanat").trim().slice(0, 120);
    addPoints(childId, amount, "parent_bonus", user.id, note);
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/child-progress") {
    const user = requireParent(req);
    const childId = Number(body.childId);
    requireChildAccess(user, childId);
    const hasanat = Math.max(0, Math.min(1000000, Math.floor(Number(body.hasanat || 0))));
    const streakDays = Math.max(0, Math.min(3650, Math.floor(Number(body.streakDays || 0))));
    const child = db(sql`SELECT id, name FROM children WHERE id = ${childId};`)[0];
    if (!child) return send(res, 404, { error: "Child not found." });
    exec(sql`
      UPDATE children SET total_points = ${hasanat} WHERE id = ${childId};
      INSERT INTO child_wallets (child_id, xp, coins, gems, keys, treasure_tickets)
      VALUES (${childId}, ${hasanat}, ${hasanat}, 0, 0, 0)
      ON CONFLICT(child_id) DO UPDATE SET
        xp = MAX(xp, ${hasanat}),
        coins = ${hasanat},
        updated_at = CURRENT_TIMESTAMP;
      INSERT INTO streak_states (
        child_id, current_streak, shields, last_active_date, last_processed_date,
        active_days_since_shield, tree_points, tree_health, updated_at
      )
      VALUES (${childId}, ${streakDays}, 0, ${today()}, ${today()}, 0, ${streakDays}, 100, CURRENT_TIMESTAMP)
      ON CONFLICT(child_id) DO UPDATE SET
        current_streak = ${streakDays},
        last_active_date = ${today()},
        last_processed_date = ${today()},
        tree_points = MAX(tree_points, ${streakDays}),
        tree_health = 100,
        recovery_status = 'none',
        missed_days = 0,
        recovery_required = 0,
        recovery_completed = 0,
        updated_at = CURRENT_TIMESTAMP;
      INSERT INTO streak_history (child_id, event_date, event_type, streak_before, streak_after, shields_before, shields_after, note)
      VALUES (${childId}, ${today()}, 'admin_adjusted', ${streakDays}, ${streakDays}, 0, 0, ${`Admin set ${child.name}'s Hasanat to ${hasanat} and streak to ${streakDays} days.`});
    `);
    return send(res, 200, { ok: true, hasanat, streakDays });
  }
  if (method === "POST" && path === "/api/sports-videos") {
    const user = requireParent(req);
    const payload = storeSportsVideoUpload(normalizeVideoPayload(body, user));
    if (!payload.exerciseKey || !payload.title) return send(res, 400, { error: "Exercise type and title are required." });
    exec(sql`
      INSERT INTO sports_videos (
        exercise_key, title, source_type, video_url, thumbnail_url, explanation, safety_tips, difficulty, duration_seconds, enabled, ai_feedback_prompt, created_by_parent_id
      )
      VALUES (${payload.exerciseKey}, ${payload.title}, ${payload.sourceType}, ${payload.videoUrl}, ${payload.thumbnailUrl}, ${payload.explanation}, ${payload.safetyTips}, ${payload.difficulty}, ${payload.durationSeconds}, ${payload.enabled}, ${payload.aiFeedbackPrompt}, ${payload.parentId})
      ON CONFLICT(exercise_key) DO UPDATE SET
        title = ${payload.title},
        source_type = ${payload.sourceType},
        video_url = ${payload.videoUrl},
        thumbnail_url = ${payload.thumbnailUrl},
        explanation = ${payload.explanation},
        safety_tips = ${payload.safetyTips},
        difficulty = ${payload.difficulty},
        duration_seconds = ${payload.durationSeconds},
        enabled = ${payload.enabled},
        ai_feedback_prompt = ${payload.aiFeedbackPrompt},
        created_by_parent_id = ${payload.parentId},
        updated_at = CURRENT_TIMESTAMP;
    `);
    return send(res, 200, { ok: true });
  }
  if (method === "PUT" && path.startsWith("/api/sports-videos/")) {
    const user = requireParent(req);
    const id = Number(path.split("/").pop());
    const existing = db(sql`SELECT * FROM sports_videos WHERE id = ${id};`)[0];
    if (!existing) return send(res, 404, { error: "Video not found." });
    const payload = storeSportsVideoUpload(normalizeVideoPayload({ ...existing, ...body }, user));
    exec(sql`
      UPDATE sports_videos SET
        exercise_key = ${payload.exerciseKey},
        title = ${payload.title},
        source_type = ${payload.sourceType},
        video_url = ${payload.videoUrl},
        thumbnail_url = ${payload.thumbnailUrl},
        explanation = ${payload.explanation},
        safety_tips = ${payload.safetyTips},
        difficulty = ${payload.difficulty},
        duration_seconds = ${payload.durationSeconds},
        enabled = ${payload.enabled},
        ai_feedback_prompt = ${payload.aiFeedbackPrompt},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id};
    `);
    return send(res, 200, { ok: true });
  }
  if (method === "DELETE" && path.startsWith("/api/sports-videos/")) {
    requireParent(req);
    const id = Number(path.split("/").pop());
    exec(sql`UPDATE sports_videos SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ${id};`);
    return send(res, 200, { ok: true });
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
      ? "Early Bird! You earned 20 Hasanat for waking up before 7:00 AM."
      : "You got up late this morning. Tomorrow is a new chance.";
    return send(res, 200, { ...dashboardFor(childId), earlyBirdMessage: message });
  }
  if (method === "POST" && path === "/api/parent-challenges") {
    const user = requireParent(req);
    const title = String(body.title || "").trim();
    if (!title) return send(res, 400, { error: "Challenge title is required" });
    if (body.child_id) requireChildAccess(user, Number(body.child_id));
    exec(sql`
      INSERT INTO parent_challenges (title, description, target_count, bonus_points, start_date, end_date, child_id, parent_id)
      VALUES (${title}, ${body.description || "Complete the challenge goal."}, ${Number(body.target_count || 3)}, ${Number(body.bonus_points || 10)}, ${body.start_date || today()}, ${body.end_date || today()}, ${body.child_id ? Number(body.child_id) : null}, ${user.id});
    `);
    return send(res, 201, { ok: true });
  }
  if (method === "DELETE" && path.startsWith("/api/activities/")) {
    const user = requireParent(req);
    const id = Number(path.split("/").pop());
    const activity = db(sql`SELECT * FROM activities WHERE id = ${id};`)[0];
    if (!activity || (!isAdmin(user) && Number(activity.parent_id || 0) !== Number(user.id))) return send(res, 403, { error: "You can only delete activities you created." });
    exec(sql`UPDATE activities SET active = 0 WHERE id = ${id};`);
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/rewards") {
    const user = requireParent(req);
    exec(sql`INSERT INTO rewards (title, description, required_points, parent_id) VALUES (${body.title}, ${body.description}, ${Number(body.required_points)}, ${isAdmin(user) ? null : user.id});`);
    return send(res, 201, { ok: true });
  }
  if (method === "PUT" && path.startsWith("/api/rewards/")) {
    const user = requireParent(req);
    const id = Number(path.split("/").pop());
    const reward = db(sql`SELECT * FROM rewards WHERE id = ${id};`)[0];
    if (!reward || (!isAdmin(user) && Number(reward.parent_id || 0) !== Number(user.id))) return send(res, 403, { error: "You can only edit rewards you created." });
    exec(sql`UPDATE rewards SET title = ${body.title}, description = ${body.description}, required_points = ${Number(body.required_points)} WHERE id = ${id};`);
    return send(res, 200, { ok: true });
  }
  if (method === "DELETE" && path.startsWith("/api/rewards/")) {
    const user = requireParent(req);
    const id = Number(path.split("/").pop());
    const reward = db(sql`SELECT * FROM rewards WHERE id = ${id};`)[0];
    if (!reward || (!isAdmin(user) && Number(reward.parent_id || 0) !== Number(user.id))) return send(res, 403, { error: "You can only delete rewards you created." });
    exec(sql`UPDATE rewards SET active = 0 WHERE id = ${id};`);
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/approvals") {
    const user = requireParent(req);
    const log = db(sql`SELECT * FROM activity_logs WHERE id = ${body.logId};`)[0];
    if (!log) return send(res, 404, { error: "Approval not found" });
    requireChildAccess(user, log.child_id);
    const activity = db(sql`SELECT * FROM activities WHERE id = ${log.activity_id};`)[0];
    const status = body.approved ? "approved" : "rejected";
    exec(sql`UPDATE activity_logs SET status = ${status}, updated_at = CURRENT_TIMESTAMP WHERE id = ${log.id};`);
    if (body.approved) {
      awardActivityIfNeeded({ ...log, status: "approved" }, activity);
      advanceRecoveryMission(log.child_id, activityRecoveryType(activity), "activity", log.id);
      markDailyStreakActivity(log.child_id, "activity", log.id);
    }
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && path === "/api/reward-approvals") {
    const user = requireParent(req);
    const request = db(sql`SELECT * FROM reward_redemptions WHERE id = ${body.redemptionId};`)[0];
    if (!request) return send(res, 404, { error: "Reward request not found" });
    requireChildAccess(user, request.child_id);
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
    if (reward.parent_id && Number(reward.parent_id) !== Number(child.parent_id || 0)) return send(res, 403, { error: "This reward is not available to your family." });
    const discount = rewardDiscountsOfPeriod().find((item) => Number(item.id) === Number(reward.id));
    let pointsToSpend = discount && Number(discount.id) === Number(reward.id)
      ? Math.ceil(reward.required_points * (100 - discount.discount_percent) / 100)
      : reward.required_points;
    if (db(sql`SELECT id FROM reward_redemptions WHERE child_id = ${childId} AND reward_id = ${reward.id} AND status = 'pending' LIMIT 1;`)[0]) {
      return send(res, 400, { error: "This reward is already waiting for parent approval." });
    }
    if (child.total_points < pointsToSpend) return send(res, 400, { error: "Not enough points yet. Keep going!" });
    exec(sql`INSERT INTO reward_redemptions (child_id, reward_id, points_spent, status) VALUES (${childId}, ${reward.id}, ${pointsToSpend}, 'pending');`);
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
      activity_daily_skips: db("SELECT * FROM activity_daily_skips ORDER BY skip_date, child_id, activity_id;"),
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
      parent_challenges: db("SELECT * FROM parent_challenges ORDER BY id;"),
      parent_challenge_awards: db("SELECT * FROM parent_challenge_awards ORDER BY id;"),
      child_reflections: db("SELECT * FROM child_reflections ORDER BY id;"),
      early_bird_checkins: db("SELECT * FROM early_bird_checkins ORDER BY id;"),
      quizzes: db("SELECT * FROM quizzes ORDER BY id;"),
      quiz_attempts: db("SELECT * FROM quiz_attempts ORDER BY id;"),
      quiz_category_assignments: db("SELECT * FROM quiz_category_assignments ORDER BY category_key, child_id;"),
      seerah_quiz_progress: db("SELECT * FROM seerah_quiz_progress ORDER BY child_id;"),
      seerah_review_settings: db("SELECT * FROM seerah_review_settings ORDER BY child_id;"),
      seerah_review_sessions: db("SELECT * FROM seerah_review_sessions ORDER BY child_id, review_date;"),
      seerah_review_questions: db("SELECT * FROM seerah_review_questions ORDER BY session_id, position;"),
      seerah_review_practice: db("SELECT * FROM seerah_review_practice ORDER BY child_id, priority DESC;"),
      streak_recovery_settings: db("SELECT * FROM streak_recovery_settings ORDER BY child_id;"),
      streak_states: db("SELECT * FROM streak_states ORDER BY child_id;"),
      streak_history: db("SELECT * FROM streak_history ORDER BY id;"),
      recovery_missions: db("SELECT * FROM recovery_missions ORDER BY id;"),
      rescue_quiz_sessions: db("SELECT * FROM rescue_quiz_sessions ORDER BY id;"),
      rescue_quiz_questions: db("SELECT * FROM rescue_quiz_questions ORDER BY session_id, position;"),
      child_wallets: db("SELECT * FROM child_wallets ORDER BY child_id;"),
      child_pets: db("SELECT * FROM child_pets ORDER BY child_id;"),
      child_moods: db("SELECT * FROM child_moods ORDER BY id;"),
      parent_praise_messages: db("SELECT * FROM parent_praise_messages ORDER BY id;"),
      app_settings: db("SELECT * FROM app_settings ORDER BY setting_key;"),
      sports_videos: db("SELECT * FROM sports_videos ORDER BY exercise_key;"),
      quran_favorite_surahs: db("SELECT * FROM quran_favorite_surahs ORDER BY child_id, surah_id;"),
      quran_revision_logs: db("SELECT * FROM quran_revision_logs ORDER BY id;"),
      quran_surah_progress: db("SELECT * FROM quran_surah_progress ORDER BY child_id, surah_id;"),
      quran_juz_awards: db("SELECT * FROM quran_juz_awards ORDER BY child_id, juz_number;"),
      quran_memorization_logs: db("SELECT * FROM quran_memorization_logs ORDER BY id;"),
      quran_reading_assignments: db("SELECT * FROM quran_reading_assignments ORDER BY child_id, sort_order, id;"),
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
    const mime = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "text/javascript",
      ".jsx": "text/javascript",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mov": "video/quicktime"
    }[extname(filePath)] || "text/plain";
    const file = readFileSync(filePath);
    const headers = { "Content-Type": mime };
    if (extname(filePath) === ".html" || requested === "/service-worker.js" || requested === "/app.jsx" || requested === "/app.bundle.js" || requested === "/quranicMotivations.js") {
      headers["Cache-Control"] = "no-cache";
    }
    res.writeHead(200, headers);
    res.end(file);
  } catch {
    if (res.headersSent) return;
    res.writeHead(404);
    res.end("Not found");
  }
}

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
