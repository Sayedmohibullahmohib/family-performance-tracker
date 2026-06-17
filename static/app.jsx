const { useEffect, useRef, useState } = React;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

const icons = {
  "Quran learning": "📖",
  "Five daily prayers": "🕌",
  Reading: "📚",
  Writing: "✏️",
  Mathematics: "➗",
  "Helping mother": "🏠",
  "Sport activity": "⚽",
  "Sleeping on time": "🌙",
  "Waking up on time": "☀️",
  "Self-organization": "🎒",
  "Teamwork activity": "🤝",
  "Clean bedroom": "🛏️",
  "Clean Bedroom": "🛏️",
  "Memorize one Vers of Quran": "🕌",
  "Memorize one Verse of Quran": "🕌",
  "Memorize one verse of Quran": "🕌",
  reward: "🎁"
};

const rewardIcons = {
  "iPad time": "📱",
  "PS5 time": "🎮",
  Chess: "♟️",
  Swimming: "🏊",
  "Ice cream": "🍦",
  "Park visit": "🌳",
  Restaurant: "🍽️",
  "Money exchange": "💰",
  default: "🎁"
};

const avatarIcons = {
  star: "🐱",
  rainbow: "🦋",
  rocket: "🦁",
  book: "🦉"
};

const avatarChoices = [
  "🐱", "🐶", "🐰", "🦊", "🐼", "🐯", "🦁", "🐵",
  "🐧", "🐬", "🦋", "🐢", "🦄", "🐝", "🦉", "🐴",
  "🐸", "🐨", "🐻", "🐮", "🐷", "🐥", "🦆", "🦅",
  "🦜", "🦚", "🦩", "🦢", "🦭", "🐳", "🐠", "🐙",
  "🦀", "🦞", "🦔", "🦥", "🦦", "🦫", "🦘", "🦒",
  "🦓", "🐘", "🦏", "🦛", "🐆", "🐅", "🐊", "🦖",
  "⚽", "🏃", "🦸", "🦸‍♀️", "🧙", "🧑‍🚀", "👩‍🏫", "👨‍🎓",
  "📚", "🧠", "🏆", "🚀", "🛡️", "👑", "🌟", "💫"
];

function CoinIcon() {
  return <span className="gold-coin" aria-hidden="true">💎</span>;
}

function avatarFor(value) {
  if (String(value || "").startsWith("data:image")) return "Photo";
  return avatarIcons[value] || value || "🐱";
}

function isPhotoAvatar(value) {
  return String(value || "").startsWith("data:image");
}

function dailyQuranicMotivation() {
  const motivations = window.quranicMotivations || [];
  if (!motivations.length) return null;
  const dayIndex = Math.floor(new Date().setHours(0, 0, 0, 0) / 86400000) % motivations.length;
  return motivations[dayIndex];
}

function QuranicMotivationCard({ compact = false }) {
  const motivation = dailyQuranicMotivation();
  if (!motivation) return null;
  return (
    <section className={compact ? "quranic-motivation-card compact" : "quranic-motivation-card"} aria-label="Quranic Motivation of the Day">
      <div className="quranic-icon" aria-hidden="true">{motivation.icon}</div>
      <div className="quranic-content">
        <p className="eyebrow">Quranic Motivation of the Day</p>
        <p className="quranic-arabic" dir="rtl" lang="ar">{motivation.arabic}</p>
        <h2>{motivation.english}</h2>
        <div className="quranic-reference">
          <span dir="rtl" lang="ar">{motivation.surahArabic}</span>
          <span>{motivation.surahEnglish}</span>
          <strong>{motivation.verse}</strong>
        </div>
      </div>
    </section>
  );
}

function AvatarDisplay({ value, className = "", label = "Avatar" }) {
  if (isPhotoAvatar(value)) return <img className={`avatar-photo ${className}`} src={value} alt={label} />;
  return <span className={className}>{avatarFor(value)}</span>;
}

function playSound(type = "success", enabled = true) {
  if (!enabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = type === "badge" ? 880 : type === "reward" ? 660 : 520;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
  } catch {}
}

function levelFor(points) {
  const level = Math.max(1, Math.floor(Number(points || 0) / 100) + 1);
  const titles = ["Starter", "Explorer", "Brave Helper", "Bright Scholar", "Super Helper", "Champion"];
  return { level, title: titles[Math.min(titles.length - 1, level - 1)], progress: Number(points || 0) % 100 };
}

function classSlug(value) {
  return String(value || "general").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "general";
}

function youtubeEmbedUrl(value = "") {
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtube.com") && url.searchParams.get("v")) {
      return `https://www.youtube-nocookie.com/embed/${url.searchParams.get("v")}`;
    }
    if (url.hostname.includes("youtu.be")) {
      return `https://www.youtube-nocookie.com/embed/${url.pathname.replace("/", "")}`;
    }
    if (url.hostname.includes("youtube.com") && url.pathname.includes("/embed/")) {
      return value.replace("youtube.com", "youtube-nocookie.com");
    }
  } catch {}
  return value;
}

function calendarInfo(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("en", { weekday: "long" }).format(date);
  const gregorian = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" }).format(date);
  const islamic = new Intl.DateTimeFormat("en-u-ca-islamic", { day: "numeric", month: "long", year: "numeric" }).format(date);
  const isWeekendDay = ["Saturday", "Sunday"].includes(weekday);
  return { weekday, gregorian, islamic, schedule: isWeekendDay ? "Weekend plan" : "Weekday plan" };
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const day = new Date().getDay();
    document.body.dataset.dayTheme = String(day);
  }, []);

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function login(name, password) {
    setError("");
    try {
      const data = await api("/api/login", { method: "POST", body: JSON.stringify({ name, password }) });
      localStorage.setItem("token", data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    setToken("");
    setUser(null);
  }

  useEffect(() => {
    if (!token) return;
    api("/api/me").then((data) => setUser(data.user)).catch(logout);
  }, [token]);

  if (!token || !user) return <Login onLogin={login} error={error} />;
  return (
    <Shell user={user} onLogout={logout}>
      {["admin", "parent"].includes(user.role) ? <ParentDashboard api={api} /> : <ChildDashboard api={api} />}
    </Shell>
  );
}

function Login({ onLogin, error }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  return (
    <main className="login-screen">
      <section className="login-welcome">
        <img className="login-logo-image" src="/train-the-teachers.jpg" alt="Train the Teachers logo" />
        <div className="login-copy">
          <p className="eyebrow">Family learning platform</p>
          <h1>Welcome to Family Performance Tracker 🌟</h1>
          <p>
            A smart and engaging platform designed to help families build positive habits, learning routines,
            and daily achievements. Children can complete activities, earn Hasanat, unlock rewards, and grow
            through fun learning experiences, while parents can easily track progress, encourage responsibility,
            and celebrate success together.
          </p>
          <strong>Learn • Grow • Achieve • Celebrate Together 🚀</strong>
          <div className="login-links" aria-label="Train the Teachers contact links">
            <a href="mailto:admin@traintheteachers.com">admin@traintheteachers.com</a>
            <a href="https://www.traintheteachers.com" target="_blank" rel="noreferrer">www.traintheteachers.com</a>
            <a href="https://www.courses.traintheteachers.com" target="_blank" rel="noreferrer">www.courses.traintheteachers.com</a>
          </div>
        </div>
      </section>
      <section className="login-panel" aria-label="Sign in">
        <div className="brand-mark">⭐</div>
        <h2>Sign in</h2>
        <p>Choose your name, enter your password, and start your day.</p>
        <form onSubmit={(event) => { event.preventDefault(); onLogin(name, password); }}>
          <label>Name<input value={name} placeholder="Type your name" onChange={(event) => setName(event.target.value)} /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error && <div className="error">{error}</div>}
          <button className="primary">Sign in</button>
        </form>
      </section>
    </main>
  );
}

function Shell({ user, onLogout, children }) {
  return (
    <div className="app-shell">
      <header>
        <div>
          <span className="logo">⭐</span>
          <strong>Kids Performance Tracker</strong>
        </div>
        <nav>
          <span>{user.name} · {user.role}</span>
          <button onClick={onLogout}>Logout</button>
        </nav>
      </header>
      {children}
    </div>
  );
}

