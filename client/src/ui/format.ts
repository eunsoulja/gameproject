import {
  DAY_MS,
  GOALS,
  UPGRADE_TREE,
  gameClock,
  phaseFor,
  type UpgradeBranch,
} from '../../../shared/config';
import type { PlayerProfile } from '../../../shared/types';

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function peso(value: number, decimals = 0): string {
  const clamped = Math.abs(Math.round(value * 10 ** decimals) / 10 ** decimals);
  const formatted = decimals
    ? new Intl.NumberFormat('en-PH', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(clamped)
    : pesoFormatter.format(clamped);
  return `${value < 0 ? '-' : ''}₱${formatted}`;
}

export function signedPeso(value: number): string {
  if (Math.abs(value) < 0.5) return '₱0';
  return `${value > 0 ? '+' : '−'}₱${pesoFormatter.format(Math.abs(Math.round(value)))}`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function currentProgress(profile: PlayerProfile, receivedAt: number, now = Date.now()): number {
  const elapsed = Math.max(0, now - receivedAt) / DAY_MS;
  return clamp(profile.dayProgress + elapsed, 0, 0.999);
}

export function clockLabel(progress: number): string {
  return gameClock(progress);
}

export function phaseLabel(progress: number): string {
  return phaseFor(progress).label;
}

export function weatherText(profile: PlayerProfile, progress: number): string {
  const phase = phaseFor(progress).id;
  const isNight = phase === 'evening' || phase === 'night';
  switch (profile.weather.condition) {
    case 'rain':
      return 'Rainy Night';
    case 'cloudy':
      return isNight ? 'Cloudy Night' : 'Cloudy';
    default:
      if (isNight) return 'Clear Night';
      return phase === 'morning' ? 'Clear Morning' : 'Sunny Afternoon';
  }
}

export function weatherIcon(profile: PlayerProfile, progress: number): string {
  if (profile.weather.condition === 'rain') return 'rain';
  if (profile.weather.condition === 'cloudy') return 'cloud';
  const phase = phaseFor(progress).id;
  return phase === 'morning' || phase === 'afternoon' ? 'sun' : 'moon';
}

export function upgradeCounts(profile: PlayerProfile): Record<UpgradeBranch, number> {
  return {
    stall: [1, 2, 3].filter((t) => profile.chosenUpgrades[`stall-${t}`]).length,
    workers: [1, 2, 3].filter((t) => profile.chosenUpgrades[`workers-${t}`]).length,
    security: [1, 2, 3].filter((t) => profile.chosenUpgrades[`security-${t}`]).length,
    products: [1, 2, 3].filter((t) => profile.chosenUpgrades[`products-${t}`]).length,
  };
}

export interface NextUpgradeInfo {
  tier: number | null;
  options: Array<{ id: string; price: number; name: string }>;
  cheapest: number | null;
}

export function nextTier(profile: PlayerProfile, branch: UpgradeBranch): NextUpgradeInfo {
  const tree = UPGRADE_TREE[branch];
  for (const tier of tree.tiers) {
    if (!profile.chosenUpgrades[`${branch}-${tier.tier}`]) {
      return {
        tier: tier.tier,
        options: tier.options.map((o) => ({ id: o.id, price: o.price, name: o.name })),
        cheapest: Math.min(...tier.options.map((o) => o.price)),
      };
    }
  }
  return { tier: null, options: [], cheapest: null };
}

export interface GoalInfo {
  title: string;
  fraction: number;
  progressLabel: string;
  stage: number;
  total: number;
  complete: boolean;
}

export function goalInfo(profile: PlayerProfile): GoalInfo {
  const stage = Math.min(profile.goalStage, GOALS.length);
  const total = GOALS.length;
  if (stage >= GOALS.length) {
    return {
      title: 'Colon legend. Every goal complete!',
      fraction: 1,
      progressLabel: '100%',
      stage: total,
      total,
      complete: true,
    };
  }
  const goal = GOALS[stage];
  let fraction = 0;
  let progressLabel = '';
  switch (stage) {
    case 0:
      fraction = profile.lifetime.totalEarnings / 5000;
      progressLabel = `${peso(Math.min(profile.lifetime.totalEarnings, 5000))} / ₱5,000`;
      break;
    case 1:
      fraction = profile.lifetime.totalCustomers / 150;
      progressLabel = `${Math.min(profile.lifetime.totalCustomers, 150)} / 150 customers`;
      break;
    case 2: {
      const count = Object.keys(profile.chosenUpgrades).length;
      const branches = new Set(Object.keys(profile.chosenUpgrades).map((k) => k.split('-')[0])).size;
      fraction = Math.min(1, Math.max(count / 3, branches / 2));
      progressLabel = `${count} upgrades · ${branches} branches`;
      break;
    }
    case 3:
      fraction = Math.min(profile.reputation / 60, profile.lifetime.totalEarnings / 20000);
      progressLabel = `${Math.floor(profile.reputation)}/60 rep · ${peso(profile.lifetime.totalEarnings)}/₱20k`;
      break;
    case 4: {
      const cats = profile.unlockedCategories.length;
      const tier3 = Object.keys(profile.chosenUpgrades).some((k) => k.endsWith('-3'));
      fraction = Math.min(1, cats / 4) * (tier3 ? 1 : 0.75);
      progressLabel = `${cats}/4 categories${tier3 ? ' · Tier 3 unlocked' : ''}`;
      break;
    }
    default:
      fraction = profile.lifetime.totalEarnings / 100000;
      progressLabel = `${peso(Math.min(profile.lifetime.totalEarnings, 100000))} / ₱100,000`;
  }
  const clamped = clamp(fraction, 0, 1);
  return {
    title: goal.title,
    fraction: clamped,
    progressLabel: clamped >= 1 ? 'Ready to claim!' : progressLabel,
    stage: stage + 1,
    total,
    complete: false,
  };
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
