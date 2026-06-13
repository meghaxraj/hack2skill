require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Browser security response headers
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Input XSS sanitization
function sanitizeInput(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Database helper functions
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const initialDB = {
        users: {
          "aryan": {
            "user_profile": {
              "name": "Aryan",
              "exam": "JEE Advanced",
              "target_date": "2027-05-24",
              "sleep_goal_hours": 7
            },
            "journals": [],
            "chats": []
          }
        }
      };
      fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2));
      return initialDB;
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading database:", error);
    return { users: {} };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error writing database:", error);
  }
}

// User lookup helper
function getUserData(db, userId) {
  const cleanId = (userId || 'student').toLowerCase().trim();
  if (!db.users) db.users = {};
  if (!db.users[cleanId]) {
    db.users[cleanId] = {
      user_profile: {
        name: userId || "Student",
        exam: "JEE Main & Advanced",
        target_date: "",
        sleep_goal_hours: 7
      },
      journals: [],
      chats: [
        {
          id: "c-init",
          timestamp: new Date().toISOString(),
          sender: "bot",
          text: `Welcome, ${userId || 'Student'}! Aura is online. How is your prep journey going today?`
        }
      ]
    };
  }
  return db.users[cleanId];
}

// User-ID extraction middleware
app.use((req, res, next) => {
  req.userId = req.get('X-User-Id') || 'student';
  next();
});

// ------------------------------------
// API ROUTES
// ------------------------------------

// Get integration key status
app.get('/api/status', (req, res) => {
  const hasKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== "";
  res.json({ has_api_key: hasKey });
});

// Get all users (for landing page dropdown lists)
app.get('/api/users', (req, res) => {
  const db = readDB();
  const users = Object.keys(db.users || {}).map(key => ({
    id: key,
    name: db.users[key].user_profile.name
  }));
  res.json(users);
});

// Get active profile
app.get('/api/profile', (req, res) => {
  const db = readDB();
  const userData = getUserData(db, req.userId);
  res.json(userData.user_profile);
});

// Update active profile
app.post('/api/profile', (req, res) => {
  const db = readDB();
  const userData = getUserData(db, req.userId);
  userData.user_profile = { ...userData.user_profile, ...req.body };
  writeDB(db);
  res.json({ success: true, profile: userData.user_profile });
});

// Get journals of user
app.get('/api/journals', (req, res) => {
  const db = readDB();
  const userData = getUserData(db, req.userId);
  res.json(userData.journals || []);
});

// Clear user data (reset current user log context)
app.post('/api/clear-data', (req, res) => {
  const db = readDB();
  const userData = getUserData(db, req.userId);
  userData.journals = [];
  userData.chats = [
    {
      id: "c-init",
      timestamp: new Date().toISOString(),
      sender: "bot",
      text: `Welcome back, ${userData.user_profile.name || 'Student'}! Aura is online. How is your prep journey going today?`
    }
  ];
  writeDB(db);
  res.json({ success: true });
});

// GET /api/chats
app.get('/api/chats', (req, res) => {
  const db = readDB();
  const userData = getUserData(db, req.userId);
  res.json(userData.chats || []);
});

