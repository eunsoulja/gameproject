import type { PlayerProfile } from './types';

export interface TutorialStepDef {
  label: string;
  hint: string;
  reward: number;
  done: (profile: PlayerProfile) => boolean;
}

/** First-night arc: each step pays a small bonus so learning feels profitable. */
export const TUTORIAL_STEPS: TutorialStepDef[] = [
  {
    label: 'Make your first sales',
    hint: 'Keep stock on the shelf and let the evening crowd find you — or press E at your counter to serve them yourself.',
    reward: 150,
    done: (p) => p.lifetime.totalProductsSold >= 3,
  },
  {
    label: 'Buy your first upgrade',
    hint: 'Stand on a colored pad beside your bay and press E — the Stall branch is cheapest to start.',
    reward: 200,
    done: (p) => p.lifetime.totalUpgrades >= 1,
  },
  {
    label: 'Serve the crowd',
    hint: 'Earn ₱1,000 in total sales. Your regulars are already taking notice.',
    reward: 250,
    done: (p) => p.lifetime.totalRevenue >= 1000,
  },
  {
    label: 'Survive to day three',
    hint: 'Restock, watch the weather, and keep prices fair — the market rewards consistency.',
    reward: 400,
    done: (p) => p.lifetime.daysPlayed >= 2,
  },
];

/** Current onboarding objective, or null once the arc is done. */
export function tutorialState(
  profile: PlayerProfile,
): { step: number; label: string; hint: string; reward: number; total: number } | null {
  if (profile.tutorialStep >= TUTORIAL_STEPS.length) return null;
  const def = TUTORIAL_STEPS[profile.tutorialStep];
  return { step: profile.tutorialStep, label: def.label, hint: def.hint, reward: def.reward, total: TUTORIAL_STEPS.length };
}
