require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  globalLimiter,
  strictLimiter,
  analysisLimiter,
  validateUsername,
  validateDate,
  validateSleepGoal,
  sanitizeInput,
  validateUserIdMiddleware,
  requestSizeMiddleware,
  securityHeadersMiddleware
} = require('./middleware/security');
const {
  detectStressPatterns,
  calculateWellnessTrend,
  generatePersonalizedRecommendations,
  assessSleepQuality,
  analyzeAnxietyTrend
} = require('./utils/analysis');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));

// Security middleware stack
app.use(securityHeadersMiddleware);
app.use(requestSizeMiddleware());
app.use(globalLimiter);
app.use(validateUserIdMiddleware);

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
app.post('/api/profile', strictLimiter, (req, res) => {
  try {
    // Validate input
    if (req.body.name && typeof req.body.name !== 'string') {
      return res.status(400).json({ error: 'Invalid name format' });
    }
    if (req.body.target_date && !validateDate(req.body.target_date)) {
      return res.status(400).json({ error: 'Invalid target date. Must be future date' });
    }
    if (req.body.sleep_goal_hours && !validateSleepGoal(req.body.sleep_goal_hours)) {
      return res.status(400).json({ error: 'Sleep goal must be between 4-12 hours' });
    }

    const db = readDB();
    const userData = getUserData(db, req.userId);
    
    // Sanitize and validate inputs
    const sanitizedProfile = {
      name: req.body.name ? sanitizeInput(req.body.name, 100) : userData.user_profile.name,
      exam: req.body.exam ? sanitizeInput(req.body.exam, 100) : userData.user_profile.exam,
      target_date: req.body.target_date || userData.user_profile.target_date,
      sleep_goal_hours: req.body.sleep_goal_hours || userData.user_profile.sleep_goal_hours
    };
    
    userData.user_profile = sanitizedProfile;
    writeDB(db);
    res.json({ success: true, profile: userData.user_profile });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
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
app.post('/api/analyze-journal', analysisLimiter, async (req, res) => {
  try {
    const text = sanitizeInput(req.body.text, 5000);
    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "Journal text is required" });
    }

    const db = readDB();
    const userData = getUserData(db, req.userId);
    const apiKey = process.env.GEMINI_API_KEY;
    
    // Core safety trigger: If critical distress is hit, immediately flag without needing Gemini API
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
        
        // Calculate enhanced insights with pattern analysis
        if (userData.journals.length > 1) {
          const patterns = detectStressPatterns(userData.journals);
          const wellnessScore = calculateWellnessTrend(userData.journals);
          const recommendations = generatePersonalizedRecommendations(userData);
          
          journalEntry.analysis.patterns = patterns;
          journalEntry.analysis.wellness_trend = wellnessScore;
          journalEntry.analysis.personalized_tips = recommendations;
        }
        
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
  } catch (error) {
    console.error('Journal analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze journal' });
  }
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
app.post('/api/chat', analysisLimiter, async (req, res) => {
  try {
    const message = sanitizeInput(req.body.message, 2000);
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
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// GET /api/trends - Analytics and wellness trends
app.get('/api/trends', (req, res) => {
  try {
    const db = readDB();
    const userData = getUserData(db, req.userId);
    const journals = userData.journals || [];

    if (journals.length === 0) {
      return res.json({
        wellness_score: 50,
        trends: null,
        recommendations: ['Write your first journal entry to unlock insights'],
        patterns: null,
        sleep_assessment: null
      });
    }

    const patterns = detectStressPatterns(journals);
    const wellnessScore = calculateWellnessTrend(journals);
    const recommendations = generatePersonalizedRecommendations(userData);
    const sleepAssessment = assessSleepQuality(journals);
    const anxietyTrend = analyzeAnxietyTrend(journals);

    res.json({
      wellness_score: wellnessScore,
      trends: anxietyTrend,
      recommendations,
      patterns,
      sleep_assessment: sleepAssessment,
      total_journals: journals.length,
      last_entry: journals.length > 0 ? journals[journals.length - 1].timestamp : null
    });
  } catch (error) {
    console.error('Trends error:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// GET /api/wellness-summary - Summary of recent wellness
app.get('/api/wellness-summary', (req, res) => {
  try {
    const db = readDB();
    const userData = getUserData(db, req.userId);
    const journals = userData.journals || [];
    const recentJournals = journals.slice(-5);

    const summary = {
      total_entries: journals.length,
      recent_entries: recentJournals.map(j => ({
        timestamp: j.timestamp,
        emotion: j.analysis.primary_emotion,
        stress: j.analysis.stress_score,
        burnout: j.analysis.burnout_risk,
        triggers: j.analysis.detected_triggers
      })),
      average_stress: recentJournals.length > 0 
        ? Math.round(recentJournals.reduce((sum, j) => sum + j.analysis.stress_score, 0) / recentJournals.length)
        : 0,
      average_burnout: recentJournals.length > 0
        ? Math.round(recentJournals.reduce((sum, j) => sum + j.analysis.burnout_risk, 0) / recentJournals.length)
        : 0
    };

    res.json(summary);
  } catch (error) {
    console.error('Wellness summary error:', error);
    res.status(500).json({ error: 'Failed to fetch wellness summary' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
