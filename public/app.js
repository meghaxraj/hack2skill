/* ==========================================================================
   Aura Controller Script - Multi-User Support & .env API Key Integrations
   ========================================================================== */

// Local state representation
let studentProfile = {
  name: "Student",
  exam: "JEE Main & Advanced",
  target_date: "",
  sleep_goal_hours: 7.0
};

let journalLogs = [];
let chatLogs = [];
let activeScreen = "dashboard";
let activeCopingSub = "breathing";

// Global Chart References
let lineChartInstance = null;
let barChartInstance = null;

// Timer References
let breathingInterval = null;
let pomodoroInterval = null;
let pomodoroTimeRemaining = 1500; // default 25m
let pomodoroActive = false;
let pomodoroMode = "focus";

// Speech synthesis reference
const synth = window.speechSynthesis;

// Motivational quotes bank
const MOTIVATIONAL_QUOTES = [
  "Your worth is not measured by mock scores, but by your courage and resilience.",
  "An exam is just a test of a syllabus, never a test of your potential.",
  "Rest is not laziness; it is a prerequisite for long-term memory retention.",
  "Mock exams are diagnostic checkpoints for errors, not final verdicts of your intellect.",
  "Take a deep breath. You have solved complex problems before, and you will solve them again.",
  "IIT, NEET, or UPSC are pathways, not the only destination. Your peace of mind is vital.",
  "One low mock test score is simply a map showing where to focus revision tomorrow.",
  "Focus on progress, not perfection. A 1% improvement today compounds dramatically.",
  "Compare yourself only to who you were yesterday, not to other students' highlight reels.",
  "Studying 14 hours with a sluggish brain is less effective than 6 hours with a rested mind.",
  "Self-compassion is your secret study weapon. Be kind to your working memory today.",
  "Success is the sum of small, consistent habits practiced day in and day out."
];

// Affirmations Bank
const AFFIRMATIONS = [
  "My mock scores are diagnostic checkpoints, not a definition of my intelligence.",
  "I am doing the best I can with the energy I have today, and that is enough.",
  "My value as a person is completely separate from my academic ranks.",
  "I choose to release peer comparison. I am writing my own success timeline.",
  "It is safe to close my books. Rest heals my brain and secures my retention.",
  "I am building resilience and problem-solving skills that will last a lifetime.",
  "I do not have to carry parental expectations alone. I am studying for my own growth.",
  "Every error I make in mock tests is one less mistake I will make in the final exam.",
  "I am worthy of peace, health, and happiness regardless of my examination results."
];

let activeAffirmationIndex = 0;

// Helper to construct headers with X-User-Id
function getAuthHeaders() {
  const username = localStorage.getItem('aura_username') || 'student';
  return {
    'Content-Type': 'application/json',
    'X-User-Id': username
  };
}

// ------------------------------------
// INITIALIZATION
// ------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initApp();
  setupEventListeners();
});

async function initApp() {
  const username = localStorage.getItem('aura_username');
  
  if (!username) {
    // Show login overlay, hide app
    document.getElementById("login-overlay").classList.remove("hidden");
    document.getElementById("main-app-container").classList.add("hidden");
    await loadExistingUsersDropdown();
    return;
  }
  
  // Hide login overlay, show app
  document.getElementById("login-overlay").classList.add("hidden");
  document.getElementById("main-app-container").classList.remove("hidden");

  await fetchProfile();
  await fetchJournals();
  await fetchChats();
  await checkAPIKeyStatus();
  
  // Calculate countdown ticker
  updateCountdown();
  
  // Display initial quote
  cycleMotivationQuote();
  
  // Load dashboard widgets
  updateDashboardWidgets();
}

// Populate user selector dropdown on landing screen
async function loadExistingUsersDropdown() {
  const dropdown = document.getElementById("login-user-select");
  const usersGroup = document.getElementById("existing-users-group");
  dropdown.innerHTML = "";
  
  try {
    const res = await fetch('/api/users');
    if (res.ok) {
      const usersList = await res.json();
      if (usersList.length > 0) {
        usersGroup.style.display = "block";
        usersList.forEach(user => {
          const opt = document.createElement("option");
          opt.value = user.id;
          opt.textContent = `${user.name} (${user.id})`;
          dropdown.appendChild(opt);
        });
      } else {
        // No users in DB, hide dropdown select group
        usersGroup.style.display = "none";
      }
    }
  } catch (err) {
    console.error("Error loading registered users list:", err);
    usersGroup.style.display = "none";
  }
}