function ChildDashboard({ api }) {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState("Keep going!");
  const [showConfetti, setShowConfetti] = useState(false);
  const [celebration, setCelebration] = useState("");
  const [pointPulse, setPointPulse] = useState(false);
  const [diamondBurst, setDiamondBurst] = useState(false);
  const [soundOn] = useState(() => localStorage.getItem("soundOn") !== "false");
  const [levelUp, setLevelUp] = useState(null);
  const [combo, setCombo] = useState(0);
  const [questBanner, setQuestBanner] = useState("");
  const [rewardUnlock, setRewardUnlock] = useState("");
  const [dailyWelcome, setDailyWelcome] = useState("");
  const [fireworks, setFireworks] = useState(false);
  const [dailyComplete, setDailyComplete] = useState(false);
  const [activityCelebration, setActivityCelebration] = useState(null);
  const [quranFilter, setQuranFilter] = useState("all");
  const [quranSort, setQuranSort] = useState("number");
  const [childTab, setChildTab] = useState("today");
  const [focusEntryKey, setFocusEntryKey] = useState("");

  useEffect(() => {
    let active = true;
    async function refreshDashboard() {
      try {
        const next = await api("/api/dashboard");
        if (!active) return;
        setData((previous) => {
          if (previous && previous.date !== next.date) {
            setMessage("A fresh new day is ready!");
          }
          if (!previous) {
            const welcomeKey = `welcome-${next.child.id}-${next.date}`;
            if (localStorage.getItem(welcomeKey) !== "seen") {
              setDailyWelcome(`${next.child.name}, welcome back! Day streak: ${next.streak}`);
              localStorage.setItem(welcomeKey, "seen");
              setTimeout(() => setDailyWelcome(""), 2600);
            }
          }
          return next;
        });
      } catch {}
    }
    function refreshWhenVisible() {
      if (!document.hidden) refreshDashboard();
    }
    refreshDashboard();
    const timer = setInterval(refreshDashboard, 60000);
    window.addEventListener("focus", refreshDashboard);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refreshDashboard);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    setDailyComplete(false);
  }, [data?.date]);

  useEffect(() => {
    if (!data?.settings?.seasonal_theme) return;
    document.body.dataset.seasonalTheme = data.settings.seasonal_theme;
  }, [data?.settings?.seasonal_theme]);

  if (!data) return <Loader />;

  const level = levelFor(data.points.total);

  function celebrate(type, text) {
    setCelebration(text);
    setShowConfetti(true);
    setFireworks(true);
    setTimeout(() => setShowConfetti(false), 2000);
    setTimeout(() => setFireworks(false), 1800);
    setTimeout(() => setCelebration(""), 2200);
    playSound(type, soundOn);
  }

  async function complete(activity, payload = {}) {
    const next = await api("/api/activities/complete", { method: "POST", body: JSON.stringify({ activityId: activity.id, ...payload }) });
    const earnedPoints = next.points.total > data.points.total;
    const earnedBadge = next.badges.length > data.badges.length;
    const nextCompletedToday = Number(next.summary?.completed_today || 0);
    const oldLevel = levelFor(data.points.total).level;
    const nextLevel = levelFor(next.points.total).level;
    const completedMissions = (data.missions || []).filter((mission) => mission.complete).length;
    const nextCompletedMissions = (next.missions || []).filter((mission) => mission.complete).length;
    const completedChallenges = (data.parentChallenges || []).filter((challenge) => challenge.complete).length;
    const nextCompletedChallenges = (next.parentChallenges || []).filter((challenge) => challenge.complete).length;
    const availableRewards = (data.rewards || []).filter((reward) => reward.status === "available").length;
    const nextAvailableRewards = (next.rewards || []).filter((reward) => reward.status === "available").length;
    const allDoneNow = Number(next.summary?.daily_target || 0) > 0 && Number(next.summary?.completed_today || 0) >= Number(next.summary?.daily_target || 0);
    setData(next);
    setMessage(activity.requires_approval || activity.proof_required ? "Sent to parent for approval!" : encouragementFor(activity));
    if (earnedPoints || earnedBadge || activity.requires_approval || activity.proof_required) {
      setActivityCelebration({
        title: activity.title,
        points: Math.max(0, Number(next.points.total || 0) - Number(data.points.total || 0)),
        streak: next.streak,
        message: activity.requires_approval || activity.proof_required ? "Sent to parent for approval!" : encouragementFor(activity)
      });
    }
    if (!activity.is_prayer || earnedPoints) {
      celebrate(earnedBadge ? "badge" : "success", earnedBadge ? "New badge earned!" : "Great job!");
    }
    if (!activity.is_prayer || earnedPoints) {
      setCombo((current) => {
        const nextCombo = current + 1;
        setTimeout(() => setCombo(0), 4200);
        return nextCombo;
      });
    }
    if (nextLevel > oldLevel) {
      setLevelUp({ level: nextLevel, title: levelFor(next.points.total).title });
      setTimeout(() => setLevelUp(null), 3000);
    }
    if (nextCompletedMissions > completedMissions) {
      setQuestBanner("Mission complete!");
      setTimeout(() => setQuestBanner(""), 2400);
    }
    if (nextCompletedChallenges > completedChallenges) {
      setQuestBanner("Parent challenge complete!");
      setTimeout(() => setQuestBanner(""), 2600);
    }
    if (nextAvailableRewards > availableRewards) {
      setRewardUnlock("New reward unlocked!");
      setTimeout(() => setRewardUnlock(""), 2600);
    }
    if (earnedPoints) {
      setPointPulse(true);
      setDiamondBurst(true);
      setTimeout(() => setPointPulse(false), 900);
      setTimeout(() => setDiamondBurst(false), 1400);
    }
    if (allDoneNow) maybeShowDailyComplete(next);
  }

  async function redeem(reward) {
    try {
      const next = await api("/api/redeem", { method: "POST", body: JSON.stringify({ rewardId: reward.id }) });
      setData(next);
      setMessage("Reward requested! Waiting for parent approval.");
      celebrate("reward", "Reward requested!");
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function chooseAvatar(avatar) {
    const next = await api("/api/my-avatar", { method: "PUT", body: JSON.stringify({ avatar }) });
    setData(next);
    setMessage("Nice choice!");
  }

  function uploadAvatarPhoto(file) {
    if (!file) return;
    setMessage("Uploading your picture...");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await chooseAvatar(String(reader.result || ""));
      } catch (err) {
        setMessage(err.message);
      }
    };
    reader.onerror = () => setMessage("This picture could not be opened. Please try another one.");
    reader.readAsDataURL(file);
  }

  async function saveMood(mood) {
    try {
      const next = await api("/api/mood", { method: "POST", body: JSON.stringify({ mood }) });
      setData(next);
      setMessage("Mood saved. Thank you for sharing.");
      playSound("success", soundOn);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function choosePet(pet) {
    try {
      const next = await api("/api/my-pet", { method: "POST", body: JSON.stringify({ pet_type: pet }) });
      setData(next);
      setMessage("Your pet companion is ready!");
      playSound("reward", soundOn);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function markPraiseSeen() {
    try {
      const next = await api("/api/praise/seen", { method: "POST", body: JSON.stringify({}) });
      setData(next);
    } catch {}
  }

  async function saveReflection(enjoyed, feeling) {
    try {
      const next = await api("/api/reflections", { method: "POST", body: JSON.stringify({ enjoyed_activity: enjoyed, feeling }) });
      setData(next);
      setMessage("Thank you for sharing how you felt today.");
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function checkEarlyBird() {
    try {
      const next = await api("/api/early-bird", { method: "POST", body: JSON.stringify({}) });
      setData(next);
      setMessage(next.earlyBirdMessage || "Early Bird checked!");
      if (next.earlyBirdMessage?.includes("20")) {
        setPointPulse(true);
        setDiamondBurst(true);
        celebrate("success", "Early Bird bonus!");
        setTimeout(() => setPointPulse(false), 900);
        setTimeout(() => setDiamondBurst(false), 1400);
      }
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function memorizeSurah(surah, memorizedVerses) {
    try {
      const next = await api("/api/quran/memorize", {
        method: "POST",
        body: JSON.stringify({ surahId: surah.id, memorizedVerses })
      });
      setData(next);
      setMessage(next.quranMessage || "Quran progress updated.");
      setPointPulse(true);
      celebrate("success", next.quranMessage || "Great job memorizing Quran!");
      setTimeout(() => setPointPulse(false), 900);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function reviseSurah(surah) {
    try {
      const next = await api("/api/quran/revise", {
        method: "POST",
        body: JSON.stringify({ surahId: surah.id })
      });
      setData(next);
      setMessage(next.quranMessage || "Revision saved.");
      setPointPulse(true);
      celebrate("success", next.quranMessage || "Excellent revision!");
      setTimeout(() => setPointPulse(false), 900);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function toggleFavoriteSurah(surah) {
    try {
      const next = await api("/api/quran/favorite", {
        method: "POST",
        body: JSON.stringify({ surahId: surah.id, favorite: !surah.favorite })
      });
      setData(next);
      setMessage(next.quranMessage || "Favorite Surahs updated.");
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function updateHifzPage(page, changes) {
    try {
      const next = await api("/api/hifz/update", {
        method: "POST",
        body: JSON.stringify({ id: page.id, ...changes })
      });
      setData(next);
      setMessage(next.hifzMessage || "Hifz plan updated.");
      if (["juz", "final", "surah"].includes(next.hifzCelebration)) {
        celebrate("badge", next.hifzMessage || "Juz completed!");
      } else if (next.hifzCelebration === "page") {
        celebrate("success", next.hifzMessage || "Page completed!");
      }
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function submitQuiz(quiz, answer, selectedAnswers = [], timeUsedSeconds = 0, heartsLeft = 0) {
    try {
      const next = await api(`/api/quizzes/${quiz.id}/submit`, {
        method: "POST",
        body: JSON.stringify({ answer, selectedAnswers, timeUsedSeconds, heartsLeft })
      });
      setData(next);
      setMessage(next.quizFeedback || "Quiz saved.");
      if (next.quizAnswer?.correct || next.quizFeedback?.startsWith("Correct")) {
        setPointPulse(true);
        setDiamondBurst(true);
        celebrate("success", "Quiz complete!");
        setTimeout(() => setPointPulse(false), 900);
        setTimeout(() => setDiamondBurst(false), 1400);
      }
      return next;
    } catch (err) {
      setMessage(err.message);
      return null;
    }
  }

  async function startSeerahReview() {
    try {
      const next = await api("/api/seerah-review/start", { method: "POST", body: JSON.stringify({}) });
      setData(next);
      setChildTab("quizzes");
      setMessage("Your Daily Seerah Review is ready.");
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function answerSeerahReview(answer) {
    try {
      const next = await api("/api/seerah-review/answer", { method: "POST", body: JSON.stringify({ answer }) });
      setData(next);
      const result = next.seerahReviewAnswer;
      setMessage(result?.correct ? "Excellent review answer!" : "Good effort. This question will return for more practice.");
      if (result?.correct) playSound("success", soundOn);
      return result;
    } catch (err) {
      setMessage(err.message);
      return null;
    }
  }

  async function startRescueQuiz() {
    try {
      const next = await api("/api/rescue-quiz/start", { method: "POST", body: JSON.stringify({}) });
      setData(next);
      setMessage("Your Daily Rescue Quiz is ready.");
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function answerRescueQuiz(answer) {
    try {
      const next = await api("/api/rescue-quiz/answer", { method: "POST", body: JSON.stringify({ answer }) });
      setData(next);
      const result = next.rescueQuizAnswer;
      setMessage(result?.passed ? "Your streak is restored!" : result?.correct ? "Correct rescue answer!" : "Keep practising. You can do this.");
      if (result?.correct) playSound("success", soundOn);
      return result;
    } catch (err) {
      setMessage(err.message);
      return null;
    }
  }

  function maybeShowDailyComplete(nextData = data) {
    const key = `daily-complete-${nextData.child.id}-${nextData.date}`;
    if (localStorage.getItem(key) === "seen") return;
    localStorage.setItem(key, "seen");
    setDailyComplete(true);
    celebrate("badge", "Amazing! You completed all your missions today!");
  }

  const progressToReward = Math.min(100, Math.round((data.points.total / Math.max(1, data.rewards[0]?.required_points || 1)) * 100));
  const calendar = calendarInfo(data.date);
  const challengeProgress = data.challengeProgress % 5 || (data.challengeProgress > 0 ? 5 : 0);
  const nextActivity = data.activities.find((activity) => !["completed", "approved"].includes(activity.status));
  const nextReward = (data.rewards || []).find((reward) => reward.status !== "available") || data.rewards?.[0];
  const nudgeMessages = buildNudges(data, nextActivity, nextReward);
  const progressMilestones = buildJourneyEntries(data.activities);
  const completedToday = progressMilestones.filter(journeyEntryComplete).length;
  const totalToday = Math.max(1, progressMilestones.length);
  const progressPercent = Math.min(100, Math.round((completedToday / totalToday) * 100));
  const focusEntry = progressMilestones.find((entry) => entry.key === focusEntryKey);
  const nextJourneyEntry = progressMilestones.find((entry) => !journeyEntryComplete(entry));

  function openTask(entry = nextJourneyEntry) {
    if (!entry) {
      maybeShowDailyComplete(data);
      return;
    }
    setFocusEntryKey(entry.key);
  }

  async function completeFocused(activity, payload) {
    await complete(activity, payload);
    setFocusEntryKey("");
  }

  return (
    <main className="dashboard">
      {showConfetti && <Confetti />}
      {fireworks && <MiniFireworks />}
      {diamondBurst && <DiamondBurst />}
      {celebration && <MegaCelebration text={celebration} />}
      {levelUp && <LevelUpOverlay level={levelUp.level} title={levelUp.title} />}
      {combo > 1 && <ComboToast combo={combo} />}
      {questBanner && <QuestBanner text={questBanner} />}
      {rewardUnlock && <RewardUnlockToast text={rewardUnlock} />}
      {dailyWelcome && <DailyWelcome text={dailyWelcome} />}
      {activityCelebration && <ActivityCelebrationModal details={activityCelebration} onClose={() => setActivityCelebration(null)} />}
      {focusEntry && (
        <FocusTaskOverlay
          entry={focusEntry}
          timerScope={`${data.child.id}-${data.date}`}
          onComplete={completeFocused}
          onClose={() => setFocusEntryKey("")}
        />
      )}
      {dailyComplete && (
        <DailyCompletionOverlay
          data={data}
          avatar={avatarFor(data.child.avatar)}
          reward={nextReward}
          progress={progressToReward}
          onRewards={() => {
            setDailyComplete(false);
            setChildTab("rewards");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onClose={() => setDailyComplete(false)}
          onReflect={saveReflection}
        />
      )}
      <Mascot message={message} />
      <section className="hero child-hero">
        <div>
          <p className="eyebrow">{calendar.weekday} · {calendar.gregorian} · {calendar.islamic}</p>
          <div className="child-title-row">
            <details className="avatar-menu">
              <summary aria-label="Choose your icon">
                <AvatarDisplay value={data.child.avatar} className={`hero-avatar level-${Math.min(5, level.level)}`} label={`${data.child.name} avatar`} />
                <small>Choose your icon</small>
              </summary>
              <div className="avatar-picker">
                <label className="photo-upload-button">
                  Add original picture
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      uploadAvatarPhoto(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
                {avatarChoices.map((avatar) => (
                  <button
                    className={!isPhotoAvatar(data.child.avatar) && avatarFor(data.child.avatar) === avatar ? "selected" : ""}
                    key={avatar}
                    onClick={() => chooseAvatar(avatar)}
                    title={`Choose ${avatar}`}
                  >
                    {avatar}
                  </button>
                ))}
              </div>
            </details>
            <h1>Hi {data.child.name}, {message}</h1>
          </div>
          <p>You are close to your reward!</p>
        </div>
        <div className="score-card">
          <span>Total Hasanat · Level {level.level}</span>
          <strong className={pointPulse ? "point-bounce" : ""}><CoinIcon />{data.points.total}</strong>
          <Progress value={progressToReward} />
        </div>
      </section>

      {childTab === "today" && (
        <div className="child-tab-panel" id="child-today-panel">
          {data.quranicMotivationVisible ? <QuranicMotivationCard /> : null}
          <PraiseBanner messages={data.praiseMessages || []} onSeen={markPraiseSeen} />

          <section className="today-progress-card" aria-label="Today’s progress">
            <div>
              <p className="eyebrow">Today’s Progress</p>
              <h2>{completedToday} / {totalToday} activities</h2>
              <p>{progressMessage(completedToday, totalToday)}</p>
            </div>
            <strong>{progressPercent}%</strong>
            <MilestoneProgress entries={progressMilestones} value={progressPercent} />
          </section>

          <StreakRecoveryDashboard
            recovery={data.streakRecovery}
            onStartQuiz={startRescueQuiz}
            onAnswerQuiz={answerRescueQuiz}
          />

          <section className="next-task-card" aria-label="Next task">
            <div className="next-task-copy">
              <span className="next-task-icon" aria-hidden="true">{nextJourneyEntry ? icons[nextJourneyEntry.activity?.title] || "🎯" : "🏆"}</span>
              <div>
                <p className="eyebrow">{nextJourneyEntry ? "Next activity" : "Today complete"}</p>
                <h2>{nextJourneyEntry?.title || "Amazing work!"}</h2>
                <p>{nextJourneyEntry ? "Open one task at a time and give it your best." : "You finished all your activities today."}</p>
              </div>
            </div>
            <button className="continue-task-button" type="button" onClick={() => openTask()}>
              {nextJourneyEntry ? "Continue Next Task" : "Celebrate Today"}
            </button>
          </section>

          <section className="nudge-list" aria-label="Helpful reminders">
            {nudgeMessages.slice(0, 2).map((item) => <p key={item}>{item}</p>)}
          </section>

          <SeerahReviewSummaryCard
            review={data.seerahReview}
            onStart={startSeerahReview}
            onOpen={() => setChildTab("quizzes")}
          />

          {data.activityOfTheDay && (
            <section className={data.todayChallengeCompleted ? "daily-challenge earned" : "daily-challenge"}>
              <div className="flag-pole" aria-hidden="true" />
              <div className="challenge-icon">{data.todayChallengeCompleted ? "✅" : icons[data.activityOfTheDay.title] || "🎯"}</div>
              <div>
                <p className="eyebrow">Activity of the day</p>
                <h2>{data.activityOfTheDay.title}</h2>
                <p>{data.todayChallengeCompleted ? "Completed today. Great job!" : `Badge of the Week progress: ${challengeProgress}/5`}</p>
              </div>
            </section>
          )}

          <section className="dashboard-section" id="today-tasks">
            <div className="section-heading">
              <p className="eyebrow">Today’s Tasks</p>
              <h2>Choose your next activity</h2>
              <p className="muted">Unfinished activities stay at the top. Finished activities move below.</p>
            </div>
            <ActivityJourney activities={data.activities} onFocus={openTask} />
          </section>

          <EarlyBirdCard earlyBird={data.earlyBird} onCheckIn={checkEarlyBird} />
        </div>
      )}

      {childTab === "quizzes" && (
        <div className="child-tab-panel" id="child-quizzes-panel">
          <header className="tab-page-heading">
            <p className="eyebrow">Learn and practise</p>
            <h2>Quizzes</h2>
            <p>Work through one question at a time.</p>
          </header>
          <SeerahDailyReview review={data.seerahReview} onStart={startSeerahReview} onAnswer={answerSeerahReview} />
          <SeerahQuizJourney
            quizzes={(data.quizzes || []).filter((quiz) => quiz.category_key === "prophet-muhammad-100-de")}
            progress={data.seerahQuiz}
            onSubmit={submitQuiz}
          />
          <QuizPanel quizzes={(data.quizzes || []).filter((quiz) => !quiz.category_key)} onSubmit={submitQuiz} />
        </div>
      )}

      {childTab === "rewards" && (
        <div className="child-tab-panel" id="child-rewards-panel">
          <header className="tab-page-heading">
            <p className="eyebrow">Celebrate your effort</p>
            <h2>Rewards and Badges</h2>
            <p>See what you earned and what you are close to unlocking.</p>
          </header>
          <section className="split secondary-split">
            <div id="rewards-section">
              <AchievementsPanel achievements={data.achievements} badges={data.badges} futureBadges={data.futureBadges} />
              <BadgeCollection childName={data.child.name} badges={data.badges} futureBadges={data.futureBadges} />
            </div>
            <div>
              <h2 className="section-title">Reward Shop</h2>
              <div className="reward-list">
                {data.rewards.map((reward) => (
                  <article className={`reward ${reward.status}`} key={reward.id}>
                    <div className="reward-icon">{rewardIcons[reward.title] || rewardIcons.default}</div>
                    <div>
                      <h3>{reward.title} <span className="rarity-label">{reward.required_points >= 150 ? "legendary" : reward.required_points >= 90 ? "rare" : "common"}</span> {reward.is_discounted ? <span className="discount-badge">{reward.discount_percent}% off</span> : null}</h3>
                      <p>{reward.description}</p>
                      {reward.is_discounted ? (
                        <strong><span className="old-price">{reward.required_points}</span><CoinIcon />{reward.discounted_points} Hasanat · {reward.status}</strong>
                      ) : (
                        <strong><CoinIcon />{reward.required_points} Hasanat · {reward.status}</strong>
                      )}
                      <RewardProgress reward={reward} points={data.points.total} />
                    </div>
                    <button disabled={reward.status !== "available"} onClick={() => redeem(reward)}>{reward.status === "requested" ? "Requested" : "Request"}</button>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {childTab === "progress" && (
        <div className="child-tab-panel" id="child-progress-panel">
          <header className="tab-page-heading">
            <p className="eyebrow">Your growth</p>
            <h2>My Progress</h2>
            <p>Review your Hasanat, streak, learning, and family ranking.</p>
          </header>
          <section className="stats progress-summary" aria-label="My progress">
            <Stat label="Daily Hasanat" value={data.points.daily} icon={<CoinIcon />} />
            <Stat label="Weekly Hasanat" value={data.points.weekly} icon={<CoinIcon />} />
            <Stat label="Day streak" value={`${data.streak} ${data.streak === 1 ? "day" : "days"}`} icon="🔥" pulse={data.streak > 0} power={Math.min(3, Math.floor(data.streak / 3) + 1)} />
            <Stat label="Level" value={level.level} icon="🏆" />
          </section>
          <section className="stats currency-strip" aria-label="Game currencies">
            <Stat label="XP" value={data.wallet?.xp || data.points.total} icon="⚡" />
            <Stat label="Hasanat" value={data.wallet?.coins || data.points.total} icon={<CoinIcon />} />
            <Stat label="Gems" value={data.wallet?.gems || 0} icon="💠" />
            <Stat label="Keys" value={data.wallet?.keys || 0} icon="🗝️" />
            <Stat label="Tickets" value={data.wallet?.treasure_tickets || 0} icon="🎟️" />
          </section>
          <section className="top-ranking-board">
            <Leaderboard children={data.leaderboard} currentChildId={data.child.id} />
          </section>
          <QuranDashboardProgress quran={data.quran} />
          <SportsDashboard sports={data.sports} activities={data.activities.filter((activity) => activity.subject === "Sports & Physical Development")} onComplete={complete} />
          <QuranMemorizationPanel
            quran={data.quran}
            filter={quranFilter}
            sort={quranSort}
            onFilter={setQuranFilter}
            onSort={setQuranSort}
            onMemorize={memorizeSurah}
            onRevise={reviseSurah}
            onFavorite={toggleFavoriteSurah}
          />
          <CollapsibleSection title="Daily Missions">
            <section className="game-grid compact-grid">
              <MissionBoard missions={data.missions} />
            </section>
          </CollapsibleSection>
          <CollapsibleSection title="Family & Ranking">
            <section className="split secondary-split">
              <div><ParentChallengeBoard challenges={data.parentChallenges} /></div>
              <div>
                <ProgressRace children={data.leaderboard} currentChildId={data.child.id} />
                <RedemptionBoard children={data.redemptionBoard} currentChildId={data.child.id} />
              </div>
            </section>
          </CollapsibleSection>
        </div>
      )}

      <nav className="child-bottom-nav" aria-label="Child dashboard navigation">
        {[
          ["today", "☀️", "Today"],
          ["quizzes", "❓", "Quizzes"],
          ["rewards", "🎁", "Rewards"],
          ["progress", "📈", "My Progress"]
        ].map(([key, icon, label]) => (
          <button
            className={childTab === key ? "active" : ""}
            type="button"
            key={key}
            onClick={() => {
              setChildTab(key);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            aria-current={childTab === key ? "page" : undefined}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </main>
  );
}

function MegaCelebration({ text }) {
  return (
    <div className="mega-celebration" aria-live="polite">
      <div>
        <span>✨</span>
        <strong>{text}</strong>
        <span>💎</span>
      </div>
    </div>
  );
}

function ActivityCelebrationModal({ details, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 2200);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="activity-celebration-modal" role="dialog" aria-modal="true" aria-label="Activity completed" onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()}>
        <span>🎉</span>
        <p className="eyebrow">Mission update</p>
        <h2>{details.title}</h2>
        <p>{details.message}</p>
        <div className="complete-stats">
          <span><strong>{details.points}</strong> Hasanat</span>
          <span><strong>{details.streak}</strong> streak</span>
          <span><strong>XP</strong> growing</span>
        </div>
        <button onClick={onClose}>Continue</button>
      </div>
    </div>
  );
}

function DiamondBurst() {
  return (
    <div className="diamond-burst" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6].map((item) => (
        <span key={item} style={{ "--i": item }}>💎</span>
      ))}
    </div>
  );
}

function MiniFireworks() {
  return (
    <div className="mini-fireworks" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((item) => <span key={item} style={{ "--i": item }} />)}
    </div>
  );
}

function LevelUpOverlay({ level, title }) {
  return (
    <div className="level-up-overlay" aria-live="polite">
      <div>
        <span>🏆</span>
        <p className="eyebrow">Level up</p>
        <h2>Level {level}</h2>
        <strong>{title}</strong>
      </div>
    </div>
  );
}

function ComboToast({ combo }) {
  return <div className="combo-toast">{combo}x Combo!</div>;
}

function QuestBanner({ text }) {
  return <div className="quest-banner">{text}</div>;
}

function RewardUnlockToast({ text }) {
  return <div className="reward-unlock-toast">🔓 {text}</div>;
}

function DailyWelcome({ text }) {
  return <div className="daily-welcome">🌟 {text}</div>;
}

function encouragementFor(activity) {
  const title = String(activity?.title || "").toLowerCase();
  if (title.includes("quran") || activity?.is_prayer) return "Excellent effort. May your learning bring goodness.";
  if (title.includes("mathematics")) return "Great thinking! Your skills are growing.";
  if (title.includes("helping")) return "Well done. Helping at home is a beautiful habit.";
  if (title.includes("reading") || title.includes("writing")) return "Excellent effort. You are building a strong habit.";
  return "Great job! You completed your task.";
}

function CollapsibleSection({ id, title, children, defaultOpen = false }) {
  return (
    <details id={id} className="ux-section" open={defaultOpen}>
      <summary>
        <strong>{title}</strong>
        <span>Open</span>
      </summary>
      {children}
    </details>
  );
}

function PraiseBanner({ messages = [], onSeen }) {
  const latest = messages.find((message) => message.status === "unread") || messages[0];
  if (!latest) return null;
  return (
    <section className={latest.status === "unread" ? "praise-banner unread" : "praise-banner"}>
      <span>💌</span>
      <div>
        <p className="eyebrow">Parent praise</p>
        <h2>{latest.message}</h2>
        <small>From {latest.parent_name}</small>
      </div>
      {latest.status === "unread" ? <button onClick={onSeen}>Thank you</button> : null}
    </section>
  );
}

const petIcons = {
  cat: "🐱",
  lion: "🦁",
  bird: "🦜",
  dolphin: "🐬",
  dragon: "🐉",
  puppy: "🐶"
};

function PetCompanion({ pet, onChoose }) {
  const current = pet || { pet_type: "puppy", pet_name: "Buddy", happiness: 40, pet_level: 1 };
  return (
    <section className="game-card pet-card">
      <div className="game-card-head">
        <span className="pet-avatar">{petIcons[current.pet_type] || "🐶"}</span>
        <div>
          <p className="eyebrow">Pet companion</p>
          <h2>{current.pet_name || "Buddy"} · Level {current.pet_level || 1}</h2>
        </div>
      </div>
      <Progress value={Number(current.happiness || 0)} />
      <p>{Number(current.happiness || 0) >= 80 ? "Your pet is super happy!" : "Complete activities to make your pet happier."}</p>
      <div className="pet-picker">
        {Object.entries(petIcons).map(([key, icon]) => (
          <button className={current.pet_type === key ? "selected" : "ghost"} key={key} onClick={() => onChoose(key)}>{icon}</button>
        ))}
      </div>
    </section>
  );
}

function MoodCheckIn({ mood, onMood }) {
  const moods = [
    ["happy", "😊"],
    ["tired", "😴"],
    ["excited", "🤩"],
    ["sad", "😔"],
    ["angry", "😠"],
    ["calm", "😌"]
  ];
  return (
    <section className="game-card mood-card">
      <div className="game-card-head">
        <span>💭</span>
        <div>
          <p className="eyebrow">Mood check-in</p>
          <h2>{mood ? `Feeling ${mood.mood}` : "How do you feel?"}</h2>
        </div>
      </div>
      <div className="mood-options">
        {moods.map(([key, icon]) => (
          <button className={mood?.mood === key ? "selected" : "ghost"} key={key} onClick={() => onMood(key)} aria-label={`I feel ${key}`}>{icon}</button>
        ))}
      </div>
    </section>
  );
}

function SportsDashboard({ sports, activities = [], onComplete }) {
  const [demo, setDemo] = useState(null);
  if (!sports) return null;
  const percent = sports.today_total ? Math.round((sports.today_completed / sports.today_total) * 100) : 0;
  return (
    <section className="sports-dashboard" aria-label="Sports and Physical Development">
      <div className="sports-hero">
        <div>
          <p className="eyebrow">Sports & Physical Development</p>
          <h2>Move, train, and grow stronger</h2>
          <p>You are getting stronger, faster, and more balanced one activity at a time.</p>
        </div>
        <div className="sports-ring" style={{ "--sports-progress": `${percent}%` }}>
          <strong>{percent}%</strong>
          <span>today</span>
        </div>
      </div>
      <div className="sports-stats">
        <Stat label="Completed" value={`${sports.today_completed}/${sports.today_total}`} icon="✅" />
        <Stat label="Remaining" value={sports.today_remaining} icon="🎯" />
        <Stat label="Sports streak" value={`${sports.sports_streak} days`} icon="🔥" pulse={sports.sports_streak > 0} />
        <Stat label="Weekly" value={sports.weekly_completed} icon="📈" />
        <Stat label="Monthly" value={sports.monthly_completed} icon="🏆" />
        <Stat label="Sports Hasanat" value={sports.total_hasnat} icon={<CoinIcon />} />
        <Stat label="Exercise time" value={`${sports.total_time} min`} icon="⏱️" />
      </div>
      <div className="sports-activity-grid">
        {activities.length === 0 ? <p className="muted">No sports activities assigned for today.</p> : activities.map((activity) => (
          <SportsExerciseCard activity={activity} key={activity.id} onDemo={setDemo} onComplete={onComplete} />
        ))}
      </div>
      <div className="sports-badges">
        {(sports.badges || []).map((badge) => (
          <article className={badge.earned ? "sports-badge earned" : "sports-badge"} key={badge.title}>
            <span>{badge.icon}</span>
            <strong>{badge.title}</strong>
            <small>{badge.description}</small>
            <Progress value={Math.round((Number(badge.progress || 0) / Math.max(1, Number(badge.target || 1))) * 100)} />
          </article>
        ))}
      </div>
      {demo ? <ExerciseDemoModal activity={demo} onClose={() => setDemo(null)} /> : null}
    </section>
  );
}

function SportsExerciseCard({ activity, onDemo, onComplete }) {
  const taskData = activity.task_data || {};
  const video = activity.sports_video || {};
  const complete = ["completed", "approved"].includes(activity.status);
  return (
    <article className={complete ? "sports-exercise complete" : "sports-exercise"}>
      {video.thumbnail_url ? (
        <button className="sports-video-thumb" type="button" onClick={() => onDemo(activity)} aria-label={`Watch ${activity.title} demo`}>
          <img src={video.thumbnail_url} alt={`${activity.title} demo thumbnail`} loading="lazy" />
          <span>▶</span>
        </button>
      ) : (
        <ExerciseAnimation exerciseKey={taskData.exerciseKey} />
      )}
      <div>
        <p className="eyebrow">{taskData.category || "Sports"} · {taskData.difficulty || "Easy"}</p>
        <h3>{activity.title}</h3>
        <p>{activity.description}</p>
        <small>{taskData.recommendation || "Try your best"} · <CoinIcon /> {activity.points} Hasanat</small>
        {video.video_url ? <small className="video-ready">Real video demo ready</small> : <small className="muted">Animation demo until a real video is added</small>}
      </div>
      <div className="sports-actions">
        <button className="ghost" type="button" onClick={() => onDemo(activity)}>Watch Demo</button>
        <button disabled={complete} type="button" onClick={() => onComplete(activity)}>{complete ? "Completed" : "Complete"}</button>
      </div>
    </article>
  );
}

function ExerciseAnimation({ exerciseKey = "run" }) {
  return (
    <div className={`exercise-animation exercise-${classSlug(exerciseKey)}`} aria-hidden="true">
      <span className="exercise-head" />
      <span className="exercise-body" />
      <span className="exercise-arm left" />
      <span className="exercise-arm right" />
      <span className="exercise-leg left" />
      <span className="exercise-leg right" />
      <span className="exercise-ground" />
    </div>
  );
}

function ExerciseDemoModal({ activity, onClose }) {
  const data = activity.task_data || {};
  const video = activity.sports_video || {};
  const videoRef = useRef(null);
  const steps = Array.isArray(data.instructions) ? data.instructions : ["Start slowly.", "Keep control.", "Finish with a smile."];
  const safety = video.safety_tips || data.safety || "Warm up first. Drink water. Stop if you feel pain. Ask a parent for help.";
  const hasVideo = Boolean(video.enabled && video.video_url);
  const isYoutube = video.source_type === "youtube";
  function replay() {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }
  return (
    <div className="demo-modal" role="dialog" aria-modal="true" aria-label={`${activity.title} demo`} onClick={onClose}>
      <section onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close demo">×</button>
        {hasVideo ? (
          <div className="sports-video-frame">
            {isYoutube ? (
              <iframe
                title={`${activity.title} demonstration video`}
                src={youtubeEmbedUrl(video.video_url)}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video ref={videoRef} controls preload="metadata" poster={video.thumbnail_url || ""}>
                <source src={video.video_url} />
                Your browser cannot play this video.
              </video>
            )}
          </div>
        ) : (
          <div className="sports-video-placeholder">
            <ExerciseAnimation exerciseKey={data.exerciseKey} />
            <strong>No real video has been added yet.</strong>
            <span>The safe animation demo is shown until a parent/admin adds a video.</span>
          </div>
        )}
        <p className="eyebrow">Watch Demo</p>
        <h2>{activity.title}</h2>
        <p>{video.explanation || data.recommendation || "Watch the movement, then start slowly and safely."}</p>
        <ol>
          {steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <div className="demo-safety">Safety reminder: {safety}</div>
        <div className="video-replay-row">
          {hasVideo && !isYoutube ? <button className="ghost" type="button" onClick={replay}>Replay video</button> : null}
          <button onClick={onClose}>Start Activity</button>
        </div>
      </section>
    </div>
  );
}

const quizTypes = [
  ["select_3", "Correct answer · 3 options"],
  ["select_4", "Correct answer · 4 options"],
  ["multiple_correct", "Multiple correct answers"],
  ["best_sentence", "Choose the best sentence"],
  ["picture_choice", "Picture multiple choice"],
  ["audio_choice", "Audio multiple choice"],
  ["timed_challenge", "Timed quiz challenge"],
  ["level_quiz", "Level-based quiz"],
  ["streak_quiz", "Streak quiz"],
  ["daily_quiz_mission", "Daily quiz mission"],
  ["survival_hearts", "Survival mode with hearts"],
  ["wheel_spinner", "Quiz wheel spinner"],
  ["true_false", "True/false quiz"],
  ["fill_missing_options", "Fill missing word"],
  ["drag_correct_answer", "Drag correct answer"],
  ["arrange_sentence", "Arrange the sentence"],
  ["find_mistake", "Find the mistake"],
  ["fastest_finger", "Fastest finger challenge"],
  ["memory_quiz", "Memory quiz"],
  ["emoji_quiz", "Emoji quiz"],
  ["story_quiz", "Story-based quiz"],
  ["unlock_next_level", "Unlock next level"],
  ["reward_box", "Reward box quiz"],
  ["adaptive_difficulty", "Adaptive difficulty"]
];

function StreakRecoveryDashboard({ recovery, onStartQuiz, onAnswerQuiz }) {
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [answeredQuestion, setAnsweredQuestion] = useState(null);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  if (!recovery) return null;
  const rescue = recovery.rescue_quiz;
  const question = result && answeredQuestion ? answeredQuestion : rescue?.current_question;
  const progress = recovery.recovery_required
    ? Math.round((recovery.recovery_completed / recovery.recovery_required) * 100)
    : 100;

  async function chooseAnswer(option) {
    if (!question || saving || result) return;
    setSelectedAnswer(option);
    setAnsweredQuestion(question);
    setSaving(true);
    setResult(await onAnswerQuiz(option));
    setSaving(false);
  }

  function continueQuiz() {
    setSelectedAnswer("");
    setAnsweredQuestion(null);
    setResult(null);
  }

  return (
    <section className={`streak-recovery-card ${recovery.recovery_status}`} aria-label="Streak Recovery and Learning Tree">
      <div className="streak-recovery-heading">
        <div>
          <p className="eyebrow">Streak Recovery</p>
          <h2>{recovery.recovery_status === "active" ? "Your comeback is ready" : "Your streak is protected"}</h2>
          <p>{recovery.recovery_status === "active" ? `${recovery.missed_days} missed day(s). Complete your recovery to restore full growth.` : "Stay active today and keep your Learning Tree strong."}</p>
        </div>
        <div className="shield-counter" aria-label={`${recovery.shields} streak shields`}>
          <span>🛡️</span>
          <strong>{recovery.shields}/{recovery.max_shields}</strong>
          <small>shields</small>
        </div>
      </div>

      <div className="streak-recovery-stats">
        <div><span>🔥</span><strong>{recovery.current_streak}</strong><small>current streak</small></div>
        <div><span>👨‍👩‍👧‍👦</span><strong>{recovery.family_streak}</strong><small>family streak</small></div>
        <div className={recovery.tree.weak ? "learning-tree weak" : "learning-tree"}>
          <span>{recovery.tree.icon}</span>
          <strong>{recovery.tree.stage}</strong>
          <small>{recovery.tree.health}% healthy</small>
        </div>
      </div>

      {result?.finished && (
        <div className={result.passed ? "rescue-final-result passed" : "rescue-final-result retry"}>
          <strong>{result.passed ? "Comeback complete!" : "Almost there. Try once more."}</strong>
          <p>
            {result.passed
              ? `You scored ${result.score}% and restored your streak.`
              : `You scored ${result.score}%. Reach 80% to restore your streak.`}
          </p>
          <button type="button" onClick={continueQuiz}>
            {result.passed ? "Back to dashboard" : "Choose Try Rescue Quiz Again"}
          </button>
        </div>
      )}

      {recovery.recovery_status === "active" && (
        <div className="recovery-work">
          <div className="recovery-progress-row">
            <strong>{recovery.recovery_completed}/{recovery.recovery_required} recovery activities</strong>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} />
          <div className="recovery-missions">
            {recovery.missions.map((mission) => (
              <article className={mission.completed ? "complete" : ""} key={mission.id}>
                <span>{mission.completed ? "✓" : mission.mission_type === "sports" ? "⚽" : mission.mission_type === "islamic" ? "🕌" : mission.mission_type === "reading" ? "📚" : mission.mission_type === "family_helping" ? "🏠" : "❓"}</span>
                <strong>{mission.title}</strong>
              </article>
            ))}
          </div>

          {!rescue && <button className="rescue-quiz-start" type="button" onClick={onStartQuiz}>Start Daily Rescue Quiz</button>}
          {rescue?.status === "failed" && <button className="rescue-quiz-start" type="button" onClick={onStartQuiz}>Try Rescue Quiz Again</button>}
          {rescue?.status === "in_progress" && question && (
            <article className="rescue-question-card">
              <div className="recovery-progress-row">
                <strong>Daily Rescue Quiz · {question.position}/{rescue.total_questions}</strong>
                <span>{rescue.correct_answers} correct · pass 80%</span>
              </div>
              <h3>{question.question_text}</h3>
              <div className="seerah-options" role="radiogroup" aria-label="Rescue quiz answers">
                {(question.options || []).map((option, index) => {
                  const selected = selectedAnswer === option;
                  const stateClass = result && selected ? (result.correct ? "correct" : "wrong") : "";
                  const revealCorrect = result && !result.correct && option === result.correctAnswer ? "correct-answer" : "";
                  return (
                    <button type="button" className={`${stateClass} ${revealCorrect}`} key={option} onClick={() => chooseAnswer(option)} disabled={saving || Boolean(result)}>
                      <span>{String.fromCharCode(65 + index)}</span>{option}
                    </button>
                  );
                })}
              </div>
              {result && !result.finished && (
                <div className={result.correct ? "seerah-feedback correct" : "seerah-feedback wrong"}>
                  <strong>{result.correct ? "Correct!" : `Correct answer: ${result.correctAnswer}`}</strong>
                  <p>{result.explanation}</p>
                  <button type="button" onClick={continueQuiz}>Next question</button>
                </div>
              )}
            </article>
          )}
        </div>
      )}
    </section>
  );
}

function SeerahReviewSummaryCard({ review, onStart, onOpen }) {
  if (!review?.enabled) return null;
  const statusLabel = review.status === "completed" ? "Completed" : review.status === "in_progress" ? "In progress" : "Not started";
  return (
    <section className={`seerah-review-summary ${review.status}`} aria-label="Daily Seerah Review Quiz">
      <div className="seerah-review-symbol" aria-hidden="true">📚</div>
      <div>
        <p className="eyebrow">Daily consolidation</p>
        <h2>Daily Seerah Review Quiz</h2>
        <p>{statusLabel} · {review.total_questions || review.question_count} questions · 🔥 {review.streak}-day streak</p>
        <small>Review reward: question Hasnat + 20 completion bonus + 30 perfect-score bonus.</small>
      </div>
      {review.status === "not_started" ? (
        <button type="button" onClick={onStart}>Start Daily Review</button>
      ) : review.status === "in_progress" ? (
        <button type="button" onClick={onOpen}>Continue {review.current_index}/{review.total_questions}</button>
      ) : (
        <button className="ghost" type="button" onClick={onOpen}>See today’s result</button>
      )}
    </section>
  );
}

function SeerahDailyReview({ review, onStart, onAnswer }) {
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [result, setResult] = useState(null);
  const [answeredQuestion, setAnsweredQuestion] = useState(null);
  const [saving, setSaving] = useState(false);
  if (!review?.enabled) return null;
  const question = review.current_question;
  const displayQuestion = result && answeredQuestion ? answeredQuestion : question;

  async function chooseAnswer(option) {
    if (!displayQuestion || saving || result) return;
    setSelectedAnswer(option);
    setAnsweredQuestion(displayQuestion);
    setSaving(true);
    const nextResult = await onAnswer(option);
    setResult(nextResult);
    setSaving(false);
  }

  function continueReview() {
    setSelectedAnswer("");
    setResult(null);
    setAnsweredQuestion(null);
  }

  return (
    <section className="dashboard-section seerah-daily-review" aria-label="Daily Seerah Review Quiz">
      <div className="seerah-review-heading">
        <div>
          <p className="eyebrow">Repeat and remember</p>
          <h2>Daily Seerah Review Quiz</h2>
          <p>Only questions you have already reached appear here.</p>
        </div>
        <div className="seerah-review-streak">
          <span>🔥</span>
          <strong>{review.streak}</strong>
          <small>day streak</small>
        </div>
      </div>

      {review.status === "not_started" && (
        <div className="seerah-review-start">
          <div>
            <strong>{Math.min(review.question_count, review.unlocked_questions)} review questions today</strong>
            <p>Previously missed questions receive extra practice.</p>
          </div>
          <button type="button" disabled={review.unlocked_questions < 1} onClick={onStart}>Start Daily Review</button>
        </div>
      )}

      {(review.status === "in_progress" || result) && displayQuestion && (
        <>
          <div className="seerah-review-progress">
            <span>{review.current_index}/{review.total_questions} review questions completed</span>
            <strong>{review.correct_answers} correct · {review.wrong_answers} to practise</strong>
          </div>
          <Progress value={Math.round((review.current_index / Math.max(1, review.total_questions)) * 100)} />
          <article className="seerah-question-card review-question-card">
            <div className="seerah-question-meta">
              <span>Review {displayQuestion.position} of {review.total_questions}</span>
              <span className={`difficulty ${displayQuestion.difficulty}`}>{displayQuestion.difficulty} · {displayQuestion.reward_hasnat} Hasnat</span>
            </div>
            <h3>{displayQuestion.question_text}</h3>
            <div className="seerah-options" role="radiogroup" aria-label="Daily review answer options">
              {(displayQuestion.options || []).map((option, index) => {
                const selected = selectedAnswer === option;
                const stateClass = result && selected ? (result.correct ? "correct" : "wrong") : "";
                const revealCorrect = result && !result.correct && option === result.correctAnswer ? "correct-answer" : "";
                return (
                  <button
                    type="button"
                    className={`${stateClass} ${revealCorrect}`}
                    key={option}
                    onClick={() => chooseAnswer(option)}
                    disabled={saving || Boolean(result)}
                    aria-label={`Review answer ${index + 1}: ${option}`}
                  >
                    <span>{String.fromCharCode(65 + index)}</span>{option}
                  </button>
                );
              })}
            </div>
            {saving ? <p className="seerah-feedback waiting">Checking your answer...</p> : null}
            {result ? (
              <div className={result.correct ? "seerah-feedback correct" : "seerah-feedback wrong"}>
                <strong>{result.correct ? "Correct! Your memory is getting stronger." : `The correct answer is: ${result.correctAnswer}`}</strong>
                <p>{result.explanation}</p>
                {result.earnedHasnat ? <span>+{result.earnedHasnat} Hasnat</span> : null}
                <button type="button" onClick={continueReview}>
                  {result.completed ? "See my result" : "Next review question"}
                </button>
              </div>
            ) : null}
          </article>
        </>
      )}

      {review.status === "completed" && !result && (
        <div className="seerah-review-result">
          <span aria-hidden="true">🏅</span>
          <div>
            <p className="eyebrow">Today’s review complete</p>
            <h3>{review.correct_answers}/{review.total_questions} correct</h3>
            <p>{review.wrong_answers} wrong · {review.hasnat_earned} Hasnat earned</p>
            <strong>{review.wrong_answers === 0 ? "Perfect review! MaschaAllah." : "Well done. Your practice list is ready for tomorrow."}</strong>
          </div>
        </div>
      )}

      {review.needs_practice?.length > 0 && (
        <details className="needs-practice-list">
          <summary>Needs More Practice <strong>{review.needs_practice.length}</strong></summary>
          <div>
            {review.needs_practice.map((item) => (
              <p key={item.question_number}>Question {item.question_number}: {item.question_text}</p>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function SeerahQuizJourney({ quizzes = [], progress, onSubmit }) {
  const [result, setResult] = useState(null);
  const [answeredQuiz, setAnsweredQuiz] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  if (!progress?.assigned || !quizzes.length) return null;

  const sorted = [...quizzes].sort((a, b) => Number(a.category_question_id || 0) - Number(b.category_question_id || 0));
  const currentQuiz = sorted.find((quiz) => Number(quiz.category_question_id) === Number(progress.current_question));
  const displayQuiz = result && answeredQuiz ? answeredQuiz : currentQuiz;
  const displayOptions = displayQuiz?.options || [];
  const badgeMilestones = [
    [1, "Seerah Beginner", "🌙"],
    [10, "Prophet’s Life Learner", "📖"],
    [25, "Good Akhlaq Star", "⭐"],
    [50, "50 Questions Champion", "🏆"],
    [100, "100 Questions Master", "👑"]
  ];

  async function chooseAnswer(option) {
    if (saving || result || !displayQuiz) return;
    setSelectedAnswer(option);
    setSaving(true);
    setAnsweredQuiz(displayQuiz);
    const next = await onSubmit(displayQuiz, option, [], 0, 0);
    setResult(next?.quizAnswer || { correct: false, feedback: "Die Antwort konnte nicht gespeichert werden.", earnedHasnat: 0 });
    setSaving(false);
  }

  function continueQuiz() {
    setResult(null);
    setAnsweredQuiz(null);
    setSelectedAnswer("");
  }

  return (
    <section className="dashboard-section seerah-quiz" aria-label="100 Fragen über den Propheten Muhammad">
      <div className="seerah-quiz-heading">
        <div>
          <p className="eyebrow">Seerah Lernreise</p>
          <h2>100 Fragen über den Propheten Muhammad ﷺ</h2>
          <p>Lerne Schritt für Schritt über sein Leben, seine Sunnah und seinen schönen Charakter.</p>
        </div>
        <div className="seerah-score">
          <strong>{progress.completed}/{progress.total}</strong>
          <span>beantwortet</span>
        </div>
      </div>
      <div className="seerah-progress-label">
        <span>Level {progress.current_level} · Frage {Math.min(progress.current_question, progress.total)}</span>
        <strong>{progress.percentage}% · {progress.earned_hasnat} Hasnat verdient</strong>
      </div>
      <Progress value={progress.percentage} />
      <div className="seerah-level-progress">
        <span>In diesem Level: {progress.questions_completed_in_level}/{Math.min(progress.level_size, progress.level_end - progress.level_start + 1)}</span>
        <Progress value={Math.round((progress.questions_completed_in_level / Math.max(1, Math.min(progress.level_size, progress.level_end - progress.level_start + 1))) * 100)} />
      </div>

      {displayQuiz ? (
        <article className="seerah-question-card">
          <div className="seerah-question-meta">
            <span>Frage {displayQuiz.category_question_id} von {progress.total}</span>
            <span className={`difficulty ${displayQuiz.difficulty}`}>{displayQuiz.difficulty} · {displayQuiz.coin_reward} Hasnat</span>
          </div>
          <h3>{displayQuiz.question_text}</h3>
          <div className="seerah-options" role="radiogroup" aria-label="Antwortmöglichkeiten">
            {displayOptions.map((option, index) => {
              const selected = selectedAnswer === option;
              const stateClass = result && selected ? (result.correct ? "correct" : "wrong") : "";
              const revealCorrect = result && !result.correct && option === result.correctAnswer ? "correct-answer" : "";
              return (
                <button
                  type="button"
                  className={`${stateClass} ${revealCorrect}`}
                  key={option}
                  onClick={() => chooseAnswer(option)}
                  disabled={saving || Boolean(result)}
                  aria-label={`Antwort ${index + 1}: ${option}`}
                >
                  <span>{String.fromCharCode(65 + index)}</span>{option}
                </button>
              );
            })}
          </div>
          {saving ? <p className="seerah-feedback waiting">Antwort wird geprüft...</p> : null}
          {result ? (
            <div className={result.correct ? "seerah-feedback correct" : "seerah-feedback wrong"}>
              <strong>
                {result.levelCompleted
                  ? "Excellent! You completed this level. The next level is unlocked."
                  : result.correct
                    ? "Richtig! Sehr gut gemacht."
                    : "Not correct this time. Let’s practise this level again from the beginning."}
              </strong>
              <p>{result.feedback}</p>
              {result.earnedHasnat ? <span>+{result.earnedHasnat} Hasnat</span> : null}
              <button type="button" onClick={continueQuiz}>
                {result.levelCompleted ? "Nächstes Level" : result.correct ? "Nächste Frage" : `Zurück zu Frage ${progress.level_start}`}
              </button>
            </div>
          ) : null}
        </article>
      ) : (
        <article className="seerah-complete">
          <span>🏆</span>
          <h3>MaschaAllah! Alle 100 Fragen geschafft.</h3>
          <p>Du hast {progress.earned_hasnat} Hasnat in dieser Lernreise verdient.</p>
        </article>
      )}

      <div className="seerah-badges">
        {badgeMilestones.map(([target, title, icon]) => (
          <article className={progress.completed >= target ? "unlocked" : "locked"} key={title}>
            <span>{icon}</span>
            <strong>{title}</strong>
            <small>{progress.completed >= target ? "Freigeschaltet" : `${Math.max(0, target - progress.completed)} Fragen übrig`}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function QuizPanel({ quizzes = [], onSubmit }) {
  if (!quizzes.length) return null;
  const openQuiz = quizzes.find((quiz) => !quiz.last_passed) || quizzes[0];
  return (
    <section className="dashboard-section quiz-panel" aria-label="Quiz missions">
      <div className="section-heading">
        <p className="eyebrow">Quiz Missions</p>
        <h2>Answer one question at a time</h2>
      </div>
      <div className="quiz-grid">
        <QuizCard quiz={openQuiz} onSubmit={onSubmit} featured />
        <div className="quiz-side-list">
          {quizzes.slice(0, 6).map((quiz) => (
            <article className={quiz.last_passed ? "quiz-mini passed" : "quiz-mini"} key={quiz.id}>
              <strong>{quiz.title}</strong>
              <span>{quiz.subject} · Level {quiz.level} · {quiz.difficulty}</span>
              <small>{quiz.attempts || 0} attempts{quiz.last_passed ? " · passed" : ""}</small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function QuizCard({ quiz, onSubmit, featured = false }) {
  const [answer, setAnswer] = useState("");
  const [selected, setSelected] = useState([]);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [remaining, setRemaining] = useState(Number(quiz.timer_seconds || 0));
  const [submitted, setSubmitted] = useState(false);
  const options = quiz.quiz_type === "true_false" ? ["True", "False"] : (quiz.options || []);
  const isMultiple = quiz.quiz_type === "multiple_correct";
  const hasTimer = Number(quiz.timer_seconds || 0) > 0;

  useEffect(() => {
    setAnswer("");
    setSelected([]);
    setSubmitted(false);
    setRemaining(Number(quiz.timer_seconds || 0));
    setStartedAt(Date.now());
  }, [quiz.id]);

  useEffect(() => {
    if (!hasTimer || submitted) return;
    const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [hasTimer, submitted, quiz.id]);

  function toggleOption(option) {
    if (!isMultiple) {
      setAnswer(option);
      return;
    }
    setSelected((items) => items.includes(option) ? items.filter((item) => item !== option) : [...items, option]);
  }

  function submit(event) {
    event.preventDefault();
    setSubmitted(true);
    const finalAnswer = isMultiple ? selected.join(", ") : answer;
    const timeUsed = Math.round((Date.now() - startedAt) / 1000);
    const heartsLeft = Math.max(0, Number(quiz.hearts || 0) - (finalAnswer ? 0 : 1));
    onSubmit(quiz, finalAnswer, selected, timeUsed, heartsLeft);
  }

  return (
    <article className={featured ? "quiz-card featured" : "quiz-card"}>
      <div className="quiz-card-top">
        <span className="quiz-badge">{quiz.subject}</span>
        <span>{quiz.difficulty} · Level {quiz.level}</span>
      </div>
      <h3>{quiz.title}</h3>
      {quiz.instructions ? <p>{quiz.instructions}</p> : null}
      {quiz.story_text ? <blockquote>{quiz.story_text}</blockquote> : null}
      {quiz.emoji_prompt ? <div className="emoji-prompt" aria-label="Emoji quiz prompt">{quiz.emoji_prompt}</div> : null}
      {quiz.image_url ? <img className="quiz-media" src={quiz.image_url} alt={`${quiz.title} quiz picture`} /> : null}
      {quiz.audio_url ? <audio className="quiz-audio" controls src={quiz.audio_url} aria-label={`${quiz.title} quiz audio`} /> : null}
      <strong className="quiz-question">{quiz.question_text}</strong>
      <div className="quiz-status-row">
        {hasTimer ? <span className={remaining <= 10 ? "timer warning" : "timer"}>{remaining}s</span> : <span>No timer</span>}
        {quiz.hearts ? <span>{"❤️".repeat(Math.min(5, Number(quiz.hearts)))}</span> : null}
        <span><CoinIcon />{quiz.coin_reward} · XP {quiz.xp_reward}</span>
      </div>
      <Progress value={hasTimer ? Math.round((remaining / Math.max(1, Number(quiz.timer_seconds))) * 100) : 100} />
      <form onSubmit={submit}>
        <div className="quiz-options" role={isMultiple ? "group" : "radiogroup"} aria-label="Quiz answer options">
          {options.map((option) => (
            <button
              type="button"
              className={(isMultiple ? selected.includes(option) : answer === option) ? "selected" : ""}
              key={option}
              onClick={() => toggleOption(option)}
              aria-pressed={isMultiple ? selected.includes(option) : answer === option}
            >
              {isMultiple ? (selected.includes(option) ? "✓ " : "") : ""}{option}
            </button>
          ))}
        </div>
        {options.length === 0 && (
          <input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Type your answer" aria-label="Quiz answer" />
        )}
        <button disabled={submitted || (hasTimer && remaining <= 0) || (!answer && selected.length === 0)}>
          {submitted ? "Saved" : quiz.quiz_type === "reward_box" ? "Open reward answer" : "Submit answer"}
        </button>
      </form>
      {quiz.last_score !== null && quiz.last_score !== undefined ? (
        <p className="quiz-last-result">Last score: {quiz.last_score} · {quiz.last_passed ? "Passed" : "Try again"}</p>
      ) : null}
    </article>
  );
}

const journeyOrder = [
  { match: ["waking up on time"], title: "Waking up on time" },
  { prayer: "Fajr", title: "Prayer Fajr" },
  { match: ["reading"], title: "Reading" },
  { match: ["writing"], title: "Writing" },
  { match: ["mathematics"], title: "Mathematics" },
  { prayer: "Dhuhr", title: "Prayer Dhuhr" },
  { match: ["helping mother"], title: "Helping mother" },
  { match: ["sport activity"], title: "Sport activity" },
  { match: ["teamwork activity"], title: "Teamwork activity" },
  { prayer: "Asr", title: "Prayer Asr" },
  { match: ["quran learning"], title: "Quran learning" },
  { match: ["clean bedroom"], title: "Clean bedroom" },
  { match: ["self-organization", "self-organisation"], title: "Self-organization" },
  { prayer: "Maghrib", title: "Praying Maghrib" },
  { prayer: "Isha", title: "Praying Isha" },
  { match: ["sleeping on time"], title: "Sleeping on time" }
];

function buildJourneyEntries(activities = []) {
  const used = new Set();
  const prayerActivity = activities.find((activity) => activity.is_prayer || String(activity.title || "").toLowerCase().includes("five daily prayers"));
  const entries = [];

  journeyOrder.forEach((item) => {
    if (item.prayer && prayerActivity) {
      entries.push({
        key: `prayer-${item.prayer}`,
        type: "prayer",
        title: item.title,
        prayer: item.prayer,
        activity: prayerActivity
      });
      return;
    }

    if (!item.match) return;
    const activity = activities.find((candidate) => {
      if (used.has(candidate.id) || candidate.is_prayer) return false;
      const title = String(candidate.title || "").toLowerCase();
      return item.match.some((match) => title.includes(match));
    });
    if (!activity) return;
    used.add(activity.id);
    entries.push({ key: `activity-${activity.id}`, type: "activity", title: item.title, activity });
  });

  activities
    .filter((activity) => !used.has(activity.id) && !activity.is_prayer)
    .forEach((activity) => entries.push({ key: `activity-${activity.id}`, type: "activity", title: activity.title, activity }));

  return entries;
}

function journeyEntryComplete(entry) {
  if (entry.type === "prayer") return Boolean(entry.activity?.prayer_state?.[entry.prayer]);
  return ["completed", "approved"].includes(entry.activity?.status);
}

function prayerWindowInfo(activity, prayer) {
  return activity?.prayer_window_status?.[prayer] || { allowed: true, message: "Open today" };
}

function ActivityJourney({ activities, onFocus }) {
  const entries = buildJourneyEntries(activities);
  const currentKey = entries.find((entry) => !journeyEntryComplete(entry))?.key;
  const incompleteEntries = entries.filter((entry) => !journeyEntryComplete(entry));
  const completedEntries = entries.filter(journeyEntryComplete);

  return (
    <div className="task-lists">
      <div className="journey-list">
        {incompleteEntries.map((entry) => (
          <TaskPreviewCard
            entry={entry}
            current={entry.key === currentKey}
            key={entry.key}
            onStart={() => onFocus(entry)}
          />
        ))}
      </div>
      {completedEntries.length > 0 && (
        <details className="completed-tasks">
          <summary>
            <span>Completed Today</span>
            <strong>{completedEntries.length}</strong>
          </summary>
          <div className="journey-list">
            {completedEntries.map((entry) => (
              <TaskPreviewCard entry={entry} complete key={entry.key} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function TaskPreviewCard({ entry, current = false, complete = false, onStart }) {
  const points = entry.type === "prayer"
    ? Number(entry.activity?.prayer_points || 10)
    : Number(entry.activity?.points || 0);
  const displayActivity = entry.type === "prayer"
    ? { ...entry.activity, title: entry.title, is_prayer: 1 }
    : entry.activity;

  return (
    <article className={`task-preview ${current ? "current" : ""} ${complete ? "complete" : ""}`}>
      <ActivityMotionIcon activity={displayActivity} />
      <div className="task-preview-copy">
        <small>{current ? "Up next" : complete ? "Finished" : "Ready"}</small>
        <h3>{entry.title}</h3>
        <span><CoinIcon /> {points} Hasanat</span>
      </div>
      {complete ? (
        <span className="task-done" aria-label="Completed">✓</span>
      ) : (
        <button type="button" onClick={onStart} aria-label={`Start ${entry.title}`}>Start</button>
      )}
    </article>
  );
}

function FocusTaskOverlay({ entry, timerScope, onComplete, onClose }) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    document.body.classList.add("focus-mode-open");
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("focus-mode-open");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div className="focus-task-overlay" role="dialog" aria-modal="true" aria-label={`${entry.title} focus mode`}>
      <div className="focus-task-shell">
        <header>
          <div>
            <p className="eyebrow">Focus Mode</p>
            <h2>One task at a time</h2>
          </div>
          <button className="focus-close ghost" type="button" onClick={onClose} aria-label="Close focus mode">Close</button>
        </header>
        <div className="focus-task-content">
          {entry.type === "prayer" ? (
            <PrayerStepCard entry={entry} onComplete={onComplete} />
          ) : (
            <ActivityCard activity={entry.activity} timerScope={timerScope} onComplete={onComplete} />
          )}
        </div>
      </div>
    </div>
  );
}

function PrayerStepCard({ entry, onComplete }) {
  const prayerIcons = { Fajr: "🌅", Dhuhr: "☀️", Asr: "🌤️", Maghrib: "🌇", Isha: "🌙" };
  const done = journeyEntryComplete(entry);
  const prayerActivity = { ...entry.activity, title: entry.title, is_prayer: 1 };
  const points = Number(entry.activity?.prayer_points || 10);
  const windowInfo = prayerWindowInfo(entry.activity, entry.prayer);
  const locked = !done && !windowInfo.allowed;

  return (
    <article className={`activity prayer-step-card ${done ? "approved" : "pending"}`}>
      <ActivityMotionIcon activity={prayerActivity} />
      <div className="activity-body">
        <div className="row">
          <h3>{prayerIcons[entry.prayer]} {entry.title}</h3>
          <span className="points-pill"><CoinIcon />{points} Hasanat</span>
        </div>
        <p>{windowInfo.message || `Mark ${entry.prayer} when it is completed.`}</p>
        <span className={`status-chip ${done ? "approved" : "pending"}`}>{done ? "completed" : "pending"}</span>
        <label className={locked ? "prayer-step-toggle locked-time" : "prayer-step-toggle"}>
          <input
            type="checkbox"
            checked={done}
            disabled={locked}
            onChange={(event) => onComplete(prayerActivity, { prayer: entry.prayer, checked: event.target.checked })}
            aria-label={`Mark ${entry.prayer} prayer complete`}
          />
          <span>{done ? "Completed" : locked ? "Not available now" : `Mark ${entry.prayer} complete`}</span>
        </label>
      </div>
    </article>
  );
}

function RewardProgress({ reward, points }) {
  const cost = Number(reward.discounted_points || reward.required_points || 1);
  const current = Math.min(Number(points || 0), cost);
  const remaining = Math.max(0, cost - Number(points || 0));
  const percent = Math.min(100, Math.round((current / Math.max(1, cost)) * 100));
  return (
    <div className="reward-progress" aria-label={`${reward.title} reward progress`}>
      <Progress value={percent} />
      <small>{reward.status === "available" ? "Unlocked" : `Almost there. ${remaining} more Hasanat needed.`}</small>
      <span>{current} / {cost} Hasanat</span>
    </div>
  );
}

function progressMessage(completed, total) {
  const remaining = Math.max(0, total - completed);
  if (remaining === 0) return "All missions complete!";
  if (remaining === 1) return "Only 1 task left!";
  if (completed === 0) return "Great start!";
  if (completed >= Math.ceil(total / 2)) return "Halfway there!";
  return "Great start!";
}

function buildNudges(data, nextActivity, nextReward) {
  const nudges = [];
  const completed = Number(data.summary?.completed_today || 0);
  const total = Math.max(1, Number(data.summary?.daily_target || 1));
  if (total - completed === 1) nudges.push("One more task to finish today.");
  if (nextReward && nextReward.status !== "available") {
    const cost = Number(nextReward.discounted_points || nextReward.required_points || 0);
    const remaining = cost - Number(data.points.total || 0);
    if (remaining > 0 && remaining <= 25) nudges.push(`Only ${remaining} Hasanat needed for ${nextReward.title}.`);
  }
  if (Number(data.streak || 0) > 0 && nextActivity) nudges.push("Keep your streak alive today.");
  const evening = new Date().getHours() >= 17;
  if (evening && completed === 0) nudges.push("Let’s complete one small task today.");
  return nudges.slice(0, 3);
}

function WeeklyThemeCard({ theme }) {
  if (!theme) return null;
  const percent = Math.min(100, Math.round((Number(theme.progress || 0) / Math.max(1, Number(theme.goal || 1))) * 100));
  return (
    <section className={theme.complete ? "weekly-theme complete" : "weekly-theme"}>
      <div className="theme-icon">{theme.icon}</div>
      <div>
        <p className="eyebrow">Weekly Theme</p>
        <h2>{theme.title}</h2>
        <p>{theme.message}</p>
        <Progress value={percent} />
        <strong>{theme.progress}/{theme.goal} goal · {theme.badge}</strong>
      </div>
      <span>{theme.complete ? "Unlocked" : "Locked"}</span>
    </section>
  );
}

function EarlyBirdCard({ earlyBird, onCheckIn }) {
  const checked = earlyBird?.checked_in;
  const leaders = earlyBird?.rows || [];
  return (
    <section className={checked?.status === "early" ? "early-bird-card early" : "early-bird-card"} aria-label="Early Bird check in">
      <div className="early-bird-main">
        <div className="early-bird-icon" aria-hidden="true">🌅</div>
        <div>
          <p className="eyebrow">Early Bird</p>
          <h2>Wake up before {earlyBird?.cutoff || "07:00"}</h2>
          <p>{checked ? checked.status === "early" ? `You checked in at ${checked.checkin_time} and earned ${checked.awarded_points} Hasanat.` : `You checked in at ${checked.checkin_time}. Tomorrow is a new chance.` : `Press before ${earlyBird?.cutoff || "07:00"} to earn ${earlyBird?.bonus_points || 20} Hasanat.`}</p>
        </div>
        <button disabled={Boolean(checked)} onClick={onCheckIn}>{checked ? "Checked today" : "I am awake"}</button>
      </div>
      <div className="early-bird-board">
        <strong>Who got up first?</strong>
        {leaders.length === 0 ? <p className="muted">No check-ins yet today.</p> : leaders.map((child) => (
          <div className={child.status === "early" ? "early-row early" : "early-row late"} key={child.id}>
            <span>#{child.rank}</span>
            <span>{avatarFor(child.avatar)}</span>
            <strong>{child.name}</strong>
            <small>{child.checkin_time} · {child.status === "early" ? `+${child.awarded_points} Hasanat` : "late"}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuranMemorizationPanel({ quran, filter, sort, onFilter, onSort, onMemorize, onRevise, onFavorite }) {
  if (!quran) return null;
  const surahs = [...(quran.surahs || [])]
    .filter((surah) => filter === "all" || surah.revelation_place === filter)
    .sort((a, b) => {
      if (sort === "number") return a.id - b.id;
      if (sort === "shortest") return a.total_verses - b.total_verses || a.id - b.id;
      if (sort === "progress") return b.progress_percentage - a.progress_percentage || a.total_verses - b.total_verses;
      if (sort === "place") return a.revelation_place.localeCompare(b.revelation_place) || a.id - b.id;
      if (sort === "length") return b.total_verses - a.total_verses || a.id - b.id;
      return Number(b.is_juz_amma) - Number(a.is_juz_amma) || a.total_verses - b.total_verses || a.id - b.id;
    });
  const next = quran.next_surah;
  const revisionTasks = quran.revision_tasks || [];
  const favoriteSurahs = quran.favorite_surahs || [];

  return (
    <section className="quran-panel" aria-label="Quran memorization activity system">
      <div className="quran-hero">
        <div>
          <p className="eyebrow">Quran Memorization</p>
          <h2>Continue memorizing {next?.surah_name || "Quran"}</h2>
          <p>Earn 1 Hasanat for every verse, 20 bonus Hasanat for a Surah, and 100 bonus Hasanat for a Juz.</p>
        </div>
        <button
          onClick={() => next && onMemorize(next, Math.min(next.total_verses, next.memorized_verses + 1))}
          disabled={!next || next.status === "Completed"}
        >
          Continue memorizing
        </button>
      </div>

      <div className="quran-stats">
        <Stat label="Quran XP" value={quran.xp} icon={<CoinIcon />} />
        <Stat label="Quran level" value={quran.level} icon="📖" />
        <Stat label="Daily streak" value={`${quran.streak} ${quran.streak === 1 ? "day" : "days"}`} icon="🔥" pulse={quran.streak > 0} />
        <Stat label="Completed Surahs" value={quran.completed_surahs} icon="🏁" />
      </div>

      <div className="favorite-surahs">
        <div>
          <p className="eyebrow">Favorite Surahs</p>
          <h3>{favoriteSurahs.length ? "Saved for quick practice" : "Tap a star to add favorites"}</h3>
        </div>
        {favoriteSurahs.length ? (
          <div className="favorite-surah-list">
            {favoriteSurahs.slice(0, 8).map((surah) => (
              <button key={surah.id} onClick={() => onMemorize(surah, Math.min(surah.total_verses, surah.memorized_verses + 1))} disabled={surah.status === "Completed"}>
                ⭐ {surah.id}. {surah.surah_name}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">Favorite Surahs will appear here on the dashboard.</p>
        )}
      </div>

      {revisionTasks.length > 0 && (
        <div className="revision-tasks">
          <div>
            <p className="eyebrow">Revision tasks</p>
            <h3>Consolidate completed Surahs</h3>
          </div>
          <div className="revision-list">
            {revisionTasks.slice(0, 6).map((surah) => (
              <button
                className={surah.revised_today ? "revised" : ""}
                disabled={surah.revised_today}
                key={surah.id}
                onClick={() => onRevise(surah)}
              >
                {surah.revised_today ? "✓ " : "↻ "}{surah.surah_name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="quran-rewards">
        {(quran.rewards || []).map((reward) => (
          <span className={reward.unlocked ? "unlocked" : ""} key={reward.title}>
            {reward.unlocked ? "🔓" : "🔒"} {reward.title} · {reward.points} Hasanat
          </span>
        ))}
      </div>

      <div className="quran-controls">
        <div className="segmented-control" aria-label="Quran revelation filter">
          <button className={filter === "all" ? "active" : ""} onClick={() => onFilter("all")}>All</button>
          <button className={filter === "Makkah" ? "active" : ""} onClick={() => onFilter("Makkah")}>Makki</button>
          <button className={filter === "Madinah" ? "active" : ""} onClick={() => onFilter("Madinah")}>Madani</button>
        </div>
        <label>
          Sort
          <select value={sort} onChange={(event) => onSort(event.target.value)}>
            <option value="number">Surah number</option>
            <option value="juz-amma">Juz Amma first</option>
            <option value="shortest">Shortest first</option>
            <option value="progress">Progress</option>
            <option value="place">Revelation place</option>
            <option value="length">Longest first</option>
          </select>
        </label>
      </div>

      <div className="surah-grid">
        {surahs.map((surah) => (
          <article className={`surah-card ${surah.status.replaceAll(" ", "-").toLowerCase()} ${surah.is_juz_amma ? "juz-amma" : ""}`} key={surah.id}>
            <div className="surah-head">
              <span>{surah.id}</span>
              <div>
                <h3>{surah.surah_name}</h3>
                <small>{surah.revelation_place} · {surah.total_verses} verses · {surah.total_verses} Hasanat {surah.is_juz_amma ? "· Juz Amma" : ""}</small>
              </div>
              <button
                className={surah.favorite ? "favorite-button active" : "favorite-button"}
                onClick={() => onFavorite(surah)}
                title={surah.favorite ? "Remove from favorites" : "Add to favorites"}
                aria-label={surah.favorite ? `Remove ${surah.surah_name} from favorites` : `Add ${surah.surah_name} to favorites`}
              >
                {surah.favorite ? "★" : "☆"}
              </button>
            </div>
            <Progress value={surah.progress_percentage} />
            <div className="surah-meta">
              <span>{surah.memorized_verses}/{surah.total_verses}</span>
              <span><CoinIcon /> {surah.reward_points} earned</span>
              <span>{surah.progress_percentage}%</span>
              <span>{surah.status}</span>
            </div>
            {surah.status === "Completed" ? (
              <button className={surah.revised_today ? "ghost" : ""} onClick={() => onRevise(surah)} disabled={surah.revised_today}>
                {surah.revised_today ? "Revised today" : "Revise today"}
              </button>
            ) : (
              <button onClick={() => onMemorize(surah, Math.min(surah.total_verses, surah.memorized_verses + 1))}>
                Memorized 1 verse
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function HifzTracker({ hifz, onUpdate }) {
  const todayPage = hifz.today;
  const [notes, setNotes] = useState(todayPage?.notes || "");

  useEffect(() => {
    setNotes(todayPage?.notes || "");
  }, [todayPage?.id, todayPage?.notes]);

  if (!todayPage) return null;

  const juzPercent = Math.round((Number(hifz.current_juz_completed || 0) / Math.max(1, Number(hifz.current_juz_total || 20))) * 100);

  return (
    <section className="hifz-card" aria-label="Qur’an Hifz Tracker">
      <div className="hifz-hero">
        <div>
          <p className="eyebrow">Qur’an Hifz Journey</p>
          <h2>10 Juz Surah-Based Tracker</h2>
          <p><strong>Juz {todayPage.juz_number}</strong> · Surah {todayPage.surah_number || "-"} · {todayPage.surah_name_english || todayPage.surah_name || "Select Surah"}</p>
          {todayPage.surah_name_arabic ? <p>{todayPage.surah_name_arabic}</p> : null}
          <p>{todayPage.day_name}, {todayPage.plan_date} · Plan page {todayPage.page_number} · Page {todayPage.page_in_juz}/20 in this Juz</p>
          <p>{todayPage.ayah_range || "Ayah range can be adjusted by parent."}</p>
        </div>
        <div className="hifz-page-badge">
          <span>Page</span>
          <strong>{todayPage.page_number}</strong>
        </div>
      </div>

      <div className="hifz-actions">
        <label className={todayPage.memorized ? "checked" : ""}>
          <input
            type="checkbox"
            checked={Boolean(todayPage.memorized)}
            onChange={(event) => onUpdate(todayPage, { memorized: event.target.checked })}
          />
          I memorized this page
        </label>
        <label className={todayPage.revised ? "checked" : ""}>
          <input
            type="checkbox"
            checked={Boolean(todayPage.revised)}
            onChange={(event) => onUpdate(todayPage, { revised: event.target.checked })}
          />
          I reviewed yesterday’s page
        </label>
        {hifz.weekly_review_due && (
          <label className={todayPage.weekly_review_done ? "checked" : ""}>
            <input
              type="checkbox"
              checked={Boolean(todayPage.weekly_review_done)}
              onChange={(event) => onUpdate(todayPage, { weeklyReviewDone: event.target.checked })}
            />
            Weekly review completed
          </label>
        )}
        {hifz.juz_review_due && (
          <label className={todayPage.juz_review_done ? "checked" : ""}>
            <input
              type="checkbox"
              checked={Boolean(todayPage.juz_review_done)}
              onChange={(event) => onUpdate(todayPage, { juzReviewDone: event.target.checked })}
            />
            Full Juz review completed
          </label>
        )}
      </div>

      <div className="hifz-task-text">
        <p><strong>Memorization:</strong> {todayPage.memorization_task}</p>
        <p><strong>Revision:</strong> {todayPage.revision_task}</p>
        <p><strong>Hasanat earned today:</strong> {todayPage.points_earned || 0}</p>
        {todayPage.parent_reviewed ? <p><strong>Parent reviewed:</strong> Yes</p> : null}
        {todayPage.parent_notes ? <p><strong>Parent note:</strong> {todayPage.parent_notes}</p> : null}
      </div>

      <label className="hifz-notes">
        Notes for difficult ayat or mistakes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Write a short note..." />
        <button className="ghost" onClick={() => onUpdate(todayPage, { notes })}>Save notes</button>
      </label>

      <div className="hifz-progress">
        <div>
          <strong>Total progress</strong>
          <span>{hifz.total_pages_memorized}/{hifz.total_pages} pages · {hifz.completion_percentage}%</span>
        </div>
        <Progress value={hifz.completion_percentage} />
        <div>
          <strong>Current Juz {hifz.current_juz}</strong>
          <span>{hifz.current_juz_completed}/{hifz.current_juz_total} pages</span>
        </div>
        <Progress value={juzPercent} />
        <div>
          <strong>Current Surah</strong>
          <span>{hifz.current_surah_completed}/{hifz.current_surah_total} planned page{Number(hifz.current_surah_total || 0) === 1 ? "" : "s"}</span>
        </div>
        <Progress value={Math.round((Number(hifz.current_surah_completed || 0) / Math.max(1, Number(hifz.current_surah_total || 1))) * 100)} />
      </div>

      <div className="hifz-stats">
        <Stat label="Remaining" value={hifz.total_pages_remaining} icon="📄" />
        <Stat label="Surahs completed" value={hifz.completed_surahs} icon="⭐" />
        <Stat label="Juz completed" value={hifz.completed_juz?.length || 0} icon="📖" />
        <Stat label="Streak" value={`${hifz.current_streak} days`} icon="🔥" pulse={hifz.current_streak > 0} />
        <Stat label="Qur’an Hasanat" value={hifz.total_quran_points} icon={<CoinIcon />} />
        <Stat label="Finish date" value={hifz.estimated_completion_date} icon="📅" />
      </div>

      <div className="hifz-badges">
        {hifz.badges.map((badge) => (
          <span className={badge.earned ? "earned" : ""} key={badge.title}>{badge.icon} {badge.title}</span>
        ))}
      </div>

      <div className="hifz-mini-plan">
        {(hifz.recent || []).map((page) => (
          <button
            className={page.memorized ? "done" : page.id === todayPage.id ? "today" : ""}
            key={page.id}
            onClick={() => onUpdate(page, { memorized: !Boolean(page.memorized) })}
          >
            <span>Page {page.page_number}</span>
            <small>Juz {page.juz_number} · {page.surah_name_english || page.surah_name || "Select Surah"} · {page.plan_date}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function DailyCompletionOverlay({ data, avatar, reward, progress, onRewards, onClose, onReflect }) {
  const [enjoyed, setEnjoyed] = useState(data.reflection?.enjoyed_activity || "");
  const [feeling, setFeeling] = useState(data.reflection?.feeling || "");
  const enjoyedOptions = ["Quran", "Reading", "Writing", "Math", "Helping", "Sport", "Prayer", "Other"];
  const feelingOptions = ["Happy", "Proud", "Tired", "Calm", "I need help"];
  return (
    <div className="daily-complete-overlay" role="dialog" aria-modal="true" aria-label="Daily completion celebration">
      <div className="daily-complete-card">
        <div className="overlay-confetti" aria-hidden="true">{[0,1,2,3,4,5,6,7,8,9].map((item) => <span key={item} style={{ "--i": item }} />)}</div>
        <div className="complete-avatar" aria-hidden="true">{avatar}</div>
        <p className="eyebrow">Daily complete</p>
        <h2>Amazing! You completed all your missions today!</h2>
        <div className="complete-stats">
          <span><strong>{data.points.daily}</strong> Hasanat today</span>
          <span><strong>{data.streak}</strong> day streak</span>
          <span><strong>{progress}%</strong> reward progress</span>
        </div>
        <div className="reflection-box">
          <h3>What did you enjoy today?</h3>
          <div className="choice-row">
            {enjoyedOptions.map((option) => <button className={enjoyed === option ? "selected" : "ghost"} key={option} onClick={() => setEnjoyed(option)}>{option}</button>)}
          </div>
          <h3>How did you feel today?</h3>
          <div className="choice-row">
            {feelingOptions.map((option) => <button className={feeling === option ? "selected" : "ghost"} key={option} onClick={() => setFeeling(option)}>{option}</button>)}
          </div>
          <button disabled={!enjoyed || !feeling} onClick={() => onReflect(enjoyed, feeling)}>Save my answer</button>
        </div>
        <div className="overlay-actions">
          <button onClick={onRewards}>See my rewards</button>
          <button className="ghost" onClick={onClose}>Back to dashboard</button>
        </div>
      </div>
    </div>
  );
}

function Mascot({ message }) {
  return (
    <div className="mascot" title={message}>
      <span>🦁</span>
      <small>{message.includes("Great") ? "Yay!" : "Go!"}</small>
    </div>
  );
}

function XPBar({ level }) {
  return (
    <div className="xp-wrap">
      <span>{level.title}</span>
      <div className="xp-bar"><span style={{ width: `${level.progress}%` }} /></div>
      <strong>{level.progress}/100 XP</strong>
    </div>
  );
}

function AdventureMap({ level, totalPoints }) {
  const steps = [
    ["Learning Village", "🏡"],
    ["Quran Garden", "🌙"],
    ["Reading Castle", "🏰"],
    ["Math Mountain", "⛰️"],
    ["Fitness Arena", "🏟️"],
    ["Reward Island", "🏝️"]
  ];
  const activeStep = Math.min(steps.length - 1, Math.floor(Number(totalPoints || 0) / 80));
  const walkerPosition = Math.min(92, Math.max(8, 8 + activeStep * 16.8));
  return (
    <section className="game-card adventure-map">
      <div className="game-card-head">
        <span>🗺️</span>
        <div>
          <p className="eyebrow">Adventure map</p>
          <h2>Level {level.level}: {level.title}</h2>
        </div>
      </div>
      <div className="map-path">
        <div className="map-walker" style={{ "--walker-left": `${walkerPosition}%` }}>{level.level >= 5 ? "🦸" : "🚶"}</div>
        {steps.map(([step, icon], index) => (
          <div className={index <= activeStep ? "map-step reached" : "map-step"} key={step}>
            <span>{index < activeStep ? "✓" : index === activeStep ? icon : "•"}</span>
            <small>{step}</small>
          </div>
        ))}
      </div>
      <Progress value={level.progress} />
    </section>
  );
}

function MissionBoard({ missions = [] }) {
  return (
    <section className="game-card mission-board">
      <div className="game-card-head">
        <span>🎯</span>
        <div>
          <p className="eyebrow">Daily missions</p>
          <h2>{missions.filter((mission) => mission.complete).length}/{missions.length} complete</h2>
        </div>
      </div>
      <div className="mission-list">
        {missions.map((mission) => (
          <article className={mission.complete ? "mission complete" : "mission"} key={mission.id}>
            <span>{mission.icon}</span>
            <div>
              <strong>{mission.title}</strong>
              <Progress value={Math.round((mission.progress / Math.max(1, mission.target)) * 100)} />
              <small>{mission.progress}/{mission.target}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PersonalBest({ best }) {
  best = best || { today_completed: 0, best_completed: 0, remaining_to_best: 0 };
  const target = Math.max(1, Number(best.best_completed || 1) + 1);
  return (
    <section className="game-card personal-best">
      <div className="game-card-head">
        <span>📈</span>
        <div>
          <p className="eyebrow">Personal best</p>
          <h2>{best.today_completed}/{target} today</h2>
        </div>
      </div>
      <Progress value={Math.min(100, Math.round((best.today_completed / target) * 100))} />
      <p>{best.remaining_to_best === 0 ? "New personal best is close or reached!" : `${best.remaining_to_best} more to beat your best day.`}</p>
    </section>
  );
}

function ParentChallengeBoard({ challenges = [] }) {
  return (
    <section className="leaderboard challenge-board">
      <h2 className="section-title">⭐ Parent Challenges</h2>
      {challenges.length === 0 ? <p className="muted">No parent challenges today.</p> : challenges.map((challenge) => (
        <article className={challenge.complete ? "challenge-card complete" : "challenge-card"} key={challenge.id}>
          <strong>{challenge.title}</strong>
          <p>{challenge.description}</p>
          <Progress value={Math.min(100, Math.round((challenge.progress / Math.max(1, challenge.target_count)) * 100))} />
          <small>{challenge.progress}/{challenge.target_count} · bonus {challenge.bonus_points} Hasanat</small>
        </article>
      ))}
    </section>
  );
}

function AchievementsPanel({ achievements, badges, futureBadges }) {
  achievements = achievements || {};
  return (
    <section className="leaderboard achievements-panel">
      <h2 className="section-title">🏆 Achievements</h2>
      <div className="achievement-stats">
        <span>Badges: {achievements.earned_badges || 0}</span>
        <span>Locked: {achievements.locked_badges || futureBadges?.length || 0}</span>
        <span>Rewards: {achievements.total_rewards_redeemed || 0}</span>
      </div>
      <div className="badge-grid future-badges">
        {(futureBadges || []).slice(0, 4).map((badge) => (
          <article className="badge-card locked-badge" key={badge.title}>
            <span>{badge.icon}</span>
            <strong>{badge.title}</strong>
            <small>{badge.requirement}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function FamilyQuest({ quest }) {
  quest = quest || { completed: 0, target: 3, members: [], complete: false, bonus: 20 };
  const percent = Math.min(100, Math.round((Number(quest.completed || 0) / Math.max(1, Number(quest.target || 1))) * 100));
  return (
    <section className={quest.complete ? "game-card family-quest complete" : "game-card family-quest"}>
      <div className="game-card-head">
        <span>🤝</span>
        <div>
          <p className="eyebrow">Family quest</p>
          <h2>{quest.completed}/{quest.target} activities together</h2>
        </div>
      </div>
      <Progress value={percent} />
      <div className="family-members">
        {quest.members.map((member) => (
          <span key={member.id}>{avatarFor(member.avatar)} {member.name}: {member.completed_today}</span>
        ))}
      </div>
      <p>{quest.complete ? `Quest complete. Everyone gets ${quest.bonus} bonus points today.` : "Everyone can help finish today’s family goal."}</p>
    </section>
  );
}

function Confetti() {
  const pieces = ["#facc15", "#38bdf8", "#fb7185", "#34d399", "#a78bfa", "#f97316", "#22c55e", "#60a5fa"];
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.flatMap((color, group) => (
        [0, 1, 2].map((item) => (
          <span
            key={`${group}-${item}`}
            style={{
              "--color": color,
              "--left": `${8 + group * 12 + item * 3}%`,
              "--delay": `${(group + item) * 0.05}s`,
              "--spin": `${group % 2 === 0 ? 1 : -1}`
            }}
          />
        ))
      ))}
    </div>
  );
}

function ActivityCard({ activity, timerScope, onComplete }) {
  const prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  const prayerIcons = { Fajr: "🌅", Dhuhr: "☀️", Asr: "🌤️", Maghrib: "🌇", Isha: "🌙" };
  const isDone = activity.status === "approved" || activity.status === "completed";
  const durationSeconds = Number(activity.duration_minutes || 0) * 60;
  const timerKey = `activity-timer-${timerScope || "today"}-${activity.id}`;
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [timerEndAt, setTimerEndAt] = useState(null);
  const [buttonBounce, setButtonBounce] = useState(false);
  const [proof, setProof] = useState("");
  const [interactiveAnswer, setInteractiveAnswer] = useState("");
  const [demoOpen, setDemoOpen] = useState(false);
  const taskType = activity.task_type || "standard";
  const taskData = activity.task_data || {};
  const isSports = activity.subject === "Sports & Physical Development";
  const hasInteractiveTask = taskType && taskType !== "standard";
  const timerRequired = durationSeconds > 0 && !activity.is_prayer;
  const timerProgress = timerRequired ? Math.max(0, Math.min(100, Math.round(((durationSeconds - secondsLeft) / durationSeconds) * 100))) : 0;

  function saveTimer(next) {
    try {
      localStorage.setItem(timerKey, JSON.stringify({ durationSeconds, updatedAt: Date.now(), ...next }));
    } catch {}
  }

  function clearSavedTimer() {
    try {
      localStorage.removeItem(timerKey);
    } catch {}
  }

  useEffect(() => {
    if (!timerRequired || isDone) {
      clearSavedTimer();
      setSecondsLeft(durationSeconds);
      setTimerRunning(false);
      setTimerStarted(false);
      setNeedsConfirmation(false);
      setTimerEndAt(null);
      return;
    }

    try {
      const saved = JSON.parse(localStorage.getItem(timerKey) || "null");
      if (!saved || Number(saved.durationSeconds) !== durationSeconds) throw new Error("No saved timer");

      if (saved.status === "running" && saved.endAt) {
        const remaining = Math.max(0, Math.ceil((Number(saved.endAt) - Date.now()) / 1000));
        setSecondsLeft(remaining);
        setTimerStarted(true);
        setTimerRunning(remaining > 0);
        setNeedsConfirmation(remaining === 0);
        setTimerEndAt(Number(saved.endAt));
        if (remaining === 0) saveTimer({ status: "confirm", secondsLeft: 0, endAt: Number(saved.endAt) });
        return;
      }

      if (saved.status === "paused") {
        const remaining = Math.max(0, Number(saved.secondsLeft || durationSeconds));
        setSecondsLeft(remaining);
        setTimerStarted(true);
        setTimerRunning(false);
        setNeedsConfirmation(remaining === 0);
        setTimerEndAt(null);
        return;
      }

      if (saved.status === "confirm") {
        setSecondsLeft(0);
        setTimerStarted(true);
        setTimerRunning(false);
        setNeedsConfirmation(true);
        setTimerEndAt(null);
        return;
      }
    } catch {}

    setSecondsLeft(durationSeconds);
    setTimerRunning(false);
    setTimerStarted(false);
    setNeedsConfirmation(false);
    setTimerEndAt(null);
  }, [durationSeconds, activity.id, timerKey, timerRequired, isDone]);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil(((timerEndAt || Date.now()) - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        setTimerRunning(false);
        setNeedsConfirmation(true);
        setTimerEndAt(null);
        saveTimer({ status: "confirm", secondsLeft: 0, endAt: timerEndAt });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning, timerEndAt]);

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function beginCompletion() {
    setButtonBounce(true);
    setTimeout(() => setButtonBounce(false), 520);
    if (!timerRequired) {
      onComplete(activity, { proof, interactiveAnswer, interactiveScore: hasInteractiveTask && interactiveAnswer ? 1 : 0 });
      return;
    }
    setTimerStarted(true);
    setTimerRunning(true);
    setNeedsConfirmation(false);
    setSecondsLeft(durationSeconds);
    const endAt = Date.now() + durationSeconds * 1000;
    setTimerEndAt(endAt);
    saveTimer({ status: "running", secondsLeft: durationSeconds, endAt });
  }

  function toggleTimer() {
    if (timerRunning) {
      setTimerRunning(false);
      setTimerEndAt(null);
      saveTimer({ status: "paused", secondsLeft });
      return;
    }
    const endAt = Date.now() + secondsLeft * 1000;
    setTimerEndAt(endAt);
    setTimerRunning(true);
    saveTimer({ status: "running", secondsLeft, endAt });
  }

  function confirmDone() {
    setButtonBounce(true);
    setTimeout(() => setButtonBounce(false), 520);
    setNeedsConfirmation(false);
    clearSavedTimer();
    onComplete(activity, { proof, interactiveAnswer, interactiveScore: hasInteractiveTask && interactiveAnswer ? 1 : 0 });
  }

  function readProof(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setProof(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function narrateTask() {
    try {
      window.speechSynthesis.cancel();
      const text = `${activity.title}. ${activity.description}`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch {}
  }

  function confirmNotDone() {
    setNeedsConfirmation(false);
    setTimerStarted(false);
    setTimerRunning(false);
    setSecondsLeft(durationSeconds);
    setTimerEndAt(null);
    clearSavedTimer();
  }

  return (
    <article className={`activity ${activity.status} subject-${classSlug(activity.subject)} ${activity.is_daily_challenge ? "daily-pick" : ""}`}>
      <ActivityMotionIcon activity={activity} />
      {demoOpen ? <ExerciseDemoModal activity={activity} onClose={() => setDemoOpen(false)} /> : null}
      <div className="activity-body">
        <div className="row">
          <h3>{activity.title} {activity.is_daily_challenge ? <span className="daily-badge">Activity of the day</span> : null}</h3>
          <span className="points-pill"><CoinIcon />{activity.points} Hasanat</span>
        </div>
        <p>{activity.description}</p>
        <button className="narrate-button ghost" type="button" onClick={narrateTask} aria-label={`Read ${activity.title} instructions aloud`}>Read task</button>
        {isSports ? <button className="narrate-button ghost" type="button" onClick={() => setDemoOpen(true)}>Watch Demo</button> : null}
        {activity.subject ? <small className="subject-chip">{activity.subject} · {taskType === "standard" ? "Daily activity" : taskType.replaceAll("_", " ")}</small> : null}
        <span className={`status-chip ${activity.status}`}>{activity.status}</span>
        {activity.proof_required ? (
          <label className="proof-upload">
            📷 Proof photo
            <input type="file" accept="image/*" onChange={(event) => readProof(event.target.files?.[0])} />
            {proof ? <span>Photo ready</span> : <small>Choose a photo before completing.</small>}
          </label>
        ) : null}
        {timerRequired && timerStarted && (
          <div className={secondsLeft === 0 ? "activity-timer done" : "activity-timer"} style={{ "--timer-progress": `${timerProgress}%` }}>
            <div>
              <span>{needsConfirmation ? "✅ Are you done?" : "⏱️ Timer"}</span>
              <strong>{formatTime(secondsLeft)}</strong>
            </div>
            {needsConfirmation ? (
              <>
                <button disabled={isDone || (activity.proof_required && !proof)} onClick={confirmDone}>Yes, done</button>
                <button className="ghost" disabled={isDone} onClick={confirmNotDone}>No, not yet</button>
              </>
            ) : (
              <>
                <button disabled={isDone || secondsLeft === 0} onClick={toggleTimer}>
                  {timerRunning ? "Pause" : "Resume"}
                </button>
                <button className="ghost" disabled={isDone} onClick={confirmNotDone}>Cancel</button>
              </>
            )}
            <div className="timer-track"><span /></div>
          </div>
        )}
        {activity.is_prayer ? (
          <div className="prayers">
            {prayers.map((prayer) => {
              const windowInfo = prayerWindowInfo(activity, prayer);
              const checked = Boolean(activity.prayer_state?.[prayer]);
              const locked = !checked && !windowInfo.allowed;
              return (
              <label className={locked ? "locked-time" : ""} key={prayer} title={windowInfo.message}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={(event) => onComplete(activity, { prayer, checked: event.target.checked })}
                />
                <span>{prayerIcons[prayer]} {prayer} · {activity.prayer_points || 10} Hasanat</span>
                {windowInfo.window ? <small>{windowInfo.window.start}-{windowInfo.window.end}</small> : null}
              </label>
              );
            })}
          </div>
        ) : (
          <>
          <InteractiveTask type={taskType} data={taskData} value={interactiveAnswer} onChange={setInteractiveAnswer} disabled={isDone} />
          <button className={buttonBounce ? "complete-button tap-bounce" : "complete-button"} disabled={isDone || timerRunning || needsConfirmation || (activity.proof_required && !proof) || (hasInteractiveTask && !interactiveAnswer)} onClick={beginCompletion}>
            {isDone ? activity.status : activity.proof_required && !proof ? "Add proof first" : timerRequired ? "Complete activity" : "Mark complete"}
          </button>
          </>
        )}
      </div>
    </article>
  );
}

function InteractiveTask({ type, data = {}, value, onChange, disabled }) {
  if (!type || type === "standard") return null;
  const options = Array.isArray(data.options) && data.options.length ? data.options : ["Option A", "Option B", "Option C"];
  const pairs = Array.isArray(data.pairs) && data.pairs.length ? data.pairs : [["Word", "Meaning"], ["Picture", "Name"]];
  return (
    <div className="interactive-task">
      <strong>{data.prompt || "Interactive task"}</strong>
      {type === "multiple_choice" && options.map((option) => (
        <label className="check" key={option}><input disabled={disabled} checked={value === option} type="radio" onChange={() => onChange(option)} /> {option}</label>
      ))}
      {type === "true_false" && ["True", "False"].map((option) => (
        <label className="check" key={option}><input disabled={disabled} checked={value === option} type="radio" onChange={() => onChange(option)} /> {option}</label>
      ))}
      {type === "fill_blank" && <input disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} placeholder={data.placeholder || "Type the missing word"} />}
      {type === "short_answer" && <textarea disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Write a short answer" />}
      {type === "matching" && (
        <div className="matching-task">
          {pairs.map((pair, index) => <span key={`${pair[0]}-${index}`}>{pair[0]} → {pair[1]}</span>)}
          <button type="button" disabled={disabled} className={value ? "" : "ghost"} onClick={() => onChange("matched")}>{value ? "Matched" : "I matched them"}</button>
        </div>
      )}
      {type === "picture_vocabulary" && (
        <div className="picture-vocab">
          <span>{data.image || "🖼️"}</span>
          <input disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} placeholder={data.placeholder || "What is this?"} />
        </div>
      )}
    </div>
  );
}

function ActivityMotionIcon({ activity }) {
  const title = String(activity.title || "").toLowerCase();
  let type = "default";
  if (activity.is_prayer || title.includes("five daily prayers")) type = "prayer";
  else if (title.includes("quran learning")) type = "quran";
  else if (title.includes("memorize") || title.includes("memorise")) type = "memorize";
  else if (title.includes("reading")) type = "reading";
  else if (title.includes("writing")) type = "writing";
  else if (title.includes("mathematics")) type = "math";
  else if (title.includes("helping")) type = "helping";
  else if (title.includes("sport")) type = "sport";
  else if (title.includes("sleeping")) type = "sleep";
  else if (title.includes("waking")) type = "wake";
  else if (title.includes("self-organization") || title.includes("self-organisation")) type = "organize";
  else if (title.includes("teamwork")) type = "teamwork";
  else if (title.includes("clean bedroom")) type = "bedroom";

  return (
    <div className={`activity-icon motion-icon motion-${type}`} title={activity.title}>
      {activity.is_daily_challenge ? <span className="daily-medal">🏅</span> : null}
      {type === "writing" && <><span className="paper">▤</span><span className="pencil">✏️</span><span className="line one" /><span className="line two" /></>}
      {type === "quran" && <><span className="book">📖</span><span className="page left" /><span className="page right" /></>}
      {type === "memorize" && <><span className="student">🧒</span><span className="study-book">📖</span><span className="thought">💡</span></>}
      {type === "reading" && <><span className="book b1">📘</span><span className="book b2">📗</span><span className="book b3">📙</span></>}
      {type === "math" && <><span className="math-part a">2</span><span className="math-part plus">+</span><span className="math-part b">2</span><span className="math-part eq">=</span><span className="math-part result">4</span></>}
      {type === "helping" && <><span className="house">🏠</span><span className="spark s1">✨</span><span className="spark s2">✨</span><span className="brush">🧹</span></>}
      {type === "sport" && <><span className="goal">🥅</span><span className="ball">⚽</span></>}
      {type === "sleep" && <><span className="sky" /><span className="moon">🌙</span><span className="zzz">Z</span></>}
      {type === "wake" && <><span className="horizon" /><span className="sun">☀️</span></>}
      {type === "organize" && <><span className="bag">🎒</span><span className="item book-item">📘</span><span className="item pen-item">✏️</span></>}
      {type === "teamwork" && <><span className="hand left-hand">🤝</span><span className="shake-lines">✨</span></>}
      {type === "bedroom" && <><span className="bed">🛏️</span><span className="blanket" /><span className="tidy">✨</span></>}
      {type === "prayer" && <><span className="prayer-kid">🧎</span><span className="prayer-mat" /><span className="prayer-glow">🕌</span></>}
      {type === "default" && <span>{icons[activity.title] || "✅"}</span>}
    </div>
  );
}

function Leaderboard({ children, currentChildId }) {
  return (
    <section className="leaderboard">
      <h2 className="section-title">🏆 Ranking Board</h2>
      <div className="leader-list">
        {children.map((child) => (
          <article className={child.id === currentChildId ? "leader current" : "leader"} key={child.id}>
            <strong>#{child.rank}</strong>
            <AvatarDisplay value={child.avatar} className="leader-avatar" label={`${child.name} avatar`} />
            <div>
              <h3>{child.name}</h3>
              <p>Level {child.level}</p>
            </div>
            <span className="leader-points"><CoinIcon />{child.total_points}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProgressRace({ children, currentChildId }) {
  const maxPoints = Math.max(1, ...children.map((child) => Number(child.total_points || 0)));
  return (
    <section className="leaderboard race-board">
      <h2 className="section-title">🏁 Progress Race</h2>
      <div className="race-list">
        {children.map((child) => (
          <article className={child.id === currentChildId ? "race-row current" : "race-row"} key={child.id}>
            <AvatarDisplay value={child.avatar} className="race-avatar" label={`${child.name} avatar`} />
            <div className="race-track">
              <i className={child.rank === 1 ? "race-animal winner" : "race-animal"} style={{ left: `${Math.min(92, Math.max(4, (Number(child.total_points || 0) / maxPoints) * 92))}%` }}>{avatarFor(child.avatar)}</i>
            </div>
            <strong>{child.total_points}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function RedemptionBoard({ children, currentChildId }) {
  return (
    <section className="leaderboard redemption-board">
      <h2 className="section-title">💰 Redeemed Board</h2>
      <div className="leader-list">
        {children.map((child) => (
          <article className={child.id === currentChildId ? "leader current" : "leader"} key={child.id}>
            <strong>#{child.rank}</strong>
            <AvatarDisplay value={child.avatar} className="leader-avatar" label={`${child.name} avatar`} />
            <div>
              <h3>{child.name}</h3>
              <p>{child.redeemed_count} rewards · €{Number(child.pocket_euros || 0).toFixed(2)} pocket money</p>
            </div>
            <span className="leader-points"><CoinIcon />{child.redeemed_points}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function BadgeCollection({ childName, badges, futureBadges }) {
  const namedBadge = (title) => `${childName || "Child"}'s ${title}`;
  return (
    <section className="leaderboard badges-board">
      <h2 className="section-title">🏅 Badge Collection</h2>
      {badges.length === 0 ? (
        <p className="muted">No badges yet. Complete special challenges to collect them.</p>
      ) : (
        <div className="badge-grid">
          {badges.map((badge) => (
            <article className="badge-card" key={badge.id}>
              <span>{badge.icon}</span>
              <strong>{namedBadge(badge.title)}</strong>
              <small>{badge.badge_date}</small>
            </article>
          ))}
        </div>
      )}
      <h3 className="future-title">Coming next</h3>
      <div className="badge-grid future-badges">
        {futureBadges.map((badge) => (
          <article className="badge-card locked-badge" key={badge.title}>
            <span>{badge.icon}</span>
            <strong>{namedBadge(badge.title)}</strong>
            <small>{badge.requirement}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function ParentDashboard({ api }) {
  const [admin, setAdmin] = useState(null);
  const [childId, setChildId] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [reports, setReports] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  const [editingReward, setEditingReward] = useState(null);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [editingChild, setEditingChild] = useState(null);
  const [editingParent, setEditingParent] = useState(null);
  const [notice, setNotice] = useState("");
  const [adminTab, setAdminTab] = useState("overview");

  async function load(preferredChildId = "") {
    const adminData = await api("/api/admin");
    adminData.activities = (adminData.activities || []).map((activity) => {
      if (typeof activity.task_data !== "string") return activity;
      try { return { ...activity, task_data: JSON.parse(activity.task_data || "{}") }; } catch { return { ...activity, task_data: {} }; }
    });
    setAdmin(adminData);
    const availableIds = adminData.children.map((child) => String(child.id));
    const selected = availableIds.includes(String(preferredChildId))
      ? String(preferredChildId)
      : availableIds.includes(String(childId))
        ? String(childId)
        : String(adminData.children[0]?.id || "");
    setChildId(String(selected));
    setDashboard(await api(`/api/dashboard?childId=${selected}`));
    setReports(await api(`/api/reports?childId=${selected}`));
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (childId) load(); }, [childId]);
  useEffect(() => {
    if (!childId) return;
    const timer = setInterval(() => load(childId), 120000);
    return () => clearInterval(timer);
  }, [childId]);
  if (!admin || !dashboard || !reports) return <Loader />;
  const selectedChildName = admin.children.find((child) => String(child.id) === String(childId))?.name;
  const adminTabs = [
    ["overview", "Today Overview"],
    ["approvals", "Approvals"],
    ["children", "Children & Accounts"],
    ["activities", "Activities"],
    ["quizzes", "Quizzes"],
    ["game", "Game Controls"],
    ["planner", "Weekly Planner"],
    ["rewards", "Rewards"],
    ["reports", "Reports & Backup"]
  ];

  async function saveActivity(event) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const taskData = form.task_type === "sports" && editingActivity?.task_data ? editingActivity.task_data : {
      prompt: form.interactive_prompt || "",
      options: String(form.interactive_options || "").split("\n").map((item) => item.trim()).filter(Boolean),
      pairs: String(form.interactive_pairs || "").split("\n").map((line) => line.split("=").map((item) => item.trim())).filter((pair) => pair.length === 2 && pair[0] && pair[1]),
      image: form.interactive_image || "",
      placeholder: form.interactive_placeholder || ""
    };
    const payload = {
      ...form,
      points: Number(form.points),
      duration_minutes: Number(form.duration_minutes || 0),
      subject: form.subject || "Reading",
      task_type: form.task_type || "standard",
      task_data: JSON.stringify(taskData),
      show_weekdays: form.show_weekdays === "on",
      show_weekends: form.show_weekends === "on",
      day_0: form.day_0 === "on",
      day_1: form.day_1 === "on",
      day_2: form.day_2 === "on",
      day_3: form.day_3 === "on",
      day_4: form.day_4 === "on",
      day_5: form.day_5 === "on",
      day_6: form.day_6 === "on",
      task_date: form.task_date || null,
      proof_required: form.proof_required === "on",
      requires_approval: form.requires_approval === "on"
    };
    const url = editingActivity?.id ? `/api/activities/${editingActivity.id}` : "/api/activities";
    await api(url, { method: editingActivity?.id ? "PUT" : "POST", body: JSON.stringify(payload) });
    setEditingActivity(null);
    load();
  }

  async function saveReward(event) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const payload = { ...form, required_points: Number(form.required_points) };
    const url = editingReward?.id ? `/api/rewards/${editingReward.id}` : "/api/rewards";
    await api(url, { method: editingReward?.id ? "PUT" : "POST", body: JSON.stringify(payload) });
    setEditingReward(null);
    load();
  }

  async function saveQuiz(event) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const payload = {
      ...form,
      assigned_to_kid_id: form.assigned_to_kid_id || null,
      options: String(form.options_text || "").split("\n").map((item) => item.trim()).filter(Boolean),
      multiple_correct_answers: String(form.multiple_correct_answers || "").split("\n").map((item) => item.trim()).filter(Boolean),
      level: Number(form.level || 1),
      timer_seconds: Number(form.timer_seconds || 0),
      hearts: Number(form.hearts || 0),
      required_score_to_pass: Number(form.required_score_to_pass || 1),
      xp_reward: Number(form.xp_reward || 10),
      coin_reward: Number(form.coin_reward || 5),
      unlock_next_level: form.unlock_next_level === "on"
    };
    const url = editingQuiz?.id ? `/api/quizzes/${editingQuiz.id}` : "/api/quizzes";
    await api(url, { method: editingQuiz?.id ? "PUT" : "POST", body: JSON.stringify(payload) });
    setEditingQuiz(null);
    event.currentTarget.reset();
    setNotice(editingQuiz ? "Quiz updated." : "Quiz created.");
    load(childId);
  }

  async function toggleQuizCategoryAssignment(row) {
    await api("/api/quiz-categories/assign", {
      method: "POST",
      body: JSON.stringify({
        categoryKey: "prophet-muhammad-100-de",
        childId: row.child_id,
        enabled: !Boolean(row.enabled)
      })
    });
    setNotice(`${row.child_name}: Seerah quiz ${row.enabled ? "hidden" : "assigned"}.`);
    load(childId);
  }

  async function saveSeerahSettings(event) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    await api("/api/quiz-categories/settings", {
      method: "POST",
      body: JSON.stringify({
        restartOnWrong: form.restart_on_wrong === "on",
        levelSize: Number(form.level_size || 10)
      })
    });
    setNotice("Seerah quiz settings saved.");
    load(childId);
  }

  async function resetSeerahProgress(row) {
    if (!window.confirm(`Reset ${row.child_name}'s Seerah quiz learning position to question 1? Earned Hasnat and attempt history will remain.`)) return;
    await api("/api/quiz-categories/reset", {
      method: "POST",
      body: JSON.stringify({ categoryKey: "prophet-muhammad-100-de", childId: row.child_id })
    });
    setNotice(`${row.child_name}'s Seerah quiz progress was reset.`);
    load(childId);
  }

  async function saveSeerahReviewSettings(row, enabled, questionCount) {
    await api("/api/seerah-review/settings", {
      method: "POST",
      body: JSON.stringify({ childId: row.child_id, enabled, questionCount })
    });
    setNotice(`${row.child_name}'s Daily Seerah Review settings were saved.`);
    load(childId);
  }

  async function resetSeerahReview(row) {
    if (!window.confirm(`Reset ${row.child_name}'s Daily Seerah Review history and practice list? Earned Hasnat will remain.`)) return;
    await api("/api/seerah-review/reset", {
      method: "POST",
      body: JSON.stringify({ childId: row.child_id })
    });
    setNotice(`${row.child_name}'s Daily Seerah Review progress was reset.`);
    load(childId);
  }

  async function remove(type, id) {
    setNotice("");
    if (type === "children" && !window.confirm("Delete this child and all related points, logs, and rewards?")) return;
    try {
      await api(`/api/${type}/${id}`, { method: "DELETE" });
      if (type === "children") {
        setEditingChild(null);
        const nextChild = admin.children.find((child) => String(child.id) !== String(id));
        await load(nextChild?.id || "");
        setNotice("Child deleted.");
        return;
      }
      if (type === "quizzes") setEditingQuiz(null);
      load();
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function approve(logId, approved) {
    await api("/api/approvals", { method: "POST", body: JSON.stringify({ logId, approved }) });
    load();
  }

  async function approveReward(redemptionId, approved) {
    await api("/api/reward-approvals", { method: "POST", body: JSON.stringify({ redemptionId, approved }) });
    load();
  }

  async function toggleWeekend(activity, field) {
    const nextActivity = { ...activity, [field]: field === "show_weekdays" ? !activity.show_weekdays : !activity.show_weekends };
    const payload = {
      ...nextActivity,
      day_0: field === "show_weekends" ? !activity.show_weekends : Boolean(activity.day_0),
      day_1: field === "show_weekdays" ? !activity.show_weekdays : Boolean(activity.day_1),
      day_2: field === "show_weekdays" ? !activity.show_weekdays : Boolean(activity.day_2),
      day_3: field === "show_weekdays" ? !activity.show_weekdays : Boolean(activity.day_3),
      day_4: field === "show_weekdays" ? !activity.show_weekdays : Boolean(activity.day_4),
      day_5: field === "show_weekdays" ? !activity.show_weekdays : Boolean(activity.day_5),
      day_6: field === "show_weekends" ? !activity.show_weekends : Boolean(activity.day_6),
      proof_required: Boolean(activity.proof_required),
      requires_approval: Boolean(activity.requires_approval)
    };
    await api(`/api/activities/${activity.id}`, { method: "PUT", body: JSON.stringify(payload) });
    load();
  }

  async function toggleChildActivity(activity) {
    const assignment = admin.activityAssignments.find((item) => Number(item.child_id) === Number(childId) && Number(item.activity_id) === Number(activity.id));
    const enabled = assignment ? !assignment.enabled : false;
    await api("/api/activity-assignments", { method: "POST", body: JSON.stringify({ childId, activityId: activity.id, enabled }) });
    setNotice(`${activity.title} is now ${enabled ? "permanently assigned" : "permanently hidden"} for ${selectedChildName}.`);
    load(childId);
  }

  async function toggleTodayActivity(activity) {
    const skip = (admin.activityDailySkips || []).find((item) => Number(item.child_id) === Number(childId) && Number(item.activity_id) === Number(activity.id));
    const hidden = !skip;
    await api("/api/activity-daily-skips", {
      method: "POST",
      body: JSON.stringify({
        childId,
        activityId: activity.id,
        hidden,
        reason: hidden ? "Parent hid this activity for today" : ""
      })
    });
    setNotice(hidden
      ? `${activity.title} is hidden for ${selectedChildName} today only. It will appear again tomorrow.`
      : `${activity.title} is back on ${selectedChildName}'s dashboard today.`);
    load(childId);
  }

  async function toggleActivityDay(activity, day) {
    const payload = {
      ...activity,
      [`day_${day}`]: !activity[`day_${day}`],
      proof_required: Boolean(activity.proof_required),
      requires_approval: Boolean(activity.requires_approval)
    };
    await api(`/api/activities/${activity.id}`, { method: "PUT", body: JSON.stringify(payload) });
    load(childId);
  }

  async function addTodayTask(event) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    await api("/api/today-task", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        childId,
        points: Number(form.points || 5),
        duration_minutes: Number(form.duration_minutes || 0),
        proof_required: form.proof_required === "on",
        requires_approval: form.requires_approval === "on"
      })
    });
    event.currentTarget.reset();
    setNotice("Today-only task added.");
    load(childId);
  }

  async function addParentChallenge(event) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    await api("/api/parent-challenges", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        child_id: form.child_id || null,
        target_count: Number(form.target_count || 3),
        bonus_points: Number(form.bonus_points || 10)
      })
    });
    event.currentTarget.reset();
    setNotice("Parent challenge added.");
    load(childId);
  }

  async function exportBackup() {
    const backup = await api("/api/backup");
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kids-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function restoreBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!window.confirm("Restore this backup? This will replace the current children, activities, points, rewards, and reports.")) return;
    try {
      const backup = JSON.parse(await file.text());
      await api("/api/restore", { method: "POST", body: JSON.stringify(backup) });
      setNotice("Backup restored. Please login again if anything looks old.");
      load();
    } catch (err) {
      setNotice(err.message || "Could not restore this backup file.");
    }
  }

  async function saveParentAccount(event) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    await api("/api/parent-account", { method: "PUT", body: JSON.stringify(form) });
    event.currentTarget.reset();
    load();
  }

  async function saveManagedParent(event) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const url = editingParent?.id ? `/api/parents/${editingParent.id}` : "/api/parents";
    await api(url, { method: editingParent?.id ? "PUT" : "POST", body: JSON.stringify(form) });
    setEditingParent(null);
    event.currentTarget.reset();
    setNotice(editingParent ? "Parent account updated." : "Parent account created.");
    load(childId);
  }

  async function saveChild(event) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const payload = { ...form, avatar: form.avatar || "🐱" };
    const url = editingChild?.id ? `/api/children/${editingChild.id}` : "/api/children";
    await api(url, { method: editingChild?.id ? "PUT" : "POST", body: JSON.stringify(payload) });
    setEditingChild(null);
    event.currentTarget.reset();
    load();
  }

  async function updateHifzParent(page, changes) {
    await api("/api/hifz/parent-update", { method: "POST", body: JSON.stringify({ id: page.id, ...changes }) });
    setNotice("SM Hifz progress updated.");
    load(childId);
  }

  async function sendPraise(event) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    await api("/api/praise", { method: "POST", body: JSON.stringify({ ...form, child_id: childId }) });
    event.currentTarget.reset();
    setNotice("Praise message sent.");
    load(childId);
  }

  async function saveGameSettings(event) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    await api("/api/settings", { method: "POST", body: JSON.stringify(form) });
    setNotice("Game settings saved.");
    load(childId);
  }

  async function saveStreakRecoverySettings(row, changes) {
    await api("/api/streak-recovery/settings", {
      method: "POST",
      body: JSON.stringify({
        childId: row.child_id,
        enabled: changes.enabled ?? Boolean(row.enabled),
        maxShields: changes.maxShields ?? Number(row.max_shields || 3),
        shields: changes.shields ?? Number(row.shields || 0),
        difficulty: changes.difficulty ?? row.recovery_difficulty ?? "normal"
      })
    });
    setNotice(`${row.child_name}'s streak recovery settings were saved.`);
    load(childId);
  }

  async function toggleQuranicVisibility(child, visible) {
    await api("/api/quranic-visibility", { method: "POST", body: JSON.stringify({ childId: child.child_id, visible }) });
    setNotice(`Quranic Motivation ${visible ? "enabled" : "hidden"} for ${child.name}.`);
    load(childId);
  }

  async function awardBonusHasnat(event) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    await api("/api/bonus-hasnat", {
      method: "POST",
      body: JSON.stringify({ childId, amount: Number(form.amount || 0), note: form.note || "Parent bonus Hasanat" })
    });
    event.currentTarget.reset();
    setNotice("Bonus Hasanat awarded.");
    load(childId);
  }

  async function saveSportsVideo(event) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    await api("/api/sports-videos", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        enabled: form.enabled === "on",
        duration_seconds: Number(form.duration_seconds || 20)
      })
    });
    event.currentTarget.reset();
    setNotice("Sports demo video saved.");
    load(childId);
  }

  return (
    <main className="dashboard">
      <section className="admin-top">
        <div>
          <p className="eyebrow">Parent dashboard</p>
          <h1>Progress, approvals, activities, and rewards</h1>
        </div>
        <label>Child
          <select value={childId} onChange={(event) => setChildId(event.target.value)}>
            {admin.children.map((child) => <option value={child.id} key={child.id}>{child.name}</option>)}
          </select>
        </label>
      </section>

      <section className="stats">
        <Stat label={`${selectedChildName || "Child"} daily Hasanat`} value={dashboard.points.daily} />
        <Stat label="Weekly Hasanat" value={dashboard.points.weekly} />
        <Stat label="Total Hasanat" value={dashboard.points.total} />
      </section>

      <nav className="admin-tabs" aria-label="Parent dashboard sections">
        {adminTabs.map(([id, label]) => (
          <button className={adminTab === id ? "active" : ""} key={id} onClick={() => setAdminTab(id)}>{label}</button>
        ))}
      </nav>

      {notice && <p className="notice">{notice}</p>}

      {adminTab === "overview" && (
        <>
          <TodayOverview rows={admin.todayOverview || []} />
          <SmartInsights insights={admin.smartInsights} />
        </>
      )}

      {adminTab === "approvals" && (
        <section className="admin-grid">
          <Panel title="Pending Approvals">
            {admin.approvals.length === 0 && <p className="muted">No approvals waiting.</p>}
            {admin.approvals.map((item) => (
              <div className="approval" key={item.id}>
                <strong>{item.child_name}</strong>
                <span>{item.activity_title}</span>
                {item.proof ? <a className="proof-link" href={item.proof} target="_blank">View proof</a> : null}
                <button onClick={() => approve(item.id, true)}>Approve</button>
                <button className="ghost" onClick={() => approve(item.id, false)}>Reject</button>
              </div>
            ))}
          </Panel>

          <Panel title="Reward Requests">
            {admin.rewardApprovals.length === 0 && <p className="muted">No reward requests waiting.</p>}
            {admin.rewardApprovals.map((item) => (
              <div className="approval" key={item.id}>
                <strong>{item.child_name}</strong>
                <span>{item.reward_title} · {item.points_spent} Hasanat</span>
                <button onClick={() => approveReward(item.id, true)}>Approve</button>
                <button className="ghost" onClick={() => approveReward(item.id, false)}>Reject</button>
              </div>
            ))}
          </Panel>
        </section>
      )}

      {adminTab === "children" && (
        <section className="admin-grid">
          <Panel title="Children & Accounts">
            <ParentAccountForm user={admin.users.find((account) => account.role === "admin" || account.role === "parent")} onSubmit={saveParentAccount} />
            {admin.currentUser?.role === "admin" && (
              <>
                <ParentCreateForm item={editingParent} onSubmit={saveManagedParent} />
                <div className="mini-list">
                  {admin.users.filter((account) => account.role === "parent").map((parent) => (
                    <div key={parent.id}>
                      <span>{parent.name} · parent login</span>
                      <button onClick={() => setEditingParent(parent)}>Edit</button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <ChildAccountForm item={editingChild} users={admin.users} onSubmit={saveChild} />
            <div className="mini-list">
              {admin.children.map((child) => {
                const account = admin.users.find((user) => user.child_id === child.id);
                return (
                  <div key={child.id}>
                    <span>{child.name} · login name: {account?.name || child.name}</span>
                    <button onClick={() => setEditingChild(child)}>Edit</button>
                    <button className="ghost" onClick={() => remove("children", child.id)}>Delete</button>
                  </div>
                );
              })}
            </div>
          </Panel>
        </section>
      )}

      {adminTab === "activities" && (
        <section className="admin-grid">
          <Panel title="Quick Today Task">
            <TodayTaskForm childName={selectedChildName} onSubmit={addTodayTask} />
          </Panel>
          <Panel title="Child Activity Planner">
            <p className="muted">Use “Hide today” for a one-day break. The activity returns automatically tomorrow. Use “Assigned/Hidden” only for permanent changes.</p>
            <div className="activity-admin-list">
              {admin.activities.map((activity) => {
                const assignment = admin.activityAssignments.find((item) => Number(item.child_id) === Number(childId) && Number(item.activity_id) === Number(activity.id));
                const enabled = assignment ? Boolean(assignment.enabled) : true;
                const todaySkip = (admin.activityDailySkips || []).find((item) => Number(item.child_id) === Number(childId) && Number(item.activity_id) === Number(activity.id));
                return (
                  <article className={!enabled ? "permanent-hidden" : todaySkip ? "today-hidden" : ""} key={activity.id}>
                    <div>
                      <strong>{activity.title}</strong>
                      <small>
                        {activity.points} Hasanat · {activity.subject || "Activity"}
                        {!enabled ? " · permanently hidden" : todaySkip ? " · hidden today only" : " · visible today"}
                      </small>
                    </div>
                    <div className="activity-admin-actions">
                      <button className={todaySkip ? "" : "ghost"} disabled={!enabled} onClick={() => toggleTodayActivity(activity)}>
                        {todaySkip ? "Show today" : "Hide today"}
                      </button>
                      <button className={enabled ? "" : "ghost"} onClick={() => toggleChildActivity(activity)}>
                        {enabled ? "Hide always" : "Show always"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </Panel>
          <Panel title="Activities">
            <EditorForm item={editingActivity} type="activity" onSubmit={saveActivity} />
            <div className="mini-list">
              {admin.activities.map((activity) => (
                <div key={activity.id}>
                  <span>{activity.title} · {activity.points} Hasanat · {activity.show_weekdays ? "weekdays" : ""}{activity.show_weekdays && activity.show_weekends ? " + " : ""}{activity.show_weekends ? "weekends" : ""}</span>
                  <button onClick={() => setEditingActivity(activity)}>Edit</button>
                  <button className="ghost" onClick={() => remove("activities", activity.id)}>Delete</button>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      )}

      {adminTab === "quizzes" && (
        <section className="admin-grid">
          <Panel title="100 Fragen über den Propheten Muhammad ﷺ">
            <QuizCategoryAssignments
              rows={admin.quizCategoryAssignments || []}
              category={admin.quizCategories?.[0]}
              onToggle={toggleQuizCategoryAssignment}
              onSettings={saveSeerahSettings}
              onReset={resetSeerahProgress}
              onReviewSettings={saveSeerahReviewSettings}
              onReviewReset={resetSeerahReview}
            />
          </Panel>
          <Panel title="Create Quiz Mission">
            <QuizEditorForm item={editingQuiz} children={admin.children} onSubmit={saveQuiz} />
          </Panel>
          <Panel title="Quiz Library">
            <div className="mini-list">
              {(admin.quizzes || []).map((quiz) => (
                <div key={quiz.id}>
                  <span>{quiz.title} · {quiz.subject} · {quiz.quiz_type} · {quiz.assigned_kid_name || "All kids"} · {quiz.status}</span>
                  <button onClick={() => setEditingQuiz(quiz)}>Edit</button>
                  <button className="ghost" onClick={() => remove("quizzes", quiz.id)}>Delete</button>
                </div>
              ))}
              {(admin.quizzes || []).length === 0 && <p className="muted">No quizzes yet. Create the first quiz above.</p>}
            </div>
          </Panel>
          <Panel title="Quiz Results">
            <QuizResults results={admin.quizResults || []} />
          </Panel>
        </section>
      )}

      {adminTab === "game" && (
        <section className="admin-grid">
          <Panel title="Seasonal Theme & Sound">
            <GameSettingsForm settings={admin.settings || {}} onSubmit={saveGameSettings} />
          </Panel>
          <Panel title="Streak Recovery & Learning Trees">
            <StreakRecoveryAdmin
              rows={admin.streakRecoverySettings || []}
              history={admin.streakHistory || []}
              onSave={saveStreakRecoverySettings}
            />
          </Panel>
          <Panel title="Quranic Motivation Visibility">
            <QuranicVisibilityForm rows={admin.quranicVisibility || []} onToggle={toggleQuranicVisibility} />
          </Panel>
          <Panel title="Award Bonus Hasanat">
            <BonusHasnatForm childName={selectedChildName} onSubmit={awardBonusHasnat} />
          </Panel>
          <Panel title="Sports Reports">
            <SportsReportsPanel rows={admin.sportsReports || []} />
          </Panel>
          <Panel title="Sports Video Library">
            <SportsVideoLibrary videos={admin.sportsVideos || []} activities={admin.activities || []} onSubmit={saveSportsVideo} />
          </Panel>
          <Panel title="Send Praise Message">
            <PraiseForm childName={selectedChildName} onSubmit={sendPraise} />
            <PraiseList messages={admin.praiseMessages || []} />
          </Panel>
        </section>
      )}

      {adminTab === "planner" && (
        <section className="admin-grid">
          <Panel title="Weekly Planner">
            <p className="muted">Choose the exact days each activity appears. Use today-only tasks for special one-day jobs.</p>
            <WeeklyPlanner activities={admin.activities} onToggleDay={toggleActivityDay} onToggleGroup={toggleWeekend} />
          </Panel>
          <Panel title="Parent Challenges">
            <ParentChallengeForm children={admin.children} onSubmit={addParentChallenge} />
            <div className="mini-list">
              {(admin.parentChallenges || []).map((challenge) => (
                <div key={challenge.id}>
                  <span>{challenge.title} · {challenge.target_count} activities · {challenge.bonus_points} Hasanat bonus</span>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      )}

      {adminTab === "rewards" && (
        <section className="admin-grid">
          <Panel title="Rewards">
            <EditorForm item={editingReward} type="reward" onSubmit={saveReward} />
            <div className="mini-list">
              {admin.rewards.map((reward) => (
                <div key={reward.id}>
                  <span>{reward.title} · {reward.required_points} Hasanat</span>
                  <button onClick={() => setEditingReward(reward)}>Edit</button>
                  <button className="ghost" onClick={() => remove("rewards", reward.id)}>Delete</button>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      )}

      {adminTab === "reports" && (
        <section className="admin-grid">
          <Panel title="Backup & Reports">
            <div className="backup-actions">
              <button onClick={exportBackup}>Export backup</button>
              <label className="restore-button">Restore backup<input type="file" accept="application/json,.json" onChange={restoreBackup} /></label>
            </div>
            <ReportView reports={reports} />
          </Panel>
          <Panel title="Child Reflections">
            <ReflectionView reflections={admin.reflections || []} />
          </Panel>
        </section>
      )}
    </main>
  );
}

function TodayOverview({ rows = [] }) {
  return (
    <section className="today-overview" aria-label="Today overview">
      <div className="section-heading">
        <p className="eyebrow">Today Overview</p>
        <h2>Children needing attention and encouragement</h2>
      </div>
      <div className="overview-grid">
        {rows.map((row) => (
          <article className={`overview-card ${row.status === "Needs attention" ? "attention" : row.status === "Great progress" ? "great" : ""}`} key={row.id}>
            <div className="overview-child">
              <span>{avatarFor(row.avatar)}</span>
              <div>
                <h3>{row.name}</h3>
                <p>{row.status}</p>
              </div>
            </div>
            <div className="overview-stats">
              <span><strong>{row.daily_points}</strong> daily Hasanat</span>
              <span><strong>{row.completed_today}</strong> completed</span>
              <span><strong>{row.missed_today}</strong> missed</span>
              <span><strong>{row.pending_approvals}</strong> approvals</span>
              <span><strong>{row.pending_rewards}</strong> rewards</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SmartInsights({ insights = {} }) {
  const cards = [
    ["Best activity today", insights.best_activity_today],
    ["Weakest/missed activity", insights.weakest_activity_today],
    ["Most active this week", insights.most_active_child_week],
    ["Needs attention", insights.child_needs_attention],
    ["Reward requests waiting", insights.reward_requests_waiting ?? 0],
    ["Pending approvals", insights.pending_approvals_waiting ?? 0]
  ];
  return (
    <section className="smart-insights">
      <div className="section-heading">
        <p className="eyebrow">Smart Insights</p>
        <h2>Quick family signals</h2>
      </div>
      <div className="insight-grid">
        {cards.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value || "Not enough data yet"}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function ParentHifzPanel({ hifz, onUpdate }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  if (!hifz) return (
    <section className="admin-grid">
      <Panel title="SM Qur’an Hifz Progress">
        <p className="muted">Create or select a child named SM to see this tracker.</p>
      </Panel>
    </section>
  );
  const today = hifz.today;
  const rows = hifz.recent || [];

  function startEdit(row) {
    setEditing(row);
    setForm({
      surahName: row.surah_name || "",
      surahNameArabic: row.surah_name_arabic || "",
      surahNumber: row.surah_number || "",
      ayahRange: row.ayah_range || "",
      parentNotes: row.parent_notes || "",
      parentReviewed: Boolean(row.parent_reviewed)
    });
  }

  async function saveEdit() {
    await onUpdate(editing, form);
    setEditing(null);
  }

  return (
    <section className="admin-grid">
      <Panel title="SM Qur’an Hifz Progress">
        <div className="hifz-parent-summary">
          <Stat label="Completion" value={`${hifz.completion_percentage}%`} />
          <Stat label="Pages" value={`${hifz.total_pages_memorized}/${hifz.total_pages}`} />
          <Stat label="Remaining" value={hifz.total_pages_remaining} />
          <Stat label="Current Juz" value={hifz.current_juz} />
          <Stat label="Current Surah" value={hifz.current_surah || "Select Surah"} />
          <Stat label="Surahs completed" value={hifz.completed_surahs} />
          <Stat label="Juz completed" value={hifz.completed_juz?.length || 0} />
          <Stat label="Streak" value={`${hifz.current_streak} days`} />
          <Stat label="Qur’an Hasanat" value={hifz.total_quran_points} />
          <Stat label="Missed days" value={hifz.missed_days} />
        </div>
        <Progress value={hifz.completion_percentage} />
        <div className="hifz-review-flags">
          <span>Daily revision: {hifz.daily_revision_completed ? "Done" : "Waiting"}</span>
          <span>Weekly review: {hifz.weekly_review_due ? (hifz.weekly_review_completed ? "Done" : "Due") : "Not due"}</span>
          <span>Juz review: {hifz.juz_review_due ? (hifz.juz_review_completed ? "Done" : "Due") : "Not due"}</span>
        </div>
      </Panel>

      <Panel title="Today & Recent Pages">
        <div className="mini-list hifz-parent-list">
          {[today, ...rows.filter((row) => row.id !== today?.id)].filter(Boolean).slice(0, 8).map((row) => (
            <div key={row.id}>
              <span>
                Page {row.page_number} · Juz {row.juz_number} · {row.surah_name_english || row.surah_name || "Select Surah"}
                <small>{row.plan_date} · Memo: {row.memorized ? "yes" : "no"} · Daily revision: {row.revised ? "yes" : "no"} · Weekly: {row.weekly_review_done ? "yes" : "no"} · Juz review: {row.juz_review_done ? "yes" : "no"} · Parent: {row.parent_reviewed ? "reviewed" : "not reviewed"}</small>
                {row.notes ? <small>SM notes: {row.notes}</small> : null}
                {row.parent_notes ? <small>Parent notes: {row.parent_notes}</small> : null}
              </span>
              <button onClick={() => startEdit(row)}>Review</button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Weekly & Monthly Hifz Progress">
        <h3>Weekly progress</h3>
        {(hifz.weekly_progress || []).map((row) => <Bar key={row.week} label={row.week} value={Number(row.pages || 0) * 5} />)}
        <h3>Monthly progress</h3>
        {(hifz.monthly_progress || []).map((row) => <Bar key={row.month} label={row.month} value={Number(row.pages || 0) * 5} />)}
      </Panel>

      {editing && (
        <Panel title={`Parent Review: Page ${editing.page_number}`}>
          <form className="editor" onSubmit={(event) => { event.preventDefault(); saveEdit(); }}>
            <input value={form.surahName} onChange={(event) => setForm({ ...form, surahName: event.target.value })} placeholder="Surah name" />
            <input value={form.surahNameArabic} onChange={(event) => setForm({ ...form, surahNameArabic: event.target.value })} placeholder="Surah Arabic name" />
            <input value={form.surahNumber} onChange={(event) => setForm({ ...form, surahNumber: event.target.value })} placeholder="Surah number" />
            <input value={form.ayahRange} onChange={(event) => setForm({ ...form, ayahRange: event.target.value })} placeholder="Ayah range" />
            <textarea value={form.parentNotes} onChange={(event) => setForm({ ...form, parentNotes: event.target.value })} placeholder="Parent feedback notes" />
            <label className="check"><input type="checkbox" checked={form.parentReviewed} onChange={(event) => setForm({ ...form, parentReviewed: event.target.checked })} /> Reviewed by parent</label>
            <button>Save parent review</button>
            <button className="ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
          </form>
        </Panel>
      )}
    </section>
  );
}

function ReflectionView({ reflections = [] }) {
  if (reflections.length === 0) return <p className="muted">No reflections yet.</p>;
  return (
    <div className="reflection-list">
      {reflections.map((item) => (
        <article key={item.id}>
          <span>{avatarFor(item.avatar)}</span>
          <div>
            <strong>{item.child_name} · {item.reflection_date}</strong>
            <p>Enjoyed: {item.enjoyed_activity} · Feeling: {item.feeling}</p>
            {item.note ? <small>{item.note}</small> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function ParentAccountForm({ user, onSubmit }) {
  return (
    <form className="editor" onSubmit={onSubmit}>
      <h3>Parent login</h3>
      <input name="name" placeholder="Parent name" defaultValue={user?.name || ""} required />
      <input name="password" type="password" placeholder="New password, optional" />
      <button>Update parent login</button>
    </form>
  );
}

function ParentCreateForm({ item, onSubmit }) {
  return (
    <form className="editor" onSubmit={onSubmit}>
      <h3>{item ? "Edit parent" : "Create parent account"}</h3>
      <input name="name" placeholder="Parent login name" defaultValue={item?.name || ""} required />
      <input name="password" type="password" placeholder={item ? "New password, optional" : "Password"} required={!item} />
      <button>{item ? "Update parent" : "Create parent"}</button>
    </form>
  );
}

function TodayTaskForm({ childName, onSubmit }) {
  return (
    <form className="editor today-task-form" onSubmit={onSubmit}>
      <p className="muted">Add a special task only for {childName || "the selected child"} today.</p>
      <input name="title" placeholder="Task title, for example: Clean desk" required />
      <input name="description" placeholder="Short description" defaultValue="Special task for today." />
      <input name="points" type="number" min="1" placeholder="Hasanat" defaultValue="5" required />
      <input name="duration_minutes" type="number" min="0" placeholder="Timer minutes" defaultValue="0" />
      <label className="check"><input name="proof_required" type="checkbox" /> Proof photo</label>
      <label className="check"><input name="requires_approval" type="checkbox" /> Parent approval</label>
      <button>Add for today</button>
    </form>
  );
}

function WeeklyPlanner({ activities, onToggleDay, onToggleGroup }) {
  const days = [
    ["Sun", 0],
    ["Mon", 1],
    ["Tue", 2],
    ["Wed", 3],
    ["Thu", 4],
    ["Fri", 5],
    ["Sat", 6]
  ];
  return (
    <div className="weekly-planner">
      {activities.map((activity) => (
        <article className={activity.task_date ? "planner-row today-only" : "planner-row"} key={activity.id}>
          <div>
            <strong>{activity.title}</strong>
            <span>{activity.task_date ? `Today-only: ${activity.task_date}` : `${activity.points} Hasanat · ${activity.frequency}`}</span>
          </div>
          <div className="day-buttons">
            {days.map(([label, day]) => (
              <button
                className={activity[`day_${day}`] ? "" : "ghost"}
                key={day}
                onClick={() => onToggleDay(activity, day)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="planner-presets">
            <button type="button" className={activity.show_weekdays ? "" : "ghost"} onClick={() => onToggleGroup(activity, "show_weekdays")}>Weekdays</button>
            <button type="button" className={activity.show_weekends ? "" : "ghost"} onClick={() => onToggleGroup(activity, "show_weekends")}>Weekend</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function ParentChallengeForm({ children, onSubmit }) {
  const todayValue = new Date().toISOString().slice(0, 10);
  return (
    <form className="editor challenge-form" onSubmit={onSubmit}>
      <input name="title" placeholder="Challenge title, for example: Reading Challenge" required />
      <input name="description" placeholder="Description" defaultValue="Complete the challenge goal." />
      <div className="form-row">
        <input name="target_count" type="number" min="1" defaultValue="3" placeholder="Target activities" />
        <input name="bonus_points" type="number" min="0" defaultValue="10" placeholder="Bonus Hasanat" />
      </div>
      <div className="form-row">
        <input name="start_date" type="date" defaultValue={todayValue} />
        <input name="end_date" type="date" defaultValue={todayValue} />
      </div>
      <select name="child_id" defaultValue="">
        <option value="">All children</option>
        {children.map((child) => <option value={child.id} key={child.id}>{child.name}</option>)}
      </select>
      <button>Add challenge</button>
    </form>
  );
}

function QuizEditorForm({ item, children, onSubmit }) {
  const optionsText = Array.isArray(item?.options) ? item.options.join("\n") : "";
  const multipleText = Array.isArray(item?.multiple_correct_answers) ? item.multiple_correct_answers.join("\n") : "";
  return (
    <form className="editor quiz-editor" onSubmit={onSubmit}>
      <h3>{item ? "Edit quiz" : "New quiz activity"}</h3>
      <input name="title" placeholder="Quiz title" defaultValue={item?.title || ""} required />
      <select name="subject" defaultValue={item?.subject || "Reading"}>
        {["Math", "German", "English", "Quran", "Reading", "Fitness", "Housework", "Teamwork", "Sports & Physical Development"].map((subject) => <option key={subject}>{subject}</option>)}
      </select>
      <select name="quiz_type" defaultValue={item?.quiz_type || "select_3"}>
        {quizTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select>
      <select name="assigned_to_kid_id" defaultValue={item?.assigned_to_kid_id || ""}>
        <option value="">All my kids</option>
        {children.map((child) => <option value={child.id} key={child.id}>{child.name}</option>)}
      </select>
      <div className="form-row">
        <select name="difficulty" defaultValue={item?.difficulty || "easy"}>
          <option value="easy">easy</option>
          <option value="medium">medium</option>
          <option value="hard">hard</option>
        </select>
        <input name="level" type="number" min="1" defaultValue={item?.level || 1} placeholder="Level" />
        <input name="due_date" type="date" defaultValue={item?.due_date || ""} />
      </div>
      <input name="instructions" placeholder="Instructions" defaultValue={item?.instructions || ""} />
      <textarea name="question_text" placeholder="Question text" defaultValue={item?.question_text || ""} required />
      <textarea name="story_text" placeholder="Story text, optional" defaultValue={item?.story_text || ""} />
      <div className="form-row">
        <input name="image_url" placeholder="Image URL, optional" defaultValue={item?.image_url || ""} />
        <input name="audio_url" placeholder="Audio URL, optional" defaultValue={item?.audio_url || ""} />
      </div>
      <input name="emoji_prompt" placeholder="Emoji prompt, optional" defaultValue={item?.emoji_prompt || ""} />
      <textarea name="options_text" placeholder="Answer options, one per line. Use 3 or 4 options for simple quizzes." defaultValue={optionsText} />
      <input name="correct_answer" placeholder="Correct answer" defaultValue={item?.correct_answer || ""} />
      <textarea name="multiple_correct_answers" placeholder="Multiple correct answers, one per line" defaultValue={multipleText} />
      <textarea name="explanation" placeholder="Feedback or explanation shown after answer" defaultValue={item?.explanation || ""} />
      <div className="form-row">
        <input name="timer_seconds" type="number" min="0" defaultValue={item?.timer_seconds || 0} placeholder="Timer seconds" />
        <input name="hearts" type="number" min="0" defaultValue={item?.hearts || 0} placeholder="Hearts" />
        <input name="required_score_to_pass" type="number" min="1" defaultValue={item?.required_score_to_pass || 1} placeholder="Pass score" />
      </div>
      <div className="form-row">
        <input name="xp_reward" type="number" min="0" defaultValue={item?.xp_reward || 10} placeholder="XP reward" />
        <input name="coin_reward" type="number" min="0" defaultValue={item?.coin_reward || 5} placeholder="Coin reward" />
        <input name="badge_reward" placeholder="Badge reward, optional" defaultValue={item?.badge_reward || ""} />
      </div>
      <label className="check"><input name="unlock_next_level" type="checkbox" defaultChecked={Boolean(item?.unlock_next_level)} /> Unlock next level when passed</label>
      <select name="status" defaultValue={item?.status || "active"}>
        <option value="active">active</option>
        <option value="inactive">inactive</option>
      </select>
      <button>{item ? "Update quiz" : "Create quiz"}</button>
    </form>
  );
}

function QuizResults({ results = [] }) {
  if (!results.length) return <p className="muted">No quiz attempts yet.</p>;
  return (
    <div className="mini-list quiz-results-list">
      {results.map((result) => (
        <div key={result.id}>
          <span>
            {result.kid_name} · {result.title}
            <small>{result.completed_at} · score {result.score} · attempts {result.attempts} · {result.time_used_seconds}s · coins {result.coins_earned} · XP {result.xp_earned}</small>
            {result.feedback ? <small>{result.feedback}</small> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function QuizCategoryAssignments({ rows = [], category, onToggle, onSettings, onReset, onReviewSettings, onReviewReset }) {
  return (
    <div className="quiz-category-admin">
      <p className="muted">
        Assign the complete {category?.question_count || 100}-question German Seerah journey to individual children.
        Progress and every answer are saved automatically.
      </p>
      <form className="editor seerah-settings-form" onSubmit={onSettings}>
        <label className="check">
          <input name="restart_on_wrong" type="checkbox" defaultChecked={category?.restart_on_wrong !== false} />
          Restart at the beginning of the current level after a wrong answer
        </label>
        <label>
          Questions per level
          <input name="level_size" type="number" min="1" max="25" defaultValue={category?.level_size || 10} />
        </label>
        <button>Save quiz settings</button>
      </form>
      <div className="mini-list">
        {rows.map((row) => (
          <div className="seerah-child-admin" key={row.child_id}>
            <div>
              <strong>{row.child_name}</strong>
              <small>Main journey: Level {row.current_level || 1} · {row.completed || 0}/{category?.question_count || 100}</small>
              <small>Daily reviews: {row.review_completed || 0} complete · {row.review_correct || 0} correct · {row.review_wrong || 0} wrong</small>
              <small>{row.needs_practice || 0} need more practice · {row.review_hasnat || 0} Hasnat earned</small>
            </div>
            <div className="seerah-admin-actions">
              <button className={row.enabled ? "" : "ghost"} type="button" onClick={() => onToggle(row)}>
                {row.enabled ? "Main quiz assigned" : "Main quiz hidden"}
              </button>
              <button
                className={row.review_enabled ? "" : "ghost"}
                type="button"
                onClick={() => onReviewSettings(row, !Boolean(row.review_enabled), Number(row.review_question_count || 10))}
              >
                {row.review_enabled ? "Daily review enabled" : "Daily review disabled"}
              </button>
              <label>
                Daily questions
                <select
                  value={Number(row.review_question_count || 10)}
                  onChange={(event) => onReviewSettings(row, Boolean(row.review_enabled), Number(event.target.value))}
                >
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="15">15</option>
                </select>
              </label>
              <button className="ghost" type="button" onClick={() => onReset(row)}>Reset main progress</button>
              <button className="ghost" type="button" onClick={() => onReviewReset(row)}>Reset daily review</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GameSettingsForm({ settings = {}, onSubmit }) {
  return (
    <form className="editor" onSubmit={onSubmit}>
      <select name="seasonal_theme" defaultValue={settings.seasonal_theme || "learning"}>
        <option value="learning">Learning</option>
        <option value="ramadan">Ramadan</option>
        <option value="eid">Eid</option>
        <option value="winter">Winter</option>
        <option value="football">Football Cup</option>
        <option value="school">School Challenge</option>
        <option value="summer">Summer Learning</option>
      </select>
      <label className="check"><input name="sound_enabled" type="checkbox" defaultChecked={settings.sound_enabled !== "false"} /> Sound effects enabled by default</label>
      <button>Save game settings</button>
    </form>
  );
}

function StreakRecoveryAdmin({ rows = [], history = [], onSave }) {
  return (
    <div className="streak-admin">
      <p className="muted">Shields protect missed days automatically. Recovery missions appear only when no shield is available.</p>
      <div className="streak-admin-list">
        {rows.map((row) => (
          <article key={row.child_id}>
            <div>
              <strong>{row.child_name}</strong>
              <small>🔥 {row.current_streak} days · 🛡️ {row.shields}/{row.max_shields} · Tree health {row.tree_health}%</small>
              <small>{row.recovery_status === "active" ? `Recovery: ${row.recovery_completed}/${row.recovery_required}` : "No recovery needed"}</small>
            </div>
            <button className={row.enabled ? "" : "ghost"} type="button" onClick={() => onSave(row, { enabled: !Boolean(row.enabled) })}>
              {row.enabled ? "Recovery enabled" : "Recovery disabled"}
            </button>
            <label>
              Available shields
              <select value={Number(row.shields || 0)} onChange={(event) => onSave(row, { shields: Number(event.target.value) })}>
                {[0, 1, 2, 3].filter((value) => value <= Number(row.max_shields || 3)).map((value) => <option value={value} key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              Maximum shields
              <select value={Number(row.max_shields || 3)} onChange={(event) => onSave(row, { maxShields: Number(event.target.value), shields: Math.min(Number(row.shields || 0), Number(event.target.value)) })}>
                {[0, 1, 2, 3].map((value) => <option value={value} key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              Recovery difficulty
              <select value={row.recovery_difficulty || "normal"} onChange={(event) => onSave(row, { difficulty: event.target.value })}>
                <option value="easy">Easy · 5 quiz questions</option>
                <option value="normal">Normal · 7 quiz questions</option>
                <option value="hard">Hard · 10 quiz questions</option>
              </select>
            </label>
          </article>
        ))}
      </div>
      <details className="streak-history">
        <summary>View streak history <strong>{history.length}</strong></summary>
        <div>
          {history.length ? history.map((event) => (
            <p key={event.id}><strong>{event.child_name}</strong> · {event.event_date} · {event.event_type.replaceAll("_", " ")}<small>{event.note}</small></p>
          )) : <p className="muted">No streak events recorded yet.</p>}
        </div>
      </details>
    </div>
  );
}

function QuranicVisibilityForm({ rows = [], onToggle }) {
  return (
    <div className="mini-list">
      {rows.map((row) => (
        <div key={row.child_id}>
          <span>{row.name}</span>
          <label className="check">
            <input type="checkbox" checked={Number(row.visible) === 1} onChange={(event) => onToggle(row, event.target.checked)} />
            Show Quranic Motivation
          </label>
        </div>
      ))}
    </div>
  );
}

function BonusHasnatForm({ childName, onSubmit }) {
  return (
    <form className="editor" onSubmit={onSubmit}>
      <p className="muted">Award extra Hasanat to {childName || "the selected child"}.</p>
      <input name="amount" type="number" min="1" max="1000" placeholder="Hasanat amount" required />
      <input name="note" placeholder="Reason, for example: Excellent sports effort" />
      <button>Award bonus</button>
    </form>
  );
}

function SportsReportsPanel({ rows = [] }) {
  if (!rows.length) return <p className="muted">No sports report data yet.</p>;
  return (
    <div className="mini-list">
      {rows.map((row) => (
        <div key={row.child_id}>
          <span>{row.child_name}</span>
          <small>{row.completed} completed · {row.duration} min · {row.hasnat} Hasanat</small>
        </div>
      ))}
    </div>
  );
}

function SportsVideoLibrary({ videos = [], activities = [], onSubmit }) {
  const sportsActivities = activities.filter((activity) => activity.subject === "Sports & Physical Development");
  const exerciseOptions = Array.from(new Map(sportsActivities.map((activity) => {
    const key = activity.task_data?.exerciseKey || classSlug(activity.title);
    return [key, `${activity.title} (${key})`];
  })).entries());
  const [videoData, setVideoData] = useState("");

  function readVideo(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setVideoData(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  return (
    <div className="sports-video-library">
      <form className="editor" onSubmit={(event) => {
        const hidden = event.currentTarget.querySelector("input[name='video_url']");
        if (hidden && videoData) hidden.value = videoData;
        onSubmit(event);
        setVideoData("");
      }}>
        <select name="exercise_key" required>
          <option value="">Choose exercise</option>
          {exerciseOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
        <input name="title" placeholder="Video title" required />
        <select name="source_type" defaultValue="url">
          <option value="url">Video URL</option>
          <option value="youtube">YouTube embed</option>
          <option value="upload">Upload MP4</option>
          <option value="self_hosted">Self-hosted file</option>
        </select>
        <input name="video_url" placeholder="Video URL, YouTube embed URL, or uploaded MP4 data" />
        <label className="restore-button">Upload MP4<input type="file" accept="video/mp4,video/webm,video/*" onChange={(event) => readVideo(event.target.files?.[0])} /></label>
        {videoData ? <small>Video ready to save. Large files may take longer to upload.</small> : null}
        <input name="thumbnail_url" placeholder="Thumbnail URL, optional" />
        <textarea name="explanation" placeholder="Simple child-friendly explanation" />
        <textarea name="safety_tips" placeholder="Safety tips" defaultValue="Warm up first. Drink water. Stop if you feel pain. Ask a parent for help." />
        <div className="form-row">
          <select name="difficulty" defaultValue="Easy">
            <option>Easy</option>
            <option>Medium</option>
            <option>Hard</option>
          </select>
          <input name="duration_seconds" type="number" min="5" max="180" defaultValue="20" />
        </div>
        <textarea name="ai_feedback_prompt" placeholder="Future AI exercise analysis prompt" defaultValue="Future AI posture feedback for safe child-friendly exercise guidance." />
        <label className="check"><input name="enabled" type="checkbox" defaultChecked /> Enabled</label>
        <button>Save video</button>
      </form>
      <div className="mini-list">
        {videos.map((video) => (
          <div key={video.id}>
            <span>{video.enabled ? "✅" : "⏸️"} {video.title} · {video.exercise_key} · {video.source_type}<small>{video.duration_seconds}s · {video.difficulty}</small></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PraiseForm({ childName, onSubmit }) {
  return (
    <form className="editor" onSubmit={onSubmit}>
      <p className="muted">Send a short warm message to {childName || "the selected child"}.</p>
      <input name="message" maxLength="160" placeholder="Great work today! I am proud of you." required />
      <button>Send praise</button>
    </form>
  );
}

function PraiseList({ messages = [] }) {
  if (!messages.length) return <p className="muted">No praise messages yet.</p>;
  return (
    <div className="mini-list">
      {messages.slice(0, 8).map((item) => (
        <div key={item.id}>
          <span>{item.child_name} · {item.message}<small>{item.status} · {item.created_at}</small></span>
        </div>
      ))}
    </div>
  );
}

function MoodReport({ moods = [] }) {
  if (!moods.length) return <p className="muted">No mood check-ins yet.</p>;
  const icon = { happy: "😊", tired: "😴", excited: "🤩", sad: "😔", angry: "😠", calm: "😌" };
  return (
    <div className="mini-list">
      {moods.slice(0, 12).map((item) => (
        <div key={item.id}>
          <span>{avatarFor(item.avatar)} {item.child_name} · {icon[item.mood] || "💭"} {item.mood}<small>{item.mood_date}</small></span>
        </div>
      ))}
    </div>
  );
}

function ChildAccountForm({ item, users, onSubmit }) {
  const childUser = item ? users.find((user) => user.child_id === item.id) : null;
  return (
    <form className="editor" onSubmit={onSubmit}>
      <h3>{item ? "Edit child" : "Add child"}</h3>
      <input name="name" placeholder="Child login name" defaultValue={item?.name || childUser?.name || ""} required />
      <input name="password" type="password" placeholder={item ? "New password, optional" : "Password"} required={!item} />
      <select name="avatar" defaultValue={avatarFor(item?.avatar || "🐱")}>
        {avatarChoices.map((avatar) => <option value={avatar} key={avatar}>{avatar}</option>)}
      </select>
      <button>{item ? "Update child" : "Add child"}</button>
    </form>
  );
}

function EditorForm({ item, type, onSubmit }) {
  const isReward = type === "reward";
  return (
    <form className="editor" onSubmit={onSubmit}>
      <input name="title" placeholder="Title" defaultValue={item?.title || ""} required />
      <input name="description" placeholder="Description" defaultValue={item?.description || ""} required />
      <input name={isReward ? "required_points" : "points"} type="number" min="1" placeholder="Hasanat" defaultValue={item?.required_points || item?.points || ""} required />
      {!isReward && (
        <>
          <input name="duration_minutes" type="number" min="0" placeholder="Timer minutes" defaultValue={item?.duration_minutes || 0} />
          <select name="subject" defaultValue={item?.subject || "Reading"}>
            {["Math", "German", "English", "Quran", "Reading", "Fitness", "Housework", "Teamwork", "Sports & Physical Development"].map((subject) => <option key={subject}>{subject}</option>)}
          </select>
          <select name="task_type" defaultValue={item?.task_type || "standard"}>
            <option value="standard">Standard task</option>
            <option value="multiple_choice">Multiple choice</option>
            <option value="fill_blank">Fill in the blank</option>
            <option value="true_false">True/false</option>
            <option value="matching">Matching activity</option>
            <option value="short_answer">Short answer</option>
            <option value="picture_vocabulary">Picture vocabulary</option>
          </select>
          <input name="interactive_prompt" placeholder="Interactive question or prompt" defaultValue={item?.task_data?.prompt || ""} />
          <textarea name="interactive_options" placeholder="Options, one per line" defaultValue={(item?.task_data?.options || []).join("\n")} />
          <textarea name="interactive_pairs" placeholder="Matching pairs, one per line: word = meaning" defaultValue={(item?.task_data?.pairs || []).map((pair) => pair.join(" = ")).join("\n")} />
          <div className="form-row">
            <input name="interactive_image" placeholder="Picture emoji or URL" defaultValue={item?.task_data?.image || ""} />
            <input name="interactive_placeholder" placeholder="Answer placeholder" defaultValue={item?.task_data?.placeholder || ""} />
          </div>
          <select name="frequency" defaultValue={item?.frequency || "daily"}>
            <option>daily</option>
            <option>weekly</option>
            <option>one-time</option>
          </select>
          <label className="check"><input name="show_weekdays" type="checkbox" defaultChecked={item ? Boolean(item.show_weekdays) : true} /> Weekdays</label>
          <label className="check"><input name="show_weekends" type="checkbox" defaultChecked={Boolean(item?.show_weekends)} /> Weekends</label>
          <div className="day-checkboxes">
            {[
              ["Sun", 0], ["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6]
            ].map(([label, day]) => (
              <label className="check" key={day}><input name={`day_${day}`} type="checkbox" defaultChecked={item ? Boolean(item[`day_${day}`]) : day > 0 && day < 6} /> {label}</label>
            ))}
          </div>
          <input name="task_date" type="date" defaultValue={item?.task_date || ""} />
          <label className="check"><input name="proof_required" type="checkbox" defaultChecked={Boolean(item?.proof_required)} /> Proof</label>
          <label className="check"><input name="requires_approval" type="checkbox" defaultChecked={Boolean(item?.requires_approval)} /> Approval</label>
        </>
      )}
      <button>{item ? "Update" : "Add"}</button>
    </form>
  );
}

function ReportView({ reports }) {
  return (
    <div className="reports">
      <p><strong>Best activity:</strong> {reports.best?.title || "Not enough data yet"}</p>
      <p><strong>Missed today:</strong> {reports.missed.map((item) => item.title).join(", ") || "None"}</p>
      <h3>Weekly Hasanat</h3>
      {reports.weekly.map((row) => <Bar key={row.week} label={row.week} value={row.points} />)}
      <h3>Monthly Hasanat</h3>
      {reports.monthly.map((row) => <Bar key={row.month} label={row.month} value={row.points} />)}
      <h3>Sports & Physical Development</h3>
      <p><strong>Today:</strong> {reports.sports?.today_completed || 0}/{reports.sports?.today_total || 0} completed · {reports.sports?.completion_rate || 0}%</p>
      <p><strong>Weekly:</strong> {reports.sports?.weekly_completed || 0} activities · <strong>Monthly:</strong> {reports.sports?.monthly_completed || 0} activities</p>
      <p><strong>Exercise time:</strong> {reports.sports?.total_time || 0} minutes · <strong>Sports Hasanat:</strong> {reports.sports?.total_hasnat || 0}</p>
      {(reports.sportsTrends || []).slice(0, 7).map((row) => <Bar key={row.date} label={row.date} value={row.completed} />)}
      <h3>Redeemed rewards</h3>
      {reports.redeemed.length === 0 ? <p className="muted">No rewards redeemed yet.</p> : reports.redeemed.map((row) => <p key={row.redeemed_at}>{row.title} · {row.points_spent} Hasanat</p>)}
    </div>
  );
}

function Panel({ title, children }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}

function Stat({ label, value, icon, pulse, power = 1 }) {
  return <article className="stat"><span>{label}</span><strong><span className={pulse ? `stat-icon pulse-fire fire-power-${power}` : "stat-icon"}>{icon}</span>{value}</strong></article>;
}

function Progress({ value }) {
  return <div className="progress"><span style={{ width: `${value}%` }} /></div>;
}

function QuranDashboardProgress({ quran }) {
  if (!quran?.surahs?.length) return null;
  return (
    <div className="quran-dashboard-progress" aria-label="Quran Surah progress on dashboard">
      <div>
        <strong>Quran Surah Progress</strong>
        <span>{quran.completed_surahs}/{quran.total_surahs} Surahs · {quran.total_memorized_verses}/{quran.total_verses} verses · {quran.progress_percentage}%</span>
      </div>
      <Progress value={quran.progress_percentage} />
      <div className="quran-surah-milestones">
        {quran.surahs.map((surah) => (
          <span
            className={surah.status === "Completed" ? "done" : surah.status === "In Progress" ? "active" : ""}
            key={surah.id}
            title={`${surah.id}. ${surah.surah_name}: ${surah.progress_percentage}%`}
            aria-label={`${surah.surah_name}: ${surah.status}`}
          />
        ))}
      </div>
    </div>
  );
}

function MilestoneProgress({ entries, value }) {
  const milestones = entries || [];
  return (
    <div className="milestone-progress" style={{ "--milestone-count": Math.max(1, milestones.length) }} aria-label="Today’s activity milestones">
      <Progress value={value} />
      <div className="milestone-track">
        {milestones.map((entry, index) => {
          const complete = journeyEntryComplete(entry);
          return (
            <span
              className={complete ? "milestone done" : "milestone"}
              key={entry.key}
              title={entry.title}
              aria-label={`${entry.title}: ${complete ? "completed" : "not completed"}`}
            >
              {complete ? "✓" : index + 1}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Bar({ label, value }) {
  return <div className="bar"><span>{label}</span><Progress value={Math.min(100, value)} /><strong>{value}</strong></div>;
}

function Loader() {
  return <main className="dashboard"><div className="loader">Loading...</div></main>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
