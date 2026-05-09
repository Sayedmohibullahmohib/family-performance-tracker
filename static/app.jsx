const { useEffect, useState } = React;

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
  return avatarIcons[value] || value || "🐱";
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
      <section className="login-panel">
        <div className="brand-mark">⭐</div>
        <h1>Kids Performance Tracker</h1>
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
  const [surpriseOpen, setSurpriseOpen] = useState(false);
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
    setSurpriseOpen(false);
    setDailyComplete(false);
  }, [data?.date]);

  useEffect(() => {
    if (!data?.settings?.seasonal_theme) return;
    document.body.dataset.seasonalTheme = data.settings.seasonal_theme;
  }, [data?.settings?.seasonal_theme]);

  if (!data) return <Loader />;

  const level = levelFor(data.points.total);
  const completedToday = Number(data.summary?.completed_today || 0);

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
    if (nextCompletedToday >= 3 && completedToday < 3) {
      setMessage("Mystery box is ready!");
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

  async function openTreasure() {
    try {
      const next = await api("/api/treasure/open", { method: "POST", body: JSON.stringify({}) });
      setData(next);
      celebrate("reward", next.treasure?.chest?.message || "Treasure opened!");
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function chooseAvatar(avatar) {
    const next = await api("/api/my-avatar", { method: "PUT", body: JSON.stringify({ avatar }) });
    setData(next);
    setMessage("Nice choice!");
  }

  async function openDailySurprise() {
    try {
      const next = await api("/api/daily-surprise/open", { method: "POST", body: JSON.stringify({}) });
      setData(next);
      setSurpriseOpen(true);
      setMessage(next.dailySurpriseMessage || "Daily surprise opened!");
      celebrate("reward", next.dailySurpriseMessage || "Daily surprise!");
    } catch (err) {
      setMessage(err.message);
    }
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

  async function openMystery() {
    try {
      const next = await api("/api/mystery/open", { method: "POST", body: JSON.stringify({}) });
      setData(next);
      setSurpriseOpen(true);
      celebrate("reward", next.mysteryBox?.box?.message || "Mystery box opened!");
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function usePowerUp(powerUp) {
    try {
      const next = await api("/api/power-ups/use", { method: "POST", body: JSON.stringify({ powerUpId: powerUp.id }) });
      setData(next);
      const message = powerUp.power_type === "instant_points" ? "Bonus coins added!" : `${powerUp.title} is active!`;
      setMessage(message);
      celebrate("reward", message);
    } catch (err) {
      setMessage(err.message);
    }
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
      if (next.earlyBirdMessage?.includes("20 points")) {
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
      if (next.quizFeedback?.startsWith("Correct")) {
        setPointPulse(true);
        setDiamondBurst(true);
        celebrate("success", "Quiz complete!");
        setTimeout(() => setPointPulse(false), 900);
        setTimeout(() => setDiamondBurst(false), 1400);
      }
    } catch (err) {
      setMessage(err.message);
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
  const totalToday = Math.max(1, Number(data.summary?.daily_target || data.activities.length || 1));
  const progressPercent = Math.min(100, Math.round((completedToday / totalToday) * 100));
  const nextReward = (data.rewards || []).find((reward) => reward.status !== "available") || data.rewards?.[0];
  const nudgeMessages = buildNudges(data, nextActivity, nextReward);
  const progressMilestones = buildJourneyEntries(data.activities);

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
      {dailyComplete && (
        <DailyCompletionOverlay
          data={data}
          avatar={avatarFor(data.child.avatar)}
          reward={nextReward}
          progress={progressToReward}
          onRewards={() => {
            setDailyComplete(false);
            document.getElementById("badges-rewards-panel")?.setAttribute("open", "");
            document.getElementById("rewards-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
                <span className={`hero-avatar level-${Math.min(5, level.level)}`}>{avatarFor(data.child.avatar)}</span>
                <small>Choose your icon</small>
              </summary>
              <div className="avatar-picker">
                {avatarChoices.map((avatar) => (
                  <button
                    className={avatarFor(data.child.avatar) === avatar ? "selected" : ""}
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
          <span>Total points · Level {level.level}</span>
          <strong className={pointPulse ? "point-bounce" : ""}><CoinIcon />{data.points.total}</strong>
          <Progress value={progressToReward} />
        </div>
      </section>

      <PraiseBanner messages={data.praiseMessages || []} onSeen={markPraiseSeen} />

      <section className="stats currency-strip" aria-label="Game currencies">
        <Stat label="XP" value={data.wallet?.xp || data.points.total} icon="⚡" />
        <Stat label="Coins" value={data.wallet?.coins || data.points.total} icon={<CoinIcon />} />
        <Stat label="Gems" value={data.wallet?.gems || 0} icon="💠" />
        <Stat label="Keys" value={data.wallet?.keys || 0} icon="🗝️" />
        <Stat label="Tickets" value={data.wallet?.treasure_tickets || 0} icon="🎟️" />
      </section>

      <section className="game-grid compact-grid">
        <DailySurpriseBox surprise={data.dailySurprise} onOpen={openDailySurprise} />
        <PetCompanion pet={data.pet} onChoose={choosePet} />
        <MoodCheckIn mood={data.mood} onMood={saveMood} />
        <StorylineCard completed={completedToday} total={totalToday} />
      </section>

      <EarlyBirdCard earlyBird={data.earlyBird} onCheckIn={checkEarlyBird} />

      <section className="today-progress-card" aria-label="Today’s progress">
        <div>
          <p className="eyebrow">Today’s Progress</p>
          <h2>{completedToday} / {totalToday} activities</h2>
          <p>{progressMessage(completedToday, totalToday)}</p>
        </div>
        <strong>{progressPercent}%</strong>
        <MilestoneProgress entries={progressMilestones} value={progressPercent} />
        <QuranDashboardProgress quran={data.quran} />
      </section>

      <section className="nudge-list" aria-label="Helpful reminders">
        {nudgeMessages.map((item) => <p key={item}>{item}</p>)}
      </section>

      <section className="stats progress-summary" aria-label="My progress">
        <Stat label="Daily points" value={data.points.daily} icon={<CoinIcon />} />
        <Stat label="Weekly points" value={data.points.weekly} icon={<CoinIcon />} />
        <Stat label="Day streak" value={`${data.streak} ${data.streak === 1 ? "day" : "days"}`} icon="🔥" pulse={data.streak > 0} power={Math.min(3, Math.floor(data.streak / 3) + 1)} />
        <Stat label="Level" value={level.level} icon="🏆" />
      </section>

      {data.activityOfTheDay && (
        <section className={data.todayChallengeCompleted ? "daily-challenge earned" : "daily-challenge"}>
          <div className="flag-pole" aria-hidden="true" />
          <div className="challenge-icon">{data.todayChallengeCompleted ? "✅" : icons[data.activityOfTheDay.title] || "🎯"}</div>
          <div>
            <p className="eyebrow">Activity of the day</p>
            <h2>{data.activityOfTheDay.title}</h2>
            <p>{data.todayChallengeCompleted ? "Completed today. Great job!" : `Complete 5 Activities of the Day to earn Badge of the Week. Progress: ${challengeProgress}/5`}</p>
          </div>
        </section>
      )}

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

      <BossBattlePanel completed={completedToday} quizzes={data.quizzes || []} />
      <QuizPanel quizzes={data.quizzes || []} onSubmit={submitQuiz} />

      <section className="dashboard-section" id="today-tasks">
        <div className="section-heading">
          <p className="eyebrow">Today’s Tasks</p>
          <h2>Learning Journey</h2>
        </div>
        <ActivityJourney activities={data.activities} timerScope={`${data.child.id}-${data.date}`} onComplete={complete} />
      </section>

      <CollapsibleSection title="My Progress" defaultOpen>
        <section className="game-grid compact-grid">
        <MissionBoard missions={data.missions} />
          <AdventureMap level={level} totalPoints={data.points.total} />
        </section>
      </CollapsibleSection>

      <CollapsibleSection title="Power-Ups & Boxes">
        <section className="game-grid compact-grid">
          <PowerUpPanel powerUps={data.powerUps} onUse={usePowerUp} />
          <MysteryBox box={data.mysteryBox} openedNow={surpriseOpen} onOpen={openMystery} />
          <TreasureChest treasure={data.treasure} onOpen={openTreasure} />
        </section>
      </CollapsibleSection>

      <CollapsibleSection title="Family & Ranking">
        <section className="split secondary-split">
          <div>
        <FamilyQuest quest={data.familyQuest} />
            <ParentChallengeBoard challenges={data.parentChallenges} />
          </div>
          <div>
            <Leaderboard children={data.leaderboard} currentChildId={data.child.id} />
            <ProgressRace children={data.leaderboard} currentChildId={data.child.id} />
            <RedemptionBoard children={data.redemptionBoard} currentChildId={data.child.id} />
          </div>
        </section>
      </CollapsibleSection>

      <CollapsibleSection id="badges-rewards-panel" title="Badges & Rewards">
        <section className="split secondary-split">
          <div id="rewards-section">
          <AchievementsPanel achievements={data.achievements} badges={data.badges} futureBadges={data.futureBadges} />
          <BadgeCollection badges={data.badges} futureBadges={data.futureBadges} />
          </div>
          <div>
          <h2 className="section-title">🎁 Reward Shop</h2>
          <div className="reward-list">
            {data.rewards.map((reward) => (
              <article className={`reward ${reward.status}`} key={reward.id}>
                <div className="reward-icon">{rewardIcons[reward.title] || rewardIcons.default}</div>
                <div>
                  <h3>{reward.title} <span className="rarity-label">{reward.required_points >= 150 ? "legendary" : reward.required_points >= 90 ? "rare" : "common"}</span> {reward.is_discounted ? <span className="discount-badge">{reward.discount_percent}% off</span> : null}</h3>
                  <p>{reward.description}</p>
                  {reward.is_discounted ? (
                    <strong><span className="old-price">{reward.required_points}</span><CoinIcon />{reward.discounted_points} points · {reward.status}</strong>
                  ) : (
                    <strong><CoinIcon />{reward.required_points} points · {reward.status}</strong>
                  )}
                  <RewardProgress reward={reward} points={data.points.total} />
                </div>
                <button disabled={reward.status !== "available"} onClick={() => redeem(reward)}>{reward.status === "requested" ? "Requested" : "Request"}</button>
              </article>
            ))}
          </div>
        </div>
      </section>
      </CollapsibleSection>
      <KidBottomNav />
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
  return (
    <div className="activity-celebration-modal" role="dialog" aria-modal="true" aria-label="Activity completed">
      <div>
        <span>🎉</span>
        <p className="eyebrow">Mission update</p>
        <h2>{details.title}</h2>
        <p>{details.message}</p>
        <div className="complete-stats">
          <span><strong>{details.points}</strong> coins</span>
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

function DailySurpriseBox({ surprise, onOpen }) {
  const opened = surprise?.opened;
  return (
    <section className={opened ? "game-card daily-surprise opened" : "game-card daily-surprise ready"}>
      <div className="game-card-head">
        <span>{opened ? "🎊" : "🎁"}</span>
        <div>
          <p className="eyebrow">Daily surprise</p>
          <h2>{opened ? "Opened today" : "Open today’s box"}</h2>
        </div>
      </div>
      <p>{opened ? surprise.box?.message : "Login reward: coins, gems, keys, tickets, or a power-up."}</p>
      <button disabled={opened} onClick={onOpen}>{opened ? "Opened" : "Open surprise"}</button>
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

function StorylineCard({ completed, total }) {
  const percent = Math.min(100, Math.round((completed / Math.max(1, total)) * 100));
  return (
    <section className="game-card story-card">
      <div className="game-card-head">
        <span>🏰</span>
        <div>
          <p className="eyebrow">Storyline</p>
          <h2>TT Heroes Kingdom</h2>
        </div>
      </div>
      <p>Help the TT Heroes complete learning missions and unlock the Kingdom of Learning.</p>
      <Progress value={percent} />
    </section>
  );
}

function KidBottomNav() {
  const items = [
    ["Tasks", "today-tasks", "🧭"],
    ["Rewards", "badges-rewards-panel", "🎁"],
    ["Top", "", "⬆️"]
  ];
  return (
    <nav className="kid-bottom-nav" aria-label="Kid dashboard quick navigation">
      {items.map(([label, id, icon]) => (
        <button
          key={label}
          onClick={() => id ? document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }) : window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <span>{icon}</span>{label}
        </button>
      ))}
    </nav>
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

function BossBattlePanel({ completed, quizzes = [] }) {
  const ready = Number(completed || 0) >= 3 && quizzes.length > 0;
  return (
    <section className={ready ? "boss-battle ready" : "boss-battle"} aria-label="Boss battle quiz">
      <div>
        <p className="eyebrow">Boss Battle Quiz</p>
        <h2>{ready ? "Boss battle unlocked!" : `${Math.max(0, 3 - Number(completed || 0))} tasks to unlock boss battle`}</h2>
        <p>{ready ? "Answer a quiz mission to defeat the challenge and win rewards." : "Complete 3 activities, then try a quiz challenge."}</p>
      </div>
      <span>{ready ? "🐲" : "🔒"}</span>
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

function ActivityJourney({ activities, timerScope, onComplete }) {
  const entries = buildJourneyEntries(activities);
  const currentKey = entries.find((entry) => !journeyEntryComplete(entry))?.key;

  return (
    <div className="journey-list">
      {entries.map((entry, index) => {
        const complete = journeyEntryComplete(entry);
        const current = entry.key === currentKey;
        return (
          <div
            className={`journey-step ${complete ? "complete" : ""} ${current ? "current" : ""} ${!complete && !current ? "later" : ""}`}
            id={entry.key}
            key={entry.key}
          >
            <div className="step-marker" aria-label={`Step ${index + 1}`}>{complete ? "✓" : index + 1}</div>
            <div className="step-content">
              <p className="eyebrow">Step {index + 1}</p>
              {entry.type === "prayer" ? (
                <PrayerStepCard entry={entry} onComplete={onComplete} />
              ) : (
                <ActivityCard activity={entry.activity} timerScope={timerScope} onComplete={onComplete} />
              )}
            </div>
          </div>
        );
      })}
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
          <span className="points-pill"><CoinIcon />{points} pts</span>
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
      <small>{reward.status === "available" ? "Unlocked" : `Almost there. ${remaining} more points needed.`}</small>
      <span>{current} / {cost} points</span>
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
    if (remaining > 0 && remaining <= 25) nudges.push(`Only ${remaining} points needed for ${nextReward.title}.`);
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
          <p>{checked ? checked.status === "early" ? `You checked in at ${checked.checkin_time} and earned ${checked.awarded_points} points.` : `You checked in at ${checked.checkin_time}. Tomorrow is a new chance.` : `Press before ${earlyBird?.cutoff || "07:00"} to earn ${earlyBird?.bonus_points || 20} points.`}</p>
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
            <small>{child.checkin_time} · {child.status === "early" ? `+${child.awarded_points} pts` : "late"}</small>
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
          <p>Earn 1 point for every verse, 20 bonus points for a Surah, and 100 bonus points for a Juz.</p>
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
            {reward.unlocked ? "🔓" : "🔒"} {reward.title} · {reward.points} pts
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
                <small>{surah.revelation_place} · {surah.total_verses} verses · {surah.total_verses} points {surah.is_juz_amma ? "· Juz Amma" : ""}</small>
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
        <p><strong>Points earned today:</strong> {todayPage.points_earned || 0}</p>
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
        <Stat label="Qur’an points" value={hifz.total_quran_points} icon={<CoinIcon />} />
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
          <span><strong>{data.points.daily}</strong> points today</span>
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

function MysteryBox({ box, openedNow, onOpen }) {
  box = box || { ready: false, opened: false, needed: 3, completed: 0, box: null };
  const opened = box.opened || openedNow;
  return (
    <section className={`${box.ready ? "game-card mystery-box ready" : "game-card mystery-box"} ${opened ? "opened" : ""}`}>
      <div className="game-card-head">
        <span>{opened ? "🎊" : "❓"}</span>
        <div>
          <p className="eyebrow">Mystery box</p>
          <h2>{opened ? "Opened today" : box.ready ? "Ready to open" : `${box.completed || 0}/3 activities`}</h2>
        </div>
      </div>
      <p>{opened ? box.box?.message : box.ready ? "Open it to find points or a power-up." : `Complete ${box.needed || 3} more to unlock a surprise.`}</p>
      <button disabled={!box.ready || opened} onClick={onOpen}>{opened ? "Opened" : "Open box"}</button>
    </section>
  );
}

function PowerUpPanel({ powerUps = [], onUse }) {
  const powerIcon = {
    point_bonus: "⚡",
    reward_discount: "🏷️",
    instant_points: "💎"
  };
  return (
    <section className="game-card power-up-panel">
      <div className="game-card-head">
        <span>⚡</span>
        <div>
          <p className="eyebrow">Power-ups</p>
          <h2>{powerUps.length ? `${powerUps.length} ready` : "None yet"}</h2>
        </div>
      </div>
      {powerUps.length === 0 ? (
        <p>Open mystery boxes to collect power-ups.</p>
      ) : (
        <div className="power-up-list">
          {powerUps.map((powerUp) => (
            <article className={powerUp.status === "active" ? "power-up active" : "power-up"} key={powerUp.id}>
              <span>{powerIcon[powerUp.power_type] || "✨"}</span>
              <div>
                <strong>{powerUp.title}</strong>
                <small>{powerUp.description}</small>
              </div>
              <button disabled={powerUp.status === "active"} onClick={() => onUse(powerUp)}>{powerUp.status === "active" ? "Active" : "Use"}</button>
            </article>
          ))}
        </div>
      )}
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

function TreasureChest({ treasure, onOpen }) {
  treasure = treasure || { ready: false, opened: false, needed: 3, chest: null };
  return (
    <section className={`${treasure.ready ? "game-card treasure-card ready" : "game-card treasure-card"} ${treasure.opened ? "opened" : ""}`}>
      <div className="game-card-head">
        <span>{treasure.opened ? "💎" : "🧰"}</span>
        <div>
          <p className="eyebrow">Treasure chest</p>
          <h2>{treasure.opened ? "Opened today" : treasure.ready ? "Ready!" : `${treasure.needed} missions left`}</h2>
        </div>
      </div>
      <p>{treasure.opened ? treasure.chest?.message : treasure.ready ? "Open your chest and discover your bonus." : "Complete 3 daily missions to unlock it."}</p>
      <button disabled={!treasure.ready || treasure.opened} onClick={onOpen}>{treasure.opened ? "Opened" : "Open chest"}</button>
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
          <small>{challenge.progress}/{challenge.target_count} · bonus {challenge.bonus_points} points</small>
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
  const taskType = activity.task_type || "standard";
  const taskData = activity.task_data || {};
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
    <article className={`activity ${activity.status} subject-${String(activity.subject || "general").toLowerCase()} ${activity.is_daily_challenge ? "daily-pick" : ""}`}>
      <ActivityMotionIcon activity={activity} />
      <div className="activity-body">
        <div className="row">
          <h3>{activity.title} {activity.is_daily_challenge ? <span className="daily-badge">Activity of the day</span> : null}</h3>
          <span className="points-pill"><CoinIcon />{activity.points} pts</span>
        </div>
        <p>{activity.description}</p>
        <button className="narrate-button ghost" type="button" onClick={narrateTask} aria-label={`Read ${activity.title} instructions aloud`}>Read task</button>
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
                <span>{prayerIcons[prayer]} {prayer} · {activity.prayer_points || 10} pts</span>
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
            <span className="leader-avatar">{avatarFor(child.avatar)}</span>
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
            <span>{avatarFor(child.avatar)}</span>
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
            <span className="leader-avatar">{avatarFor(child.avatar)}</span>
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

function BadgeCollection({ badges, futureBadges }) {
  return (
    <section className="leaderboard badges-board">
      <h2 className="section-title">🏅 Badge Collection</h2>
      {badges.length === 0 ? (
        <p className="muted">No badges yet. Complete special challenges to collect them.</p>
      ) : (
        <div className="badge-grid">
          {badges.slice(0, 8).map((badge) => (
            <article className="badge-card" key={badge.id}>
              <span>{badge.icon}</span>
              <strong>{badge.title}</strong>
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
            <strong>{badge.title}</strong>
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
    const taskData = {
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
        <Stat label={`${selectedChildName || "Child"} daily`} value={dashboard.points.daily} />
        <Stat label="Weekly" value={dashboard.points.weekly} />
        <Stat label="Total" value={dashboard.points.total} />
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
                <span>{item.reward_title} · {item.points_spent} pts</span>
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
            <p className="muted">Choose which activities are shown for {selectedChildName}.</p>
            <div className="mini-list">
              {admin.activities.map((activity) => {
                const assignment = admin.activityAssignments.find((item) => Number(item.child_id) === Number(childId) && Number(item.activity_id) === Number(activity.id));
                const enabled = assignment ? Boolean(assignment.enabled) : true;
                return (
                  <div key={activity.id}>
                    <span>{activity.title}</span>
                    <button className={enabled ? "" : "ghost"} onClick={() => toggleChildActivity(activity)}>{enabled ? "Assigned" : "Hidden"}</button>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel title="Activities">
            <EditorForm item={editingActivity} type="activity" onSubmit={saveActivity} />
            <div className="mini-list">
              {admin.activities.map((activity) => (
                <div key={activity.id}>
                  <span>{activity.title} · {activity.points} pts · {activity.show_weekdays ? "weekdays" : ""}{activity.show_weekdays && activity.show_weekends ? " + " : ""}{activity.show_weekends ? "weekends" : ""}</span>
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
          <Panel title="Send Praise Message">
            <PraiseForm childName={selectedChildName} onSubmit={sendPraise} />
            <PraiseList messages={admin.praiseMessages || []} />
          </Panel>
          <Panel title="Mood Check-ins">
            <MoodReport moods={admin.moods || []} />
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
                  <span>{challenge.title} · {challenge.target_count} activities · {challenge.bonus_points} bonus</span>
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
                  <span>{reward.title} · {reward.required_points} pts</span>
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
              <span><strong>{row.daily_points}</strong> daily points</span>
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
          <Stat label="Qur’an points" value={hifz.total_quran_points} />
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
      <input name="points" type="number" min="1" placeholder="Points" defaultValue="5" required />
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
            <span>{activity.task_date ? `Today-only: ${activity.task_date}` : `${activity.points} pts · ${activity.frequency}`}</span>
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
        <input name="bonus_points" type="number" min="0" defaultValue="10" placeholder="Bonus points" />
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
        {["Math", "German", "English", "Quran", "Reading", "Fitness", "Housework", "Teamwork"].map((subject) => <option key={subject}>{subject}</option>)}
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
      <input name={isReward ? "required_points" : "points"} type="number" min="1" placeholder="Points" defaultValue={item?.required_points || item?.points || ""} required />
      {!isReward && (
        <>
          <input name="duration_minutes" type="number" min="0" placeholder="Timer minutes" defaultValue={item?.duration_minutes || 0} />
          <select name="subject" defaultValue={item?.subject || "Reading"}>
            {["Math", "German", "English", "Quran", "Reading", "Fitness", "Housework", "Teamwork"].map((subject) => <option key={subject}>{subject}</option>)}
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
      <h3>Weekly points</h3>
      {reports.weekly.map((row) => <Bar key={row.week} label={row.week} value={row.points} />)}
      <h3>Monthly points</h3>
      {reports.monthly.map((row) => <Bar key={row.month} label={row.month} value={row.points} />)}
      <h3>Redeemed rewards</h3>
      {reports.redeemed.length === 0 ? <p className="muted">No rewards redeemed yet.</p> : reports.redeemed.map((row) => <p key={row.redeemed_at}>{row.title} · {row.points_spent} points</p>)}
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