// ------------------------------------
// NETWORKING & API ACTIONS
// ------------------------------------
async function fetchProfile() {
  try {
    const res = await fetch('/api/profile', {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      studentProfile = await res.json();
      
      // Update UI elements holding profile text
      document.querySelectorAll(".student-name-placeholder").forEach(el => {
        el.textContent = studentProfile.name || "Student";
      });
      document.getElementById("sidebar-student-name").textContent = studentProfile.name || "Student";
      
      let shortExam = studentProfile.exam || "Exam";
      if (shortExam.length > 18) shortExam = shortExam.substring(0, 18) + "...";
      document.getElementById("sidebar-student-target").textContent = `${shortExam} Prep`;
      
      // Prefill settings form fields
      document.getElementById("settings-name").value = studentProfile.name || "";
      document.getElementById("settings-exam").value = studentProfile.exam || "JEE Main & Advanced";
      document.getElementById("settings-exam-date").value = studentProfile.target_date || "";
      document.getElementById("settings-sleep-goal").value = studentProfile.sleep_goal_hours || 7;
    }
  } catch (err) {
    console.error("Error fetching profile details:", err);
  }
}

async function fetchJournals() {
  try {
    const res = await fetch('/api/journals', {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      journalLogs = await res.json();
    }
  } catch (err) {
    console.error("Error fetching journals:", err);
  }
}

async function fetchChats() {
  try {
    const res = await fetch('/api/chats', {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      chatLogs = await res.json();
      renderChatMessages();
    }
  } catch (err) {
    console.error("Error fetching chat logs:", err);
  }
}

// Check API key configuration status from server env
async function checkAPIKeyStatus() {
  const statusBox = document.getElementById("settings-key-status-box");
  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      const data = await res.json();
      if (data.has_api_key) {
        statusBox.className = "api-integration-card active";
        statusBox.innerHTML = `<i class="fa-solid fa-circle-check"></i> Connected to Gemini API successfully. Server .env key is configured.`;
      } else {
        statusBox.className = "api-integration-card inactive";
        statusBox.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Offline Fallback Engine Active (Rule-based student-psychology analytics). To unlock Gemini cognitive reasoning, configure GEMINI_API_KEY in the server-side .env file.`;
      }
    }
  } catch (err) {
    console.error("Error checking API key status:", err);
  }
}

// ------------------------------------
// UI SCREEN CONTROLS
// ------------------------------------
function setupEventListeners() {
  // Login / Switch User Action
  const btnLoginSubmit = document.getElementById("btn-login-submit");
  btnLoginSubmit.addEventListener("click", () => {
    const textInput = document.getElementById("login-username-input").value.trim();
    const dropSelect = document.getElementById("login-user-select").value;
    
    let selectedUsername = "";
    if (textInput !== "") {
      // Create new profile with sanitized input ID
      selectedUsername = textInput.toLowerCase().replace(/[^a-z0-9]/g, '');
    } else if (dropSelect) {
      // Select existing profile
      selectedUsername = dropSelect;
    }
    
    if (selectedUsername === "") {
      alert("Please enter a username to proceed.");
      return;
    }
    
    localStorage.setItem('aura_username', selectedUsername);
    document.getElementById("login-username-input").value = ""; // clear text
    initApp();
  });

  // Log out / Switch User Profile
  document.getElementById("btn-switch-user").addEventListener("click", () => {
    if (confirm("Switch user? Your current progress is saved on the server.")) {
      localStorage.removeItem('aura_username');
      // Reset chart instances
      if (lineChartInstance) { lineChartInstance.destroy(); lineChartInstance = null; }
      if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
      journalLogs = [];
      chatLogs = [];
      initApp();
    }
  });

  // Sidebar navigation switching
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const target = btn.getAttribute("data-target");
      switchScreen(target);
      
      document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Settings Save Event Handler
  const btnSaveSettings = document.getElementById("btn-save-settings");
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener("click", async () => {
      const updatedProfile = {
        name: document.getElementById("settings-name").value,
        exam: document.getElementById("settings-exam").value,
        target_date: document.getElementById("settings-exam-date").value,
        sleep_goal_hours: parseFloat(document.getElementById("settings-sleep-goal").value) || 7
      };
      
      try {
        const res = await fetch('/api/profile', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(updatedProfile)
        });
        
        if (res.ok) {
          const data = await res.json();
          studentProfile = data.profile;
          
          const status = document.getElementById("settings-save-status");
          status.textContent = "Configurations Saved Successfully!";
          setTimeout(() => status.textContent = "", 3000);
          
          initApp();
        }
      } catch (err) {
        console.error("Error updating settings profile:", err);
      }
    });
  }

  // Quote Refresh trigger
  document.getElementById("btn-refresh-quote").addEventListener("click", cycleMotivationQuote);

  // Help support / manual crisis button trigger
  document.getElementById("crisis-button").addEventListener("click", () => {
    document.getElementById("crisis-modal").classList.remove("hidden");
  });
  
  document.getElementById("btn-close-crisis").addEventListener("click", () => {
    document.getElementById("crisis-modal").classList.add("hidden");
  });

  // ------------------------------------
  // JOURNAL ANALYZER LISTENERS
  // ------------------------------------
  const journalInput = document.getElementById("journal-input");
  const charCounter = document.getElementById("journal-char-count");
  
  journalInput.addEventListener("input", () => {
    charCounter.textContent = `${journalInput.value.length} characters`;
  });

  document.querySelectorAll(".starter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      journalInput.value = chip.textContent;
      charCounter.textContent = `${journalInput.value.length} characters`;
    });
  });

  // Mock Voice Input Simulator
  const btnVoice = document.getElementById("btn-voice-input");
  const voiceStatus = document.getElementById("voice-status-text");
  let voiceInterval = null;
  const MOCK_CONFESSIONS = [
    "I'm feeling incredibly anxious today. The mock test result was 45%. Everyone else in my batch is scoring in the 90s, and my dad expects me to clear the IIT JEE cut-off. I can't sleep more than 4 hours because the formulas keep spinning in my head.",
    "Studied all day for 12 hours straight. My brain feels so fried, it is like I'm reading words but they aren't registering. I feel like an impostor who doesn't belong here. I just want to sleep but caffeine is holding me up.",
    "Took a rest break today after feeling burnt out. Tried the breathing routine and solved some papers with my study group. I'm feeling a bit more clear-headed now, sleep was also around 7 hours."
  ];

  btnVoice.addEventListener("click", () => {
    if (btnVoice.classList.contains("recording")) {
      clearInterval(voiceInterval);
      btnVoice.classList.remove("recording");
      voiceStatus.textContent = "Voice Input";
    } else {
      btnVoice.classList.add("recording");
      voiceStatus.textContent = "Listening...";
      
      let dotCount = 0;
      voiceInterval = setInterval(() => {
        dotCount = (dotCount + 1) % 4;
        voiceStatus.textContent = "Listening" + ".".repeat(dotCount);
      }, 500);

      setTimeout(() => {
        if (btnVoice.classList.contains("recording")) {
          clearInterval(voiceInterval);
          btnVoice.classList.remove("recording");
          voiceStatus.textContent = "Voice Input";
          
          const randomConfession = MOCK_CONFESSIONS[Math.floor(Math.random() * MOCK_CONFESSIONS.length)];
          journalInput.value = randomConfession;
          charCounter.textContent = `${journalInput.value.length} characters`;
        }
      }, 3000);
    }
  });

  document.getElementById("btn-analyze-journal").addEventListener("click", submitJournalAnalysis);

  document.getElementById("btn-launch-suggested-coping").addEventListener("click", () => {
    const analysisId = document.getElementById("btn-launch-suggested-coping").getAttribute("data-coping-mode") || "breathing";
    switchScreen("coping-sanctuary");
    switchCopingSubScreen(analysisId);
  });

  document.getElementById("dash-coping-action-btn").addEventListener("click", () => {
    const analysisId = document.getElementById("dash-coping-action-btn").getAttribute("data-coping-mode") || "breathing";
    switchScreen("coping-sanctuary");
    switchCopingSubScreen(analysisId);
  });

  // ------------------------------------
  // CHAT COMPANION LISTENERS
  // ------------------------------------
  const chatInput = document.getElementById("chat-user-input");
  const btnChatSend = document.getElementById("btn-chat-send");
  
  btnChatSend.addEventListener("click", sendChatMessage);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      sendChatMessage();
    }
  });

  document.querySelectorAll(".suggested-prompt-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      chatInput.value = chip.textContent;
      sendChatMessage();
    });
  });

  // Clear User logs on current workspace
  document.getElementById("btn-clear-chat").addEventListener("click", async () => {
    if (confirm("Are you sure you want to clear your local logs and reset the dashboard trends?")) {
      try {
        const res = await fetch('/api/clear-data', { 
          method: 'POST',
          headers: getAuthHeaders()
        });
        if (res.ok) {
          initApp();
        }
      } catch (err) {
        console.error("Error clearing local database:", err);
      }
    }
  });

  // ------------------------------------
  // COPING SANCTUARY LISTENERS
  // ------------------------------------
  document.querySelectorAll(".coping-tab-btn").forEach(tabBtn => {
    tabBtn.addEventListener("click", () => {
      const subTarget = tabBtn.getAttribute("data-sub");
      switchCopingSubScreen(subTarget);
    });
  });

  const btnBreathingControl = document.getElementById("btn-breathing-control");
  const btnBreathingStop = document.getElementById("btn-breathing-stop");
  
  btnBreathingControl.addEventListener("click", startBreathingSession);
  btnBreathingStop.addEventListener("click", stopBreathingSession);

  document.getElementById("btn-submit-grounding").addEventListener("click", () => {
    const inputs = document.querySelectorAll("#coping-grounding input");
    let filledCount = 0;
    inputs.forEach(inp => { if (inp.value.trim() !== "") filledCount++; });
    
    if (filledCount >= 3) {
      alert("✨ Grounding completed! Great job anchoring your mind back into the present moment. You can feel ready to restart studying now.");
      inputs.forEach(inp => inp.value = "");
      switchScreen("dashboard");
    } else {
      alert("Try entering at least 3 things in the grounding columns to establish mental focus.");
    }
  });

  document.getElementById("btn-next-affirmation").addEventListener("click", () => {
    activeAffirmationIndex = (activeAffirmationIndex + 1) % AFFIRMATIONS.length;
    document.getElementById("affirmation-text").textContent = `"${AFFIRMATIONS[activeAffirmationIndex]}"`;
  });
  
  document.getElementById("btn-prev-affirmation").addEventListener("click", () => {
    activeAffirmationIndex = (activeAffirmationIndex - 1 + AFFIRMATIONS.length) % AFFIRMATIONS.length;
    document.getElementById("affirmation-text").textContent = `"${AFFIRMATIONS[activeAffirmationIndex]}"`;
  });

  document.getElementById("btn-speak-affirmation").addEventListener("click", () => {
    if (synth.speaking) {
      synth.cancel();
      return;
    }
    const textToSpeak = AFFIRMATIONS[activeAffirmationIndex];
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 0.9;
    synth.speak(utterance);
  });

  document.getElementById("btn-pomo-start").addEventListener("click", startPomodoroTimer);
  document.getElementById("btn-pomo-pause").addEventListener("click", pausePomodoroTimer);
  document.getElementById("btn-pomo-reset").addEventListener("click", resetPomodoroTimer);

  document.querySelectorAll(".pomo-mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pomo-mode-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      pomodoroTimeRemaining = parseInt(btn.getAttribute("data-time"));
      pomodoroMode = btn.getAttribute("data-mode");
      
      let label = "Focus Loop";
      if (pomodoroMode === "short") label = "Short Rest";
      if (pomodoroMode === "long") label = "Long Rest";
      document.getElementById("pomo-mode-label").textContent = label;
      
      pausePomodoroTimer();
      updatePomodoroDisplay();
    });
  });
}

function switchScreen(screenName) {
  activeScreen = screenName;
  
  document.querySelectorAll(".screen").forEach(scr => {
    scr.classList.remove("active");
  });
  
  const targetScreen = document.getElementById(`screen-${screenName}`);
  if (targetScreen) {
    targetScreen.classList.add("active");
  }
  
  const screenTitle = document.getElementById("screen-title");
  const screenSubtitle = document.getElementById("screen-subtitle");
  
  if (screenName === "dashboard") {
    screenTitle.textContent = "Dashboard";
    screenSubtitle.textContent = "Your wellness overview";
    updateDashboardWidgets();
  } else if (screenName === "journaling") {
    screenTitle.textContent = "AI Journal Analyzer";
    screenSubtitle.textContent = "Reflect on your exam prep experience";
  } else if (screenName === "chat-companion") {
    screenTitle.textContent = "Aura Chat Companion";
    screenSubtitle.textContent = "Empathetic mentoring support";
    setTimeout(scrollToChatBottom, 100);
  } else if (screenName === "coping-sanctuary") {
    screenTitle.textContent = "Coping Room";
    screenSubtitle.textContent = "Ground yourself & restore retention focus";
  } else if (screenName === "analytics") {
    screenTitle.textContent = "Wellness Trends";
    screenSubtitle.textContent = "Discovered mental health analytics";
    setTimeout(renderCharts, 100);
  } else if (screenName === "settings") {
    screenTitle.textContent = "Settings & API Status";
    screenSubtitle.textContent = "Configure targets and view API settings";
    checkAPIKeyStatus();
  }
}

function switchCopingSubScreen(subName) {
  activeCopingSub = subName;
  
  document.querySelectorAll(".coping-tab-btn").forEach(btn => {
    btn.classList.remove("active");
    if (btn.getAttribute("data-sub") === subName) {
      btn.classList.add("active");
    }
  });

  document.querySelectorAll(".coping-sub-screen").forEach(panel => {
    panel.classList.remove("active");
  });
  
  const targetSub = document.getElementById(`coping-${subName}`);
  if (targetSub) {
    targetSub.classList.add("active");
  }

  if (subName !== "breathing") stopBreathingSession();
}

// ------------------------------------
// STUDY CALENDAR COUNTDOWN TICKER
// ------------------------------------
function updateCountdown() {
  const countdownText = document.getElementById("exam-countdown-text");
  if (!studentProfile.target_date) {
    countdownText.textContent = "Exam target date unconfigured";
    return;
  }
  
  const target = new Date(studentProfile.target_date);
  const now = new Date();
  const diffTime = target - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (isNaN(diffDays)) {
    countdownText.textContent = "Exam target date unconfigured";
  } else if (diffDays < 0) {
    countdownText.textContent = "Examination completed!";
  } else {
    countdownText.textContent = `${diffDays} days to examination`;
  }
}

// ------------------------------------
// MOTIVATIONAL QUOTES SWITCHER
// ------------------------------------
function cycleMotivationQuote() {
  const index = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
  document.getElementById("motivational-quote").textContent = `"${MOTIVATIONAL_QUOTES[index]}"`;
}

// ------------------------------------
// DASHBOARD VIEW BINDERS
// ------------------------------------
function updateDashboardWidgets() {
  const lastJournal = journalLogs.length > 0 ? journalLogs[journalLogs.length - 1] : null;

  // 1. Mood emoji display
  const moodEmoji = document.getElementById("dash-mood-emoji");
  const moodText = document.getElementById("dash-mood-text");
  const moodDesc = document.getElementById("dash-mood-desc");
  
  if (lastJournal && lastJournal.analysis) {
    const pEmotion = lastJournal.analysis.primary_emotion;
    moodText.textContent = pEmotion;
    
    const emoMap = {
      "Anxious": "😰",
      "Confident": "😎",
      "Sad": "😢",
      "Exhausted": "😴",
      "Frustrated": "😤",
      "Calm": "😌",
      "Hopeless": "🤕",
      "Neutral": "😐"
    };
    moodEmoji.textContent = emoMap[pEmotion] || "😐";
    moodDesc.textContent = `Extracted: ${new Date(lastJournal.timestamp).toLocaleDateString()}`;
  } else {
    moodEmoji.textContent = "😐";
    moodText.textContent = "Stable";
    moodDesc.textContent = "Write a journal entry to begin tracking";
  }

  // 2. Stress circular dial gauge
  const stressVal = document.getElementById("dash-stress-val");
  const stressStatus = document.getElementById("dash-stress-status");
  const stressPath = document.getElementById("stress-gauge-path");
  
  const stressScore = lastJournal && lastJournal.analysis ? lastJournal.analysis.stress_score : 0;
  stressVal.textContent = `${stressScore}%`;
  
  const offset = 188.4 - (stressScore / 100) * 188.4;
  stressPath.style.strokeDashoffset = offset;
  
  if (stressScore > 75) {
    stressStatus.innerHTML = "<span class='text-danger'>Stress level: Critical</span>";
    stressPath.style.stroke = "var(--danger)";
  } else if (stressScore > 50) {
    stressStatus.innerHTML = "<span class='text-warning'>Stress level: Elevated</span>";
    stressPath.style.stroke = "var(--warning)";
  } else if (stressScore > 0) {
    stressStatus.innerHTML = "<span class='text-success'>Stress level: Normal</span>";
    stressPath.style.stroke = "var(--success)";
  } else {
    stressStatus.innerHTML = "No measurements yet";
    stressPath.style.stroke = "var(--primary)";
  }

  // 3. Burnout early warning systems
  const burnoutVal = document.getElementById("dash-burnout-val");
  const burnoutBar = document.getElementById("dash-burnout-bar");
  const burnoutMsg = document.getElementById("dash-burnout-message");
  const burnoutFooter = document.getElementById("dash-burnout-footer");
  
  const burnoutScore = lastJournal && lastJournal.analysis ? lastJournal.analysis.burnout_risk : 0;
  burnoutVal.textContent = `${burnoutScore}%`;
  burnoutBar.style.width = `${burnoutScore}%`;
  
  if (burnoutScore > 80) {
    burnoutMsg.textContent = "Severe burnout indicators. mandatory rest recommended!";
    burnoutFooter.innerHTML = "<i class='fa-solid fa-triangle-exclamation text-danger'></i> High Risk Warning";
    burnoutBar.style.background = "var(--danger)";
  } else if (burnoutScore > 55) {
    burnoutMsg.textContent = "Moderate exhaustion. Reduce study intensity.";
    burnoutFooter.innerHTML = "<i class='fa-solid fa-circle-exclamation text-warning'></i> Elevated Risk";
    burnoutBar.style.background = "var(--warning)";
  } else {
    burnoutMsg.textContent = "Your energy cycles look stable.";
    burnoutFooter.innerHTML = "<i class='fa-solid fa-shield-halved text-success'></i> Normal Range";
    burnoutBar.style.background = "linear-gradient(to right, var(--success), var(--accent))";
  }

  // 4. Sleep metrics
  const sleepHrs = document.getElementById("dash-sleep-hours");
  const sleepGoal = document.getElementById("dash-sleep-goal");
  const sleepFill = document.getElementById("dash-sleep-fill");
  const sleepFooter = document.getElementById("dash-sleep-footer");
  
  const goal = studentProfile.sleep_goal_hours || 7.0;
  sleepGoal.textContent = goal.toFixed(1);
  
  let actualSleep = null;
  for (let i = journalLogs.length - 1; i >= 0; i--) {
    if (journalLogs[i].analysis && journalLogs[i].analysis.sleep_hours !== null) {
      actualSleep = journalLogs[i].analysis.sleep_hours;
      break;
    }
  }
  
  if (actualSleep !== null) {
    sleepHrs.textContent = `${actualSleep.toFixed(1)} hrs`;
    const percentage = Math.min(100, (actualSleep / goal) * 100);
    sleepFill.style.width = `${percentage}%`;
    
    if (actualSleep < 6) {
      sleepFooter.innerHTML = "<i class='fa-solid fa-circle-exclamation text-warning'></i> Sleep debt impairs formula retention";
      sleepFill.style.backgroundColor = "var(--warning)";
    } else {
      sleepFooter.innerHTML = "<i class='fa-solid fa-circle-check text-success'></i> Target efficiency met";
      sleepFill.style.backgroundColor = "var(--accent)";
    }
  } else {
    sleepHrs.textContent = "-- hrs";
    sleepFill.style.width = "0%";
    sleepFooter.textContent = "Sleep affects retention scores";
    sleepFill.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
  }

  // 5. Active triggers UI list render
  const triggerContainer = document.getElementById("dash-triggers-container");
  triggerContainer.innerHTML = "";
  
  if (lastJournal && lastJournal.analysis && lastJournal.analysis.detected_triggers.length > 0) {
    lastJournal.analysis.detected_triggers.forEach(trig => {
      const badge = document.createElement("div");
      badge.className = "trigger-badge";
      badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${trig}`;
      triggerContainer.appendChild(badge);
    });
  } else {
    triggerContainer.innerHTML = `<div class="empty-state">No major stress triggers detected yet! Keep writing your journals.</div>`;
  }

  // 6. Action recommendations widget
  const copingCardTitle = document.getElementById("dash-coping-title");
  const copingCardText = document.getElementById("dash-coping-text");
  const copingBtn = document.getElementById("dash-coping-action-btn");
  
  const recommendedCoping = lastJournal && lastJournal.analysis ? lastJournal.analysis.coping_recommendation : "pomodoro";
  copingBtn.setAttribute("data-coping-mode", recommendedCoping);
  
  if (recommendedCoping === "breathing") {
    copingCardTitle.textContent = "4-7-8 Deep Breathing Guide";
    copingCardText.textContent = "Recommended: High adrenaline detected. Use breathing cycles to lower heart rate and restore test focus.";
    copingBtn.textContent = "Launch Breathing Space";
  } else if (recommendedCoping === "grounding") {
    copingCardTitle.textContent = "5-4-3-2-1 Grounding Room";
    copingCardText.textContent = "Recommended: Stress is elevated. Re-anchor yourself to the study room to halt thoughts of imposter syndrome.";
    copingBtn.textContent = "Launch Grounding Session";
  } else if (recommendedCoping === "affirmations") {
    copingCardTitle.textContent = "Affirmations Station";
    copingCardText.textContent = "Recommended: Confidence drops detected. Listen to positive, evidence-based affirmations to clear self-doubt.";
    copingBtn.textContent = "Launch Affirmations Board";
  } else {
    copingCardTitle.textContent = "Pomodoro Study Breaks";
    copingCardText.textContent = "Recommended: Maintain high retention. Split target physics/chem loops with structured intervals.";
    copingBtn.textContent = "Launch Pomodoro Break";
  }
}

// ------------------------------------
// JOURNAL MOOD LOGGING POST SUBMISSION
// ------------------------------------
async function submitJournalAnalysis() {
  const input = document.getElementById("journal-input");
  const btn = document.getElementById("btn-analyze-journal");
  const text = input.value.trim();
  
  if (text === "") {
    alert("Please write a journal entry to analyze.");
    return;
  }
  
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Reasoning details...`;

  try {
    const res = await fetch('/api/analyze-journal', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ text })
    });
    
    if (res.ok) {
      const journalEntry = await res.json();
      
      // Update local logs
      journalLogs.push(journalEntry);
      
      // Bind to results view
      document.getElementById("analysis-empty-placeholder").classList.add("hidden");
      const resultsWrapper = document.getElementById("analysis-results-wrapper");
      resultsWrapper.classList.remove("hidden");
      
      // Populate labels
      document.getElementById("analysis-emotion").textContent = journalEntry.analysis.primary_emotion;
      
      // Stress & Burnout percentage text
      const stressPct = journalEntry.analysis.stress_score;
      const burnoutPct = journalEntry.analysis.burnout_risk;
      const stressEl = document.getElementById("analysis-stress");
      const burnoutEl = document.getElementById("analysis-burnout");
      
      stressEl.textContent = `${stressPct}%`;
      burnoutEl.textContent = `${burnoutPct}%`;
      
      stressEl.className = `value ${stressPct > 75 ? 'text-danger' : stressPct > 50 ? 'text-warning' : 'text-success'}`;
      burnoutEl.className = `value ${burnoutPct > 75 ? 'text-danger' : burnoutPct > 55 ? 'text-warning' : 'text-success'}`;

      // Set triggers
      const triggersBox = document.getElementById("analysis-triggers-list");
      triggersBox.innerHTML = "";
      if (journalEntry.analysis.detected_triggers.length > 0) {
        journalEntry.analysis.detected_triggers.forEach(trig => {
          const badge = document.createElement("span");
          badge.className = "trigger-badge";
          badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${trig}`;
          triggersBox.appendChild(badge);
        });
      } else {
        triggersBox.innerHTML = `<span class="small-desc text-muted">No triggers logged</span>`;
      }
      
      document.getElementById("analysis-summary").textContent = journalEntry.analysis.summary;
      document.getElementById("analysis-insight").textContent = journalEntry.analysis.insights;
      
      const rec = journalEntry.analysis.coping_recommendation;
      const copingName = document.getElementById("analysis-coping-name");
      const copingReason = document.getElementById("analysis-coping-reason");
      const copingIcon = document.querySelector("#analysis-coping-icon-container i");
      const copingNavBtn = document.getElementById("btn-launch-suggested-coping");
      
      copingNavBtn.setAttribute("data-coping-mode", rec);
      
      if (rec === "breathing") {
        copingName.textContent = "4-7-8 Mindful Breathing";
        copingReason.textContent = "Best for instant anxiety spikes and palpitations.";
        copingIcon.className = "fa-solid fa-wind";
      } else if (rec === "grounding") {
        copingName.textContent = "5-4-3-2-1 Grounding Room";
        copingReason.textContent = "Best for cognitive anchoring and imposter syndrome.";
        copingIcon.className = "fa-solid fa-anchor";
      } else if (rec === "affirmations") {
        copingName.textContent = "Confidence Affirmations";
        copingReason.textContent = "Best for negative self-talk and fear of disappointments.";
        copingIcon.className = "fa-solid fa-circle-check";
      } else {
        copingName.textContent = "Pomodoro Focus Study Break";
        copingReason.textContent = "Best for energy conservation and heavy revision loops.";
        copingIcon.className = "fa-solid fa-business-time";
      }
      
      // Handle Safety layer immediately
      if (journalEntry.analysis.safety_level === "critical") {
        document.getElementById("crisis-modal").classList.remove("hidden");
      }
      
      // Reset input area
      input.value = "";
      document.getElementById("journal-char-count").textContent = "0 characters";
      
      updateDashboardWidgets();
    }
  } catch (err) {
    console.error("Error submitting journal entry:", err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-brain"></i> Analyze Entry & Log Mood`;
  }
}

