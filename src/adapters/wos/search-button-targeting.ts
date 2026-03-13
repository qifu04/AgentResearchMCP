export const WOS_SEARCH_BUTTON_CANDIDATE_ATTRIBUTE = "data-agent-research-wos-search-candidate";

export interface WosSearchButtonCandidate {
  id: string;
  text: string;
  ariaLabel: string | null;
  className: string;
  disabled: boolean;
  withinQueryBuilderForm: boolean;
  withinQueryPreviewSection: boolean;
  withinQueryPreviewButtonRow: boolean;
}

export function chooseWosPrimarySearchButtonCandidate(candidates: readonly WosSearchButtonCandidate[]): string | null {
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: scoreWosPrimarySearchButtonCandidate(candidate),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.candidate.id ?? null;
}

function scoreWosPrimarySearchButtonCandidate(candidate: WosSearchButtonCandidate): number {
  const text = normalizeCandidateText(candidate.text);
  const ariaLabel = normalizeCandidateText(candidate.ariaLabel);
  const className = normalizeCandidateText(candidate.className);
  const combined = `${text} ${ariaLabel}`.trim();

  let score = 0;

  if (/^search$/.test(text)) {
    score += 200;
  } else if (/\bsearch\b/.test(combined)) {
    score += 20;
  }

  if (/\bsearch history\b/.test(combined)) {
    score -= 250;
  }

  if (/\bsaved searches?\b/.test(combined) || /\balerts?\b/.test(combined)) {
    score -= 220;
  }

  if (/\badd to query\b/.test(combined) || /\bclear\b/.test(combined)) {
    score -= 150;
  }

  if (candidate.withinQueryPreviewButtonRow) {
    score += 160;
  }

  if (candidate.withinQueryPreviewSection) {
    score += 90;
  }

  if (candidate.withinQueryBuilderForm) {
    score += 30;
  }

  if (/\bsearch\b/.test(className)) {
    score += 20;
  }

  if (candidate.disabled || /\bdisabled\b/.test(className)) {
    score -= 180;
  }

  return score;
}

function normalizeCandidateText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}
