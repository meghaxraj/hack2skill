/* ==========================================================================
   Aura Automated Test Suite - Unit tests for NLP engine, safety rules, and DB
   ========================================================================== */

const fs = require('fs');
const path = require('path');

// Colors for terminal formatting
const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`${green}✓ Passed:${reset} ${message}`);
  } else {
    console.error(`${red}✗ Failed:${reset} ${message}`);
    process.exitCode = 1;
  }
}

// Import code snippets dynamically from server.js to mock testing
const serverFileContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// Extraction of offline rule engine for tests
const analyzeMatch = serverFileContent.match(/function analyzeJournalOffline[\s\S]*?\n\}/);
if (!analyzeMatch) {
  console.error("Could not load analyzeJournalOffline function for unit testing.");
  process.exit(1);
}

const generateMatch = serverFileContent.match(/function generateOfflineChatResponse[\s\S]*?\n\}/);
if (!generateMatch) {
  console.error("Could not load generateOfflineChatResponse function for unit testing.");
  process.exit(1);
}

// Eval functions to run tests
eval(analyzeMatch[0]);
eval(generateMatch[0]);

console.log("--------------------------------------------------");
console.log("AURORA UNIT TEST RUNNER - Verification Suite");
console.log("--------------------------------------------------");

// 1. NLP Sentiment Classification & Stress Metric Tests
try {
  const result = analyzeJournalOffline("I solved a lot of questions today and felt proud of my progress.");
  assert(result.primary_emotion === "Confident", "Sentiment should classify Confident for proud logs.");
  assert(result.stress_score < 40, "Stress score should reduce on positive statements.");
} catch (err) {
  assert(false, `NLP classification test threw error: ${err.message}`);
}

// 2. Trigger Extraction Validation
try {
  const result = analyzeJournalOffline("I failed mock test and my dad expects me to clear JEE, everyone else is ahead.");
  assert(result.detected_triggers.includes("Low Mock Scores"), "Should extract Low Mock Scores trigger.");
  assert(result.detected_triggers.includes("Family Expectations"), "Should extract Family Expectations trigger.");
  assert(result.detected_triggers.includes("Peer Comparison"), "Should extract Peer Comparison trigger.");
} catch (err) {
  assert(false, `Trigger validation test threw error: ${err.message}`);
}

// 3. Safety Critical Distress Layer Tests
try {
  const result = analyzeJournalOffline("i am not gonna live anymore, the pressure is too high");
  assert(result.safety_level === "critical", "Crisis phrases should trigger critical safety boundaries.");
  assert(result.stress_score === 98, "Crisis logs should set stress rating max values.");
} catch (err) {
  assert(false, `Safety distress test threw error: ${err.message}`);
}

// 4. Chat safety trigger test
try {
  const result = generateOfflineChatResponse("i want to die, this exam is too hard", [], null, "JEE");
  assert(result.safety_triggered === true, "Distress chats should flag safety_triggered.");
  assert(result.text.includes("helpline"), "Crisis chatbot response should contain helpline details.");
} catch (err) {
  assert(false, `Chat safety test threw error: ${err.message}`);
}

// 5. DB Helper Check
try {
  // Test if readDB functions return valid profiles
  const dbModule = require('./db.json');
  assert(dbModule.users !== undefined, "Database should contain users workspace dictionary.");
  assert(dbModule.users.aryan !== undefined, "Aryan historical test profile is preserved.");
} catch (err) {
  assert(false, `Database integrity verification threw error: ${err.message}`);
}

console.log("--------------------------------------------------");
console.log(`Summary: ${passedTests}/${totalTests} tests passed successfully.`);
console.log("--------------------------------------------------");
if (process.exitCode === 1) {
  console.log(`${red}Testing failed.${reset}`);
} else {
  console.log(`${green}All testing passed successfully!${reset}`);
}
