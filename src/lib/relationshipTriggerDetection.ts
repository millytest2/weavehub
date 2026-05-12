// Detects relationship-trigger language in captured text (jealousy, comparison,
// gripping, abandonment fear). Used to auto-suggest the "old contract" line on
// the Identity Seed.

const TRIGGER_KEYWORDS = [
  "jealous", "jealousy", "comparing", "comparison",
  "instagram", "follow", "followed", "following ",
  "triggered", "trigger ", "abandoned", "abandonment",
  "grip", "gripping", "hold on tight", "holding tight",
  "controlling", "control her", "control him",
  "her boyfriend", "his girlfriend", "ex ",
  "she liked", "he liked", "scrolling her",
  "soul contract", "replaced",
];

export const OLD_CONTRACT_LINE =
  "Old contract: when I care, I grip. The fear of being abandoned through comparison is being surfaced — it is not the truth about me or her.";

export const detectRelationshipTrigger = (text: string): boolean => {
  if (!text) return false;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of TRIGGER_KEYWORDS) {
    if (lower.includes(kw)) {
      hits++;
      if (hits >= 2) return true;
    }
  }
  // Single strong signal also counts
  return /jealous|comparison|abandonment|soul contract|grip/i.test(lower) && hits >= 1;
};

export const seedHasOldContract = (seedContent: string | null | undefined): boolean => {
  if (!seedContent) return false;
  return /old contract|when i care, i grip/i.test(seedContent);
};