// Helper for offline journal analyzer rule engine
function analyzeJournalOffline(text) {
  const lowerText = text.toLowerCase();
  
  // 1. Safety Check (Crisis keywords)
  const isCritical = /self[- ]?harm|suicid|kill myself|end my life|want to die|wished I was dead|better off dead|hopelessness|giving up on life|overdose|not gonna live|not live|end it all|kill me|cut myself/i.test(lowerText);
  if (isCritical) {
    return {
      primary_emotion: "Severely Distressed",
      stress_score: 98,
      burnout_risk: 90,
      confidence_score: 10,
      motivation_score: 5,
      sleep_hours: null,
      detected_triggers: ["Severe Distress"],
      summary: "Student is feeling extremely overwhelmed and expressing severe hopelessness.",
      insights: "CRITICAL ALERT: Negative self-talk and thoughts of giving up detected. Please pause immediately and talk to someone who can help.",
      coping_recommendation: "grounding",
      safety_level: "critical"
    };
  }

  // 2. Extract Sleep
  let sleepHours = null;
  const sleepMatch = lowerText.match(/(?:slept|sleep)\b.*?(\d+(?:\.\d+)?)\s*(?:hours|hrs|hr)/);
  if (sleepMatch) {
    sleepHours = parseFloat(sleepMatch[1]);
  }

  // 3. Triggers Detection
  const triggers = [];
  if (/score|marks|rank|mock|percent|test|exam|failed|chemistry|physics|math|biology/i.test(lowerText)) {
    triggers.push("Low Mock Scores");
  }
  if (/parents|father|mother|dad|mom|expect|disappoint|family|parents'/i.test(lowerText)) {
    triggers.push("Family Expectations");
  }
  if (/peers|friends|everyone else|others|batch|compete|ahead of me|lagging/i.test(lowerText)) {
    triggers.push("Peer Comparison");
  }
  if (/study|revision|syllabus|10 hours|11 hours|12 hours|13 hours|14 hours|studying|exhausted|burn|tired/i.test(lowerText)) {
    triggers.push("Study Overload");
  }
  if (/sleep|awake|insomnia|coffee|caffeine|caffiene|night|can't sleep|exhausted/i.test(lowerText) || (sleepHours && sleepHours < 6)) {
    triggers.push("Sleep Deprivation");
  }
  if (/phone|scroll|telegram|youtube|insta|instagram|social|waste/i.test(lowerText)) {
    triggers.push("Social Media Influence");
  }

  // Default metrics computation
  let stress_score = 40;
  let burnout_risk = 35;
  let confidence_score = 60;
  let motivation_score = 65;
  let primary_emotion = "Stable";

  // Score adjustments based on words
  if (/sad|depressed|unhappy|cry|cried/i.test(lowerText)) {
    primary_emotion = "Sad";
    stress_score += 20;
    burnout_risk += 15;
    confidence_score -= 15;
  }
  if (/anxious|anxiety|scared|nervous|worry|worried|fear|panicked/i.test(lowerText)) {
    primary_emotion = "Anxious";
    stress_score += 25;
    confidence_score -= 20;
  }
  if (/burnout|burnt out|exhausted|tired|done|sluggish|give up|quit/i.test(lowerText)) {
    primary_emotion = "Exhausted";
    burnout_risk += 35;
    motivation_score -= 30;
  }
  if (/angry|frustrated|irritated|hate|annoyed/i.test(lowerText)) {
    primary_emotion = "Frustrated";
    stress_score += 15;
  }
  if (/proud|happy|excited|confident|good|solved|completed|crushed|great/i.test(lowerText)) {
    primary_emotion = "Confident";
    stress_score -= 20;
    burnout_risk -= 15;
    confidence_score += 25;
    motivation_score += 20;
  }

  // Clamp values between 0 and 100
  stress_score = Math.max(10, Math.min(100, stress_score + (triggers.length * 10)));
  burnout_risk = Math.max(10, Math.min(100, burnout_risk + (triggers.length * 8)));
  confidence_score = Math.max(10, Math.min(100, confidence_score));
  motivation_score = Math.max(10, Math.min(100, motivation_score));

  // Determine coping strategy
  let coping_recommendation = "breathing";
  if (primary_emotion === "Anxious" || stress_score > 70) {
    coping_recommendation = "breathing";
  } else if (primary_emotion === "Exhausted" || burnout_risk > 70) {
    coping_recommendation = "grounding";
  } else if (confidence_score < 40) {
    coping_recommendation = "affirmations";
  } else {
    coping_recommendation = "pomodoro";
  }

  // Create insights
  let insights = "Keep monitoring your study loops. You are handling things systematically.";
  if (triggers.includes("Peer Comparison")) {
    insights = "Negative self-talk alert: Comparison with others is clouding your unique exam progress.";
  } else if (triggers.includes("Sleep Deprivation")) {
    insights = "Critical: Your brain needs standard REM cycles to consolidate physics/chemistry formulas. Prioritize sleep!";
  } else if (triggers.includes("Low Mock Scores")) {
    insights = "Perspective: Mock tests are diagnostic tools, not end results. Reframe them as 'error-identifications'.";
  } else if (burnout_risk > 70) {
    insights = "Warning: Burnout signals are strong. Consider taking a mandatory half-day rest tomorrow.";
  }

  // Create summary
  let summary = `Student reports feeling ${primary_emotion.toLowerCase()} during preparation.`;
  if (triggers.length > 0) {
    summary += ` Triggers include: ${triggers.join(', ')}.`;
  }

  return {
    primary_emotion,
    stress_score,
    burnout_risk,
    confidence_score,
    motivation_score,
    sleep_hours: sleepHours,
    detected_triggers: triggers,
    summary,
    insights,
    coping_recommendation,
    safety_level: stress_score > 85 ? "concerning" : "safe"
  };
}