// ------------------------------------
// DYNAMIC CHAT ACTIONS
// ------------------------------------
function renderChatMessages() {
  const container = document.getElementById("chat-messages-container");
  container.innerHTML = "";
  
  if (chatLogs.length === 0) {
    container.innerHTML = `
      <div class="chat-msg bot">
        Hi there! I'm Aura, your study partner and wellness companion. I know the pressure you're under is immense. How can I help you manage your study anxiety today?
      </div>
    `;
    return;
  }

  chatLogs.forEach(msg => {
    const bubble = document.createElement("div");
    bubble.className = `chat-msg ${msg.sender}`;
    bubble.textContent = msg.text;
    container.appendChild(bubble);
  });
  
  scrollToChatBottom();
}

function scrollToChatBottom() {
  const container = document.getElementById("chat-messages-container");
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById("chat-user-input");
  const messageText = input.value.trim();
  
  if (messageText === "") return;
  
  input.value = "";
  
  const container = document.getElementById("chat-messages-container");
  const userBubble = document.createElement("div");
  userBubble.className = "chat-msg user";
  userBubble.textContent = messageText;
  container.appendChild(userBubble);
  
  scrollToChatBottom();

  const typingIndicator = document.createElement("div");
  typingIndicator.className = "chat-msg bot typing-indicator";
  typingIndicator.id = "typing-temp-indicator";
  typingIndicator.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  container.appendChild(typingIndicator);
  scrollToChatBottom();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message: messageText })
    });
    
    const indicator = document.getElementById("typing-temp-indicator");
    if (indicator) indicator.remove();

    if (res.ok) {
      const data = await res.json();
      
      chatLogs.push({ sender: 'user', text: messageText });
      chatLogs.push({ sender: 'bot', text: data.response });

      const botBubble = document.createElement("div");
      botBubble.className = "chat-msg bot";
      botBubble.textContent = data.response;
      container.appendChild(botBubble);
      
      if (data.safety_triggered) {
        document.getElementById("crisis-modal").classList.remove("hidden");
      }
      
      scrollToChatBottom();
    }
  } catch (err) {
    console.error("Error calling chat API:", err);
    const indicator = document.getElementById("typing-temp-indicator");
    if (indicator) indicator.remove();
  }
}

