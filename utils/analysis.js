/**
 * Enhanced Journal Analysis - AI Pattern Recognition & Trend Analysis
 * Provides deeper insights by analyzing multiple entries and detecting patterns
 */

// Advanced pattern detection for stress triggers across multiple entries
function detectStressPatterns(journalEntries) {
  if (!journalEntries || journalEntries.length === 0) {
    return { recurring_triggers: [], pattern_summary: '' };
  }

  const triggerFrequency = {};
  const emotionSequence = [];

  journalEntries.forEach(entry => {
    if (entry.analysis && entry.analysis.detected_triggers) {
      entry.analysis.detected_triggers.forEach(trigger => {
        triggerFrequency[trigger] = (triggerFrequency[trigger] || 0) + 1;
      });
    }
    if (entry.analysis && entry.analysis.primary_emotion) {
      emotionSequence.push(entry.analysis.primary_emotion);
    }
  });

  // Sort triggers by frequency
  const recurringTriggers = Object.entries(triggerFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([trigger, count]) => ({ trigger, frequency: count }));

  // Detect emotional trend
  let patternSummary = '';
  if (emotionSequence.length >= 3) {
    const recentEmotions = emotionSequence.slice(-3);
    const mostFrequentRecent = recentEmotions.reduce((a, b) =>
      recentEmotions.filter(x => x === a).length > recentEmotions.filter(x => x === b).length ? a : b
    );
    patternSummary = `Recent emotional state: predominantly ${mostFrequentRecent.toLowerCase()}`;

    // Check for escalating stress
    const stressScores = journalEntries.slice(-5).map(e => e.analysis?.stress_score || 0);
    const trend = stressScores[stressScores.length - 1] - stressScores[0];
    if (trend > 20) {
      patternSummary += '. ⚠️ Stress levels have been rising.';
    } else if (trend < -20) {
      patternSummary += '. ✅ Positive trend: Stress levels declining.';
    }
  }

  return { recurring_triggers: recurringTriggers, pattern_summary: patternSummary };
}

// Calculate wellness trend score (0-100) based on recent journals
function calculateWellnessTrend(journalEntries) {
  if (!journalEntries || journalEntries.length === 0) return 50;

  const recentJournals = journalEntries.slice(-7); // last 7 entries
  const avgStress = recentJournals.reduce((sum, j) => sum + (j.analysis?.stress_score || 50), 0) / recentJournals.length;
  const avgBurnout = recentJournals.reduce((sum, j) => sum + (j.analysis?.burnout_risk || 50), 0) / recentJournals.length;
  const avgConfidence = recentJournals.reduce((sum, j) => sum + (j.analysis?.confidence_score || 50), 0) / recentJournals.length;

  // Wellness = inverse of (stress + burnout) + confidence boost
  const wellnessTrend = Math.round(((100 - avgStress) + (100 - avgBurnout) + avgConfidence) / 3);
  return Math.max(0, Math.min(100, wellnessTrend));
}

// Generate personalized recommendations based on historical patterns
function generatePersonalizedRecommendations(userData) {
  const recommendations = [];
  const journals = userData.journals || [];

  if (journals.length < 2) {
    return ['Write at least 3 journal entries to unlock personalized insights'];
  }

  const patterns = detectStressPatterns(journals);
  const lastJournal = journals[journals.length - 1];

  // Recommendation 1: Address recurring triggers
  if (patterns.recurring_triggers.length > 0) {
    const topTrigger = patterns.recurring_triggers[0].trigger;
    if (topTrigger === 'Peer Comparison') {
      recommendations.push('💡 Your #1 stress trigger is peer comparison. Try the "Affirmations" coping tool to rebuild confidence.');
    } else if (topTrigger === 'Sleep Deprivation') {
      recommendations.push('💡 Sleep debt is your biggest challenge. Prioritize 7+ hrs tonight; memory retention depends on it.');
    } else if (topTrigger === 'Study Overload') {
      recommendations.push('💡 Study overload detected. Use Pomodoro intervals to prevent cognitive burnout.');
    } else if (topTrigger === 'Family Expectations') {
      recommendations.push('💡 Family pressure is affecting you. Remember: your worth ≠ exam rank.');
    }
  }

  // Recommendation 2: Based on current burnout
  if (lastJournal && lastJournal.analysis) {
    if (lastJournal.analysis.burnout_risk > 70) {
      recommendations.push('⚠️ Burnout risk is high. Take a 2-hour break today; your brain needs restoration.');
    } else if (lastJournal.analysis.confidence_score < 40) {
      recommendations.push('🎯 Confidence is low. Review one mock test you did well on to remind yourself of capability.');
    }
  }

  // Recommendation 3: Motivational message
  const wellnessTrend = calculateWellnessTrend(journals);
  if (wellnessTrend > 70) {
    recommendations.push('🌟 You\'re doing great! Your wellness trend is positive. Keep this momentum up!');
  } else if (wellnessTrend < 40) {
    recommendations.push('📍 Wellness is low. Consider talking to someone close to you about the stress.');
  }

  return recommendations.slice(0, 3); // max 3 recommendations
}

// Sleep quality assessment
function assessSleepQuality(journalEntries) {
  if (!journalEntries || journalEntries.length === 0) return null;

  const sleepRecords = journalEntries
    .map(j => j.analysis?.sleep_hours)
    .filter(h => h !== null && h !== undefined);

  if (sleepRecords.length === 0) return null;

  const avgSleep = sleepRecords.reduce((a, b) => a + b) / sleepRecords.length;
  const goal = 7; // standard recommendation
  const deficit = goal - avgSleep;

  return {
    average_sleep: avgSleep.toFixed(1),
    goal: goal,
    deficit: Math.max(0, deficit).toFixed(1),
    quality_status: avgSleep >= 6.5 ? 'Good' : avgSleep >= 5.5 ? 'Fair' : 'Poor'
  };
}

// Anxiety trend analyzer (detects escalating anxiety patterns)
function analyzeAnxietyTrend(journalEntries) {
  if (!journalEntries || journalEntries.length < 3) return null;

  const recentThree = journalEntries.slice(-3);
  const anxietyScores = recentThree.map(j => {
    if (j.analysis?.primary_emotion === 'Anxious') return 80;
    if (j.analysis?.primary_emotion === 'Frustrated') return 60;
    if (j.analysis?.primary_emotion === 'Confident') return 20;
    return 40; // neutral
  });

  const trend = anxietyScores[anxietyScores.length - 1] - anxietyScores[0];
  return {
    escalating: trend > 20,
    trend_direction: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable',
    trend_magnitude: Math.abs(trend)
  };
}

module.exports = {
  detectStressPatterns,
  calculateWellnessTrend,
  generatePersonalizedRecommendations,
  assessSleepQuality,
  analyzeAnxietyTrend
};