// POST /api/analyze-journal
app.post('/api/analyze-journal', async (req, res) => {
  const text = sanitizeInput(req.body.text);
  if (!text || text.trim() === "") {
    return res.status(400).json({ error: "Journal text is required" });
  }

  const db = readDB();
  const userData = getUserData(db, req.userId);
  const apiKey = process.env.GEMINI_API_KEY;
  
  // Core safety trigger: If critical distress is hit, immediately override and flag without needing Gemini API key
  const safetyOverride = analyzeJournalOffline(text);
  if (safetyOverride.safety_level === 'critical') {
    const journalEntry = {
      id: "j-" + Date.now(),
      timestamp: new Date().toISOString(),
      raw_text: text,
      analysis: safetyOverride
    };
    userData.journals.push(journalEntry);
    writeDB(db);
    return res.json(journalEntry);
  }

  if (apiKey && apiKey.trim() !== "") {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: { responseMimeType: "application/json" }
      });

      const prompt = `Analyze the following student exam preparation journal entry. Return a JSON object containing:
- primary_emotion (string, e.g. Anxious, Confident, Sad, Exhausted, Frustrated, Calm, Hopeless, Neutral)
- stress_score (number between 0 and 100)
- burnout_risk (number between 0 and 100)
- confidence_score (number between 0 and 100)
- motivation_score (number between 0 and 100)
- sleep_hours (number representing hours of sleep, extract if mentioned e.g. "slept 5 hours" or "5.5 hrs", else null)
- detected_triggers (array of strings, selecting from: "Low Mock Scores", "Family Expectations", "Peer Comparison", "Sleep Deprivation", "Social Media Influence", "Study Overload", "Loneliness")
- summary (string, maximum 15 words)
- insights (string, actionable advice identifying any negative self-talk, imposter syndrome, or study exhaustion, maximum 25 words)
- coping_recommendation (string, must be exactly one of: "breathing", "grounding", "affirmations", "pomodoro")
- safety_level (string, must be one of: "safe", "concerning", "critical")

Journal Entry:
"${text}"`;

      const response = await model.generateContent(prompt);
      const parsedAnalysis = JSON.parse(response.response.text());

      const journalEntry = {
        id: "j-" + Date.now(),
        timestamp: new Date().toISOString(),
        raw_text: text,
        analysis: parsedAnalysis
      };

      userData.journals.push(journalEntry);
      writeDB(db);
      return res.json(journalEntry);

    } catch (apiError) {
      console.error("Gemini API Error, falling back to offline analysis:", apiError);
    }
  }

  // Fallback Rule Engine
  const analysis = analyzeJournalOffline(text);
  const journalEntry = {
    id: "j-" + Date.now(),
    timestamp: new Date().toISOString(),
    raw_text: text,
    analysis: analysis
  };

  userData.journals.push(journalEntry);
  writeDB(db);
  res.json(journalEntry);
});

// Offline chatbot generator response
function generateOfflineChatResponse(message, history, lastJournal, examName) {
  const lowerMsg = message.toLowerCase();
  
  // 1. Critical Distress Check
  const isCritical = /self[- ]?harm|suicid|kill myself|end my life|want to die|wished I was dead|better off dead|hopelessness|giving up on life|overdose|not gonna live|not live|end it all|kill me/i.test(lowerMsg);
  if (isCritical) {
    return {
      text: "I hear how much pain you are in right now, and I want you to know that you are not alone. Please, reach out to someone who can help. You can call the national helpline AASRA at 91-9820466726, or Tele-MANAS at 14416 (available 24/7 in India). I'm a support companion, but please speak to a trusted adult or professional therapist right now. Your life is infinitely valuable.",
      safety_triggered: true
    };
  }

  // Common response scenarios
  if (/hello|hi|hey|greetings/i.test(lowerMsg)) {
    return { text: `Hi there! I'm Aura, your companion. How is your ${examName || 'exam'} preparation going? Feel free to vent or tell me how you are managing.` };
  }

  if (/stress|anxious|scared|nervous|worry|fear|afraid/i.test(lowerMsg)) {
    return { text: "It is completely normal to feel anxious. Exams like this carry huge weight. Let's take a deep breath. Try to focus only on the next 1 hour of study rather than the whole exam syllabus. Would you like me to guide you through a quick breathing exercise?" };
  }

  if (/score|test|mock|marks|fail|percentage/i.test(lowerMsg)) {
    return { text: `Mock scores are just checkpoints for errors, not a definition of your intelligence. If you are preparing for ${examName || 'your exams'}, look at the questions you got wrong and fix the concept. Don't let a single number dictate your capability.` };
  }

  if (/tired|burnout|exhausted|sleep|fatigue|give up/i.test(lowerMsg)) {
    return { text: "Burnout is real and your brain is telling you to rest. Studying while exhausted is like writing with an empty pen—nothing sticks. Set a hard stop tonight, get some sleep, and let's start fresh tomorrow. Your health comes first." };
  }

  if (/parents|father|mother|dad|mom|expect/i.test(lowerMsg)) {
    return { text: "Parental pressure can feel like a heavy weight. Often, parents push because they worry about your future, but they might not realize how much pressure you're already putting on yourself. Remember, your worth is not tied to an exam rank." };
  }

  if (/friend|peers|others|everyone|better than me/i.test(lowerMsg)) {
    return { text: "It is easy to look at others and feel like they have everything sorted. But you only see their highlights, not their struggles. Focus entirely on your own lane. Every small improvement you make is a win." };
  }

  if (/thank/i.test(lowerMsg)) {
    return { text: "You are so welcome! I'm always here in your corner. Let's take it one step at a time. You've got this." };
  }

  // Contextual feedback from last journal
  if (lastJournal && lastJournal.analysis) {
    const emotion = lastJournal.analysis.primary_emotion.toLowerCase();
    const stress = lastJournal.analysis.stress_score;
    if (stress > 75) {
      return { text: `I remember you mentioned feeling ${emotion} in your journal recently, with a stress level of ${stress}%. How is your mind feeling right now? Remember to take frequent Pomodoro breaks to keep the mental fatigue low.` };
    }
  }

  return { text: "I'm listening. Preparing for high-stakes exams is a marathon, not a sprint. Remember to be kind to yourself today. Tell me more, or let me know if you want to try a coping exercise." };
}