// ------------------------------------
// COPING MODULES: BREATHING TIMER
// ------------------------------------
function startBreathingSession() {
  const circle = document.getElementById("breathing-circle");
  const label = document.getElementById("breathing-label");
  const counter = document.getElementById("breathing-sec-counter");
  const btnStart = document.getElementById("btn-breathing-control");
  const btnStop = document.getElementById("btn-breathing-stop");
  
  btnStart.classList.add("hidden");
  btnStop.classList.remove("hidden");

  let stage = "inhale";
  let count = 4;

  label.textContent = "Breathe In";
  counter.textContent = count;
  circle.className = "breathing-pulse-circle inhale";

  playCalvingFrequency(220, "sine", 0.5);

  breathingInterval = setInterval(() => {
    count--;
    
    if (count <= 0) {
      if (stage === "inhale") {
        stage = "hold";
        count = 7;
        label.textContent = "Hold Breath";
        circle.className = "breathing-pulse-circle hold";
        playCalvingFrequency(261.6, "sine", 0.3);
      } else if (stage === "hold") {
        stage = "exhale";
        count = 8;
        label.textContent = "Breathe Out";
        circle.className = "breathing-pulse-circle exhale";
        playCalvingFrequency(196, "sine", 0.4);
      } else {
        stage = "inhale";
        count = 4;
        label.textContent = "Breathe In";
        circle.className = "breathing-pulse-circle inhale";
        playCalvingFrequency(220, "sine", 0.5);
      }
    }
    counter.textContent = count;
  }, 1000);
}

