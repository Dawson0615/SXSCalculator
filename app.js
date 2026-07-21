"use strict";

const DATA_URL = "assets/data/exp_required.json";

const elements = {
  form: document.querySelector("#xp-form"),
  season: document.querySelector("#season"),
  currentLevel: document.querySelector("#current-level"),
  wantedLevel: document.querySelector("#wanted-level"),
  currentXp: document.querySelector("#current-xp"),
  xpPerHour: document.querySelector("#xp-per-hour"),
  calculateButton: document.querySelector("#calculate-button"),
  resetButton: document.querySelector("#reset-button"),
  dataStatus: document.querySelector("#data-status"),
  seasonRange: document.querySelector("#season-range"),
  formError: document.querySelector("#form-error"),
  results: document.querySelector("#results"),
  nextLevelValue: document.querySelector("#next-level-value"),
  progressPercent: document.querySelector("#progress-percent"),
  progressFill: document.querySelector("#progress-fill"),
  nextRequiredXp: document.querySelector("#next-required-xp"),
  nextRemainingXp: document.querySelector("#next-remaining-xp"),
  nextTime: document.querySelector("#next-time"),
  nextHours: document.querySelector("#next-hours"),
  goalLevelValue: document.querySelector("#goal-level-value"),
  levelsRemaining: document.querySelector("#levels-remaining"),
  goalRemainingXp: document.querySelector("#goal-remaining-xp"),
  goalTime: document.querySelector("#goal-time"),
  goalHours: document.querySelector("#goal-hours"),
  goalRate: document.querySelector("#goal-rate"),
  copyResults: document.querySelector("#copy-results"),
  copyStatus: document.querySelector("#copy-status"),
};

const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

let seasonData = new Map();
let latestResult = null;

function setControlsEnabled(enabled) {
  [
    elements.season,
    elements.currentLevel,
    elements.wantedLevel,
    elements.currentXp,
    elements.xpPerHour,
    elements.calculateButton,
    elements.resetButton,
  ].forEach((element) => {
    element.disabled = !enabled;
  });
}

function normalizeData(source) {
  const records = Array.isArray(source)
    ? source
    : Object.entries(source).flatMap(([season, payload]) => {
        const startLevel = Number(payload?.start);
        const expValues = Array.isArray(payload?.exp) ? payload.exp : [];

        return expValues.map((exp, index) => ({
          season: Number(season),
          level: startLevel + index,
          exp,
        }));
      });

  const grouped = new Map();

  for (const record of records) {
    const season = Number(record.season);
    const level = Number(record.level);
    const exp = Number(record.exp);

    if (!Number.isInteger(season) || !Number.isInteger(level) || !Number.isFinite(exp) || exp < 0) {
      continue;
    }

    if (!grouped.has(season)) {
      grouped.set(season, new Map());
    }

    grouped.get(season).set(level, exp);
  }

  return new Map([...grouped.entries()].sort(([a], [b]) => a - b));
}

function populateSeasons() {
  for (const [season, levels] of seasonData) {
    const sortedLevels = [...levels.keys()].sort((a, b) => a - b);
    const minLevel = sortedLevels[0];
    const maxLevel = sortedLevels.at(-1);
    const option = new Option(`Season ${season}`, String(season));
    option.dataset.minLevel = String(minLevel);
    option.dataset.maxLevel = String(maxLevel);
    elements.season.add(option);
  }
}

function updateSeasonLimits() {
  hideError();
  elements.results.hidden = true;
  latestResult = null;

  const selectedSeason = Number(elements.season.value);
  const levels = seasonData.get(selectedSeason);

  if (!levels) {
    elements.seasonRange.textContent = "Choose a season to view its level range.";
    return;
  }

  const sortedLevels = [...levels.keys()].sort((a, b) => a - b);
  const minLevel = sortedLevels[0];
  const maxLevel = sortedLevels.at(-1);
  const highestReachableLevel = maxLevel + 1;

  elements.currentLevel.min = String(minLevel);
  elements.currentLevel.max = String(maxLevel);
  elements.wantedLevel.min = String(minLevel + 1);
  elements.wantedLevel.max = String(highestReachableLevel);
  elements.seasonRange.textContent = `Available current levels: ${integerFormatter.format(minLevel)}–${integerFormatter.format(maxLevel)}. Highest reachable level: ${integerFormatter.format(highestReachableLevel)}.`;

  if (elements.currentLevel.value) {
    elements.wantedLevel.min = String(Number(elements.currentLevel.value) + 1);
  }
}

