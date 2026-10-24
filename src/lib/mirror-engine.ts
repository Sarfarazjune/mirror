/**
 * Mirror Score & Arithmetic Engine
 * Exact formulation per specification:
 *
 * 1. Normalize weekly priority targets into intended shares.
 * 2. Add scrolling/unplanned as a target share of zero.
 * 3. Normalize actual weekly priority minutes plus wasted/scrolled minutes into actual shares.
 * 4. Mirror Score = round(100 * (1 - 0.5 * sum of absolute differences between intended and actual shares))
 * 5. Display target-completion progress separately.
 */

export interface PriorityShareInput {
  name: string;
  targetMinutes: number;
  actualMinutes: number;
  colour: string;
}

export interface MirrorCalculationResult {
  score: number; // 0 to 100
  intendedShares: Record<string, number>;
  actualShares: Record<string, number>;
  totalTargetMinutes: number;
  totalActualPriorityMinutes: number;
  wastedMinutes: number;
  targetCompletionPercent: number; // actual / target capped or relative
  summaryMessage: string;
}

export function calculateMirrorScore(
  priorities: PriorityShareInput[],
  wastedMinutes: number
): MirrorCalculationResult {
  const totalTargetMinutes = priorities.reduce((sum, p) => sum + Math.max(0, p.targetMinutes), 0);
  const totalActualPriorityMinutes = priorities.reduce((sum, p) => sum + Math.max(0, p.actualMinutes), 0);
  const totalActualTime = totalActualPriorityMinutes + Math.max(0, wastedMinutes);

  const intendedShares: Record<string, number> = {};
  const actualShares: Record<string, number> = {};

  // Compute intended shares
  priorities.forEach((p) => {
    intendedShares[p.name] = totalTargetMinutes > 0 ? p.targetMinutes / totalTargetMinutes : 0;
  });
  intendedShares['unplanned'] = 0; // target share for unplanned/wasted is always zero

  // Compute actual shares
  if (totalActualTime > 0) {
    priorities.forEach((p) => {
      actualShares[p.name] = p.actualMinutes / totalActualTime;
    });
    actualShares['unplanned'] = Math.max(0, wastedMinutes) / totalActualTime;
  } else {
    priorities.forEach((p) => {
      actualShares[p.name] = 0;
    });
    actualShares['unplanned'] = 0;
  }

  // Calculate sum of absolute differences
  let totalDifference = 0;
  // Sum across all priorities
  priorities.forEach((p) => {
    const intended = intendedShares[p.name] || 0;
    const actual = actualShares[p.name] || 0;
    totalDifference += Math.abs(intended - actual);
  });
  // Include unplanned / scrolling difference (intended = 0)
  totalDifference += Math.abs(0 - (actualShares['unplanned'] || 0));

  // Mirror Score = round(100 * (1 - 0.5 * totalDifference))
  const rawScore = 100 * (1 - 0.5 * totalDifference);
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Target completion %
  const targetCompletionPercent = totalTargetMinutes > 0
    ? Math.round((totalActualPriorityMinutes / totalTargetMinutes) * 100)
    : 0;

  // Non-judgmental, calm message
  let summaryMessage = "Your week is beginning to take shape.";
  if (totalActualTime > 0) {
    if (score >= 80) {
      summaryMessage = "Your actual time closely mirrored the priorities you set.";
    } else if (score >= 60) {
      summaryMessage = "You gave energy to what matters, with room for gentle refinement.";
    } else {
      summaryMessage = "Your week was different from the balance you chose. Take it as an honest reflection.";
    }
  }

  return {
    score,
    intendedShares,
    actualShares,
    totalTargetMinutes,
    totalActualPriorityMinutes,
    wastedMinutes,
    targetCompletionPercent,
    summaryMessage,
  };
}

/**
 * Future Lab Simulator Arithmetic:
 * Added yearly hours = slider minutes * 365 / 60
 */
export function calculateFutureLabImpact(
  currentWeeklyMinutes: number,
  sliderDailyMinutes: number
): {
  currentYearlyHours: number;
  addedYearlyHours: number;
  projectedYearlyHours: number;
  encouragingMessage: string;
} {
  const currentYearlyHours = Math.round((currentWeeklyMinutes * 52) / 60);
  const addedYearlyHours = Math.round((sliderDailyMinutes * 365) / 60);
  const projectedYearlyHours = currentYearlyHours + addedYearlyHours;

  let encouragingMessage = "Even 10 minutes a day compounds into whole seasons of mastery.";
  if (sliderDailyMinutes >= 45) {
    encouragingMessage = "A profound pivot. Nearly an hour daily reshapes your entire year.";
  } else if (sliderDailyMinutes >= 20) {
    encouragingMessage = "A solid, repeatable commitment that creates deep craft over time.";
  }

  return {
    currentYearlyHours,
    addedYearlyHours,
    projectedYearlyHours,
    encouragingMessage,
  };
}

/**
 * Rule-based Weekly Letter Generator (No AI API required)
 */
export function generateWeeklyLetter(params: {
  priorities: { name: string; why: string; targetMinutes: number; actualMinutes: number }[];
  score: number;
  experimentOutcome?: string | null;
}): string {
  const { priorities, score, experimentOutcome } = params;
  if (!priorities.length) {
    return "Reflect honestly on the days behind you. Each week is an opportunity to clarify what matters.";
  }

  // Find priority with highest focus vs lowest focus
  const sorted = [...priorities].sort((a, b) => (b.actualMinutes - a.actualMinutes));
  const topPriority = sorted[0];
  const lowestPriority = sorted[sorted.length - 1];

  let letter = `You began this week with a clear intention.`;

  if (topPriority && topPriority.actualMinutes > 0) {
    letter += ` You gave ${topPriority.actualMinutes} minutes to ${topPriority.name}, remembering why it matters: "${topPriority.why}".`;
  }

  if (lowestPriority && lowestPriority.actualMinutes < lowestPriority.targetMinutes && lowestPriority.name !== topPriority?.name) {
    letter += ` ${lowestPriority.name} received less time than planned (${lowestPriority.actualMinutes}m vs ${lowestPriority.targetMinutes}m intended). Remember your reason: "${lowestPriority.why}".`;
  }

  if (experimentOutcome) {
    letter += ` In your 7-day experiment, ${experimentOutcome}.`;
  }

  if (score >= 75) {
    letter += ` Your reflection is becoming clearer. Keep your next steps calm, grounded, and deliberate.`;
  } else {
    letter += ` Notice where your attention naturally flowed without self-criticism. Choose one small adjustment for the coming days.`;
  }

  return letter;
}