// POST /api/chat
app.post('/api/chat', async (req, res) => {
  const message = sanitizeInput(req.body.message);
  if (!message || message.trim() === "") {
    return res.status(400).json({ error: "Message is required" });
  }

  const db = readDB();
  const userData = getUserData(db, req.userId);
  const apiKey = process.env.GEMINI_API_KEY;
  const examName = userData.user_profile.exam;
  const journals = userData.journals || [];
  const lastJournal = journals.length > 0 ? journals[journals.length - 1] : null;

  // Save user chat message
  const userMsg = {
    id: "c-" + Date.now(),
    timestamp: new Date().toISOString(),
    sender: "user",
    text: message
  };
  userData.chats.push(userMsg);

  // Quick safety filter first (offline check)
  const safetyCheck = generateOfflineChatResponse(message, [], lastJournal, examName);
  if (safetyCheck.safety_triggered) {
    const botMsg = {
      id: "c-" + (Date.now() + 1),
      timestamp: new Date().toISOString(),
      sender: "bot",
      text: safetyCheck.text
    };
    userData.chats.push(botMsg);
    writeDB(db);
    return res.json({ response: botMsg.text, safety_triggered: true });
  }

  if (apiKey && apiKey.trim() !== "") {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const chatHistory = userData.chats.slice(-10);
      const historyContext = chatHistory.map(c => `${c.sender === 'user' ? 'Student' : 'Aura'}: ${c.text}`).join('\n');
      
      let journalContext = "";
      if (lastJournal) {
        journalContext = `Student's recent emotional state from their journal: Primary Emotion: ${lastJournal.analysis.primary_emotion}, Stress Score: ${lastJournal.analysis.stress_score}%, Burnout Risk: ${lastJournal.analysis.burnout_risk}%. Insights: ${lastJournal.analysis.insights}`;
      }

      const prompt = `You are Aura, an empathetic, supportive, and non-judgmental AI companion for a student preparing for the ${examName || 'exams'} exam.
${journalContext}

Here is the conversation history:
${historyContext}

Student's new message: "${message}"

Respond directly as Aura. Be warm, motivating, clear, and empathetic. Give a supportive, short response (maximum 60 words). Do not diagnose. If there is a risk of self-harm, display absolute warmth and remind them of helplines immediately.`;

      const result = await model.generateContent(prompt);
      const botResponseText = result.response.text().trim();

      const botMsg = {
        id: "c-" + (Date.now() + 1),
        timestamp: new Date().toISOString(),
        sender: "bot",
        text: botResponseText
      };
      userData.chats.push(botMsg);
      writeDB(db);
      return res.json({ response: botMsg.text });

    } catch (apiError) {
      console.error("Gemini Chat API Error, falling back to offline chat:", apiError);
    }
  }

  // Offline fallback chatbot
  const fallbackResponse = generateOfflineChatResponse(message, userData.chats, lastJournal, examName);
  const botMsg = {
    id: "c-" + (Date.now() + 1),
    timestamp: new Date().toISOString(),
    sender: "bot",
    text: fallbackResponse.text
  };
  userData.chats.push(botMsg);
  writeDB(db);
  res.json({ response: botMsg.text });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