function updateWantedMinimum() {
  const currentLevel = Number(elements.currentLevel.value);
  if (Number.isInteger(currentLevel)) {
    elements.wantedLevel.min = String(currentLevel + 1);
  }
}

function showError(message) {
  elements.formError.textContent = message;
  elements.formError.hidden = false;
}

function hideError() {
  elements.formError.textContent = "";
  elements.formError.hidden = true;
}

function getInputs() {
  return {
    season: Number(elements.season.value),
    currentLevel: Number(elements.currentLevel.value),
    wantedLevel: Number(elements.wantedLevel.value),
    currentXp: Number(elements.currentXp.value),
    xpPerHour: Number(elements.xpPerHour.value),
  };
}

function validateInputs(inputs) {
  const levels = seasonData.get(inputs.season);

  if (!levels) {
    return "Select a season.";
  }

  if (!Number.isInteger(inputs.currentLevel) || !levels.has(inputs.currentLevel)) {
    return "Enter a current level available in the selected season.";
  }

  if (!Number.isInteger(inputs.wantedLevel) || inputs.wantedLevel <= inputs.currentLevel) {
    return "Wanted level must be a whole number above your current level.";
  }

  const maxDataLevel = Math.max(...levels.keys());
  if (inputs.wantedLevel > maxDataLevel + 1) {
    return `The highest reachable level in this season's dataset is ${integerFormatter.format(maxDataLevel + 1)}.`;
  }

  if (!Number.isFinite(inputs.currentXp) || inputs.currentXp < 0) {
    return "Current XP must be zero or greater.";
  }

  const currentRequiredXp = levels.get(inputs.currentLevel);
  if (inputs.currentXp > currentRequiredXp) {
    return `Current XP cannot exceed the ${integerFormatter.format(currentRequiredXp)} XP required for this level.`;
  }

  if (!Number.isFinite(inputs.xpPerHour) || inputs.xpPerHour <= 0) {
    return "XP gained per hour must be greater than zero.";
  }

  for (let level = inputs.currentLevel; level < inputs.wantedLevel; level += 1) {
    if (!levels.has(level)) {
      return `XP data is unavailable for level ${integerFormatter.format(level)} in this season.`;
    }
  }

  return null;
}

function calculate(inputs) {
  const levels = seasonData.get(inputs.season);
  const currentRequiredXp = levels.get(inputs.currentLevel);
  const nextRemainingXp = Math.max(0, currentRequiredXp - inputs.currentXp);
  const currentProgress = currentRequiredXp === 0 ? 1 : Math.min(1, inputs.currentXp / currentRequiredXp);

  let totalXp = 0;
  for (let level = inputs.currentLevel; level < inputs.wantedLevel; level += 1) {
    totalXp += levels.get(level);
  }

  const goalRemainingXp = Math.max(0, totalXp - inputs.currentXp);

  return {
    ...inputs,
    nextLevel: inputs.currentLevel + 1,
    currentRequiredXp,
    nextRemainingXp,
    currentProgress,
    nextHours: nextRemainingXp / inputs.xpPerHour,
    levelsRemaining: inputs.wantedLevel - inputs.currentLevel,
    goalRemainingXp,
    goalHours: goalRemainingXp / inputs.xpPerHour,
  };
}