function stopBreathingSession() {
  clearInterval(breathingInterval);
  
  const circle = document.getElementById("breathing-circle");
  const label = document.getElementById("breathing-label");
  const counter = document.getElementById("breathing-sec-counter");
  const btnStart = document.getElementById("btn-breathing-control");
  const btnStop = document.getElementById("btn-breathing-stop");
  
  btnStart.classList.remove("hidden");
  btnStop.classList.add("hidden");
  
  circle.className = "breathing-pulse-circle";
  label.textContent = "Ready";
  counter.textContent = "--";
}

// ------------------------------------
// WEB AUDIO OSCILLATOR CHIME SYNTHESIZER
// ------------------------------------
function playCalvingFrequency(frequency, type = "sine", duration = 0.5) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;

    gainNode.gain.setValueAtTime(0.01, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
  } catch (err) {
    console.log("AudioContext blocked or uninitialized. Skipping synthesizers.");
  }
}

// ------------------------------------
// POMODORO BREAK TIMER ENGINE
// ------------------------------------
function updatePomodoroDisplay() {
  const mins = Math.floor(pomodoroTimeRemaining / 60);
  const secs = pomodoroTimeRemaining % 60;
  document.getElementById("pomo-time-display").textContent = 
    `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function startPomodoroTimer() {
  if (pomodoroActive) return;
  pomodoroActive = true;
  
  document.getElementById("btn-pomo-start").classList.add("hidden");
  document.getElementById("btn-pomo-pause").classList.remove("hidden");
  
  pomodoroInterval = setInterval(() => {
    pomodoroTimeRemaining--;
    updatePomodoroDisplay();
    
    if (pomodoroTimeRemaining <= 0) {
      clearInterval(pomodoroInterval);
      pomodoroActive = false;
      document.getElementById("btn-pomo-start").classList.remove("hidden");
      document.getElementById("btn-pomo-pause").classList.add("hidden");
      
      playPomoChime();
      
      alert(`⏰ Pomodoro session completed! Take a moment to stretch, hydrate, and relax your focus before starting the next loop.`);
      
      if (pomodoroMode === "focus") {
        document.querySelector("[data-mode='short']").click();
      } else {
        document.querySelector("[data-mode='focus']").click();
      }
    }
  }, 1000);
}

function pausePomodoroTimer() {
  clearInterval(pomodoroInterval);
  pomodoroActive = false;
  document.getElementById("btn-pomo-start").classList.remove("hidden");
  document.getElementById("btn-pomo-pause").classList.add("hidden");
}

function resetPomodoroTimer() {
  pausePomodoroTimer();
  let defaultVal = 1500;
  if (pomodoroMode === "short") defaultVal = 300;
  if (pomodoroMode === "long") defaultVal = 900;
  
  pomodoroTimeRemaining = defaultVal;
  updatePomodoroDisplay();
}

function playPomoChime() {
  playCalvingFrequency(659.25, "triangle", 0.4);
  setTimeout(() => {
    playCalvingFrequency(880.00, "triangle", 0.6);
  }, 200);
}

// ------------------------------------
// ANALYTICS CHARTING - LINE AND BAR GRAPH (CHART.JS)
// ------------------------------------
function renderCharts() {
  if (journalLogs.length === 0) {
    document.getElementById("analytics-insight-header").textContent = "Log your first mood";
    document.getElementById("analytics-insight-text").textContent = "Please write and log a journal entry to populate the well-being timeline and trigger analytics.";
    
    // Clear old charts visually
    if (lineChartInstance) { lineChartInstance.destroy(); lineChartInstance = null; }
    if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
    return;
  }

  const sortedJournals = [...journalLogs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  const labels = sortedJournals.map(j => {
    const d = new Date(j.timestamp);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  const stressScores = sortedJournals.map(j => j.analysis.stress_score);
  const confidenceScores = sortedJournals.map(j => j.analysis.confidence_score);
  const motivationScores = sortedJournals.map(j => j.analysis.motivation_score);

  if (lineChartInstance) lineChartInstance.destroy();
  if (barChartInstance) barChartInstance.destroy();

  const lineCtx = document.getElementById("line-chart-wellness").getContext("2d");
  
  const stressGrad = lineCtx.createLinearGradient(0, 0, 0, 250);
  stressGrad.addColorStop(0, 'rgba(239, 68, 68, 0.2)');
  stressGrad.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

  const confidenceGrad = lineCtx.createLinearGradient(0, 0, 0, 250);
  confidenceGrad.addColorStop(0, 'rgba(0, 245, 212, 0.2)');
  confidenceGrad.addColorStop(1, 'rgba(0, 245, 212, 0.0)');

  lineChartInstance = new Chart(lineCtx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Stress Intensity (%)',
          data: stressScores,
          borderColor: '#ef4444',
          backgroundColor: stressGrad,
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#ef4444',
          borderWidth: 2
        },
        {
          label: 'Confidence Score',
          data: confidenceScores,
          borderColor: '#00f5d4',
          backgroundColor: confidenceGrad,
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#00f5d4',
          borderWidth: 2
        },
        {
          label: 'Motivation Level',
          data: motivationScores,
          borderColor: '#9d4edd',
          fill: false,
          tension: 0.3,
          pointBackgroundColor: '#9d4edd',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#f3f4f6', font: { family: 'Outfit', size: 12 } }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#9ca3af' }
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#9ca3af' }
        }
      }
    }
  });

  const triggerMap = {};
  let totalSleep = 0;
  let sleepLogsCount = 0;
  let totalStress = 0;
  let totalBurnout = 0;

  journalLogs.forEach(j => {
    totalStress += j.analysis.stress_score;
    totalBurnout += j.analysis.burnout_risk;
    
    if (j.analysis.sleep_hours !== null) {
      totalSleep += j.analysis.sleep_hours;
      sleepLogsCount++;
    }

    j.analysis.detected_triggers.forEach(trig => {
      triggerMap[trig] = (triggerMap[trig] || 0) + 1;
    });
  });

  const avgStress = Math.round(totalStress / journalLogs.length);
  const avgBurnout = Math.round(totalBurnout / journalLogs.length);
  
  document.getElementById("analytics-avg-stress").textContent = `${avgStress}%`;
  document.getElementById("analytics-avg-burnout").textContent = `${avgBurnout}%`;
  document.getElementById("analytics-total-entries").textContent = journalLogs.length;

  const barLabels = Object.keys(triggerMap);
  const barData = Object.values(triggerMap);

  const barCtx = document.getElementById("bar-chart-triggers").getContext("2d");
  
  barChartInstance = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: barLabels.length > 0 ? barLabels : ["None"],
      datasets: [{
        label: 'Logs Count',
        data: barData.length > 0 ? barData : [0],
        backgroundColor: 'rgba(157, 78, 221, 0.75)',
        borderColor: '#9d4edd',
        borderWidth: 1.5,
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#9ca3af', font: { family: 'Outfit', size: 10 } }
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: '#9ca3af' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });

  const insightHeader = document.getElementById("analytics-insight-header");
  const insightText = document.getElementById("analytics-insight-text");

  if (avgStress > 70) {
    insightHeader.textContent = "High Stress Spike Alert";
    insightText.textContent = "Your stress scores are trending high. Triggers suggest study overload. Make it a hard target to stop revision loops at 9 PM and practice grounding anchors.";
  } else if (avgBurnout > 60) {
    insightHeader.textContent = "Evolving Burnout Risk";
    insightText.textContent = "Burnout parameters indicate energy cycles are dropping. Allocate a full study break tomorrow morning, sleep at least 7.5 hours, and focus on non-academic conversations.";
  } else if (sleepLogsCount > 0 && (totalSleep / sleepLogsCount) < 6) {
    insightHeader.textContent = "Cognitive Sleep Deficit";
    insightText.textContent = "Average sleep is below 6 hours. Sleep deprivation hinders long-term memory retrieval. Prioritize structured rest cycles over late-night math revisions.";
  } else {
    insightHeader.textContent = "Stable Study Equilibrium";
    insightText.textContent = "Your emotional trends show healthy alignment. Confidence levels are scaling positively alongside motivation. Maintain this systematic loop!";
  }
}
