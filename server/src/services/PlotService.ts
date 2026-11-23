import { MAX_PLOTS, type StallCategory } from '../../../shared/config';
import type { PlayerProfile, PublicPlot } from '../../../shared/types';
import { chosenUpgradeIds } from './EconomyService';

export function findFreePlot(profiles: Iterable<PlayerProfile>, excludedPlayerId?: string): number | null {
  const used = new Set<number>();
  for (const profile of profiles) {
    if (profile.id === excludedPlayerId) continue;
    if (profile.plotIndex >= 0 && profile.plotIndex < MAX_PLOTS) used.add(profile.plotIndex);
  }
  for (let i = 0; i < MAX_PLOTS; i++) {
    if (!used.has(i)) return i;
  }
  return null;
}

export function toPublicPlot(profile: PlayerProfile): PublicPlot {
  return {
    index: profile.plotIndex,
    ownerId: profile.id,
    ownerName: profile.name,
    businessName: profile.businessName,
    categories: [...profile.unlockedCategories] as StallCategory[],
    reputation: Number(profile.reputation.toFixed(1)),
    stallCount: profile.stallCount,
    upgrades: chosenUpgradeIds(profile),
    totalEarnings: Math.round(profile.lifetime.totalEarnings),
    online: !!profile.online,
    appearance: profile.appearance,
    lastSeen: profile.updatedAt,
  };
}

export function sortPlots(plots: PublicPlot[]): PublicPlot[] {
  return [...plots].sort((a, b) => a.index - b.index);
}