function formatDuration(hours) {
  if (!Number.isFinite(hours)) {
    return "—";
  }

  if (hours <= 0) {
    return "Ready now";
  }

  const totalMinutes = Math.ceil(hours * 60);
  const days = Math.floor(totalMinutes / 1440);
  const remainingAfterDays = totalMinutes % 1440;
  const wholeHours = Math.floor(remainingAfterDays / 60);
  const minutes = remainingAfterDays % 60;
  const parts = [];

  if (days > 0) parts.push(`${days}d`);
  if (wholeHours > 0) parts.push(`${wholeHours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(" ");
}

function renderResults(result) {
  const progressPercent = Math.round(result.currentProgress * 1000) / 10;

  elements.nextLevelValue.textContent = integerFormatter.format(result.nextLevel);
  elements.progressPercent.textContent = `${progressPercent}%`;
  elements.progressFill.style.width = `${Math.min(100, progressPercent)}%`;
  elements.nextRequiredXp.textContent = integerFormatter.format(result.currentRequiredXp);
  elements.nextRemainingXp.textContent = integerFormatter.format(result.nextRemainingXp);
  elements.nextTime.textContent = formatDuration(result.nextHours);
  elements.nextHours.textContent = decimalFormatter.format(result.nextHours);

  elements.goalLevelValue.textContent = integerFormatter.format(result.wantedLevel);
  elements.levelsRemaining.textContent = `${integerFormatter.format(result.levelsRemaining)} ${result.levelsRemaining === 1 ? "level" : "levels"}`;
  elements.goalRemainingXp.textContent = integerFormatter.format(result.goalRemainingXp);
  elements.goalTime.textContent = formatDuration(result.goalHours);
  elements.goalHours.textContent = decimalFormatter.format(result.goalHours);
  elements.goalRate.textContent = integerFormatter.format(result.xpPerHour);

  elements.results.hidden = false;
  elements.copyStatus.textContent = "";
  latestResult = result;

  elements.results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildResultText(result) {
  return [
    "SXS XP Calculator",
    `Season: ${result.season}`,
    `Current level: ${integerFormatter.format(result.currentLevel)}`,
    `Wanted level: ${integerFormatter.format(result.wantedLevel)}`,
    `XP per hour: ${integerFormatter.format(result.xpPerHour)}`,
    "",
    `Next level (${integerFormatter.format(result.nextLevel)}): ${integerFormatter.format(result.nextRemainingXp)} XP remaining — ${formatDuration(result.nextHours)}`,
    `Wanted level (${integerFormatter.format(result.wantedLevel)}): ${integerFormatter.format(result.goalRemainingXp)} XP remaining — ${formatDuration(result.goalHours)}`,
  ].join("\n");
}

async function copyLatestResults() {
  if (!latestResult) return;

  const text = buildResultText(latestResult);
  try {
    await navigator.clipboard.writeText(text);
    elements.copyStatus.textContent = "Results copied.";
  } catch {
    elements.copyStatus.textContent = "Copy failed. Select and copy the results manually.";
  }
}

function resetCalculator() {
  elements.form.reset();
  elements.season.value = "";
  elements.currentXp.value = "0";
  elements.results.hidden = true;
  elements.copyStatus.textContent = "";
  latestResult = null;
  hideError();
  updateSeasonLimits();
  elements.season.focus();
}

async function loadData() {
  setControlsEnabled(false);

  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Data request failed with status ${response.status}.`);
    }

    const records = await response.json();
    seasonData = normalizeData(records);
    if (seasonData.size === 0) {
      throw new Error("No usable XP records were found.");
    }

    const recordCount = [...seasonData.values()].reduce((total, levels) => total + levels.size, 0);

    populateSeasons();
    setControlsEnabled(true);
    elements.dataStatus.textContent = `${integerFormatter.format(recordCount)} XP records loaded`;
    elements.dataStatus.classList.add("ready");
  } catch (error) {
    console.error(error);
    elements.dataStatus.textContent = "XP data could not load";
    elements.dataStatus.classList.add("error");
    showError("The XP dataset could not be loaded. Refresh the page and try again.");
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  hideError();

  const inputs = getInputs();
  const validationError = validateInputs(inputs);

  if (validationError) {
    elements.results.hidden = true;
    latestResult = null;
    showError(validationError);
    return;
  }

  renderResults(calculate(inputs));
});

elements.season.addEventListener("change", updateSeasonLimits);
elements.currentLevel.addEventListener("input", updateWantedMinimum);
elements.resetButton.addEventListener("click", resetCalculator);
elements.copyResults.addEventListener("click", copyLatestResults);

loadData();
