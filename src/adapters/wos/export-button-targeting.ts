export const WOS_EXPORT_BUTTON_CANDIDATE_ATTRIBUTE = "data-agent-research-wos-export-candidate";

export interface WosExportButtonCandidate {
  id: string;
  text: string;
  ariaLabel: string | null;
  className: string;
  disabled: boolean;
  withinRefinePanel: boolean;
  withinSummaryToolbar: boolean;
  isMenuTrigger: boolean;
  hasPrimaryExportClass: boolean;
}

export function chooseWosPrimaryExportButtonCandidate(candidates: readonly WosExportButtonCandidate[]): string | null {
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: scoreWosPrimaryExportButtonCandidate(candidate),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.candidate.id ?? null;
}

function scoreWosPrimaryExportButtonCandidate(candidate: WosExportButtonCandidate): number {
  const text = normalizeCandidateText(candidate.text);
  const ariaLabel = normalizeCandidateText(candidate.ariaLabel);
  const className = normalizeCandidateText(candidate.className);
  const combined = `${text} ${ariaLabel}`.trim();

  let score = 0;

  if (/^export\b/.test(text)) {
    score += 220;
  } else if (/\bexport\b/.test(combined)) {
    score += 40;
  }

  if (/\bexport refine\b/.test(combined) || /\brefine\b/.test(combined)) {
    score -= 260;
  }

  if (candidate.withinRefinePanel) {
    score -= 200;
  }

  if (candidate.withinSummaryToolbar) {
    score += 80;
  }

  if (candidate.isMenuTrigger || /\bmat-mdc-menu-trigger\b/.test(className)) {
    score += 100;
  }

  if (candidate.hasPrimaryExportClass || /\bnew-wos-btn-style\b/.test(className)) {
    score += 120;
  }

  if (candidate.disabled || /\bdisabled\b/.test(className)) {
    score -= 220;
  }

  return score;
}

function normalizeCandidateText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}
