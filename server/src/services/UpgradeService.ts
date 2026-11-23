import {
  POWERUPS,
  UPGRADE_TREE,
  type PowerUpId,
  type UpgradeBranch,
} from '../../../shared/config';
import type { PlayerProfile } from '../../../shared/types';
import {
  checkGoalProgress,
  chosenUpgradeId,
  employeeCount,
  hasUpgrade,
  nextUnlockedCategory,
  recordExpense,
  syncExpiredPowerUps,
  type EconomyNotice,
} from './EconomyService';

export interface UpgradeResult {
  ok: boolean;
  error?: string;
  notices: EconomyNotice[];
}

export function purchaseUpgrade(
  profile: PlayerProfile,
  branch: UpgradeBranch,
  tier: number,
  optionId: string,
): UpgradeResult {
  const notices: EconomyNotice[] = [];
  const branchDef = UPGRADE_TREE[branch];
  if (!branchDef) return { ok: false, error: 'Unknown upgrade branch.', notices };
  const tierDef = branchDef.tiers.find((t) => t.tier === tier);
  if (!tierDef) return { ok: false, error: 'Unknown upgrade tier.', notices };
  const option = tierDef.options.find((o) => o.id === optionId);
  if (!option) return { ok: false, error: 'That upgrade is not available.', notices };

  const existing = chosenUpgradeId(profile, branch, tier);
  if (existing) {
    return { ok: false, error: 'You have already chosen an upgrade for this tier.', notices };
  }
  if (tier > 1 && !chosenUpgradeId(profile, branch, tier - 1)) {
    return { ok: false, error: `Complete ${branchDef.name} Tier ${tier - 1} first.`, notices };
  }
  if (option.id === 'newCategory' && !nextUnlockedCategory(profile)) {
    return { ok: false, error: 'You already carry every product category.', notices };
  }
  if (profile.balance < option.price) {
    return { ok: false, error: `You need ₱${option.price - Math.floor(profile.balance)} more.`, notices };
  }

  profile.balance -= option.price;
  recordExpense(profile, 'Business upgrades', option.price);
  profile.chosenUpgrades[`${branch}-${tier}`] = option.id;
  profile.lifetime.totalUpgrades += 1;

  switch (option.id) {
    case 'secondStall':
      profile.stallCount = 2;
      break;
    case 'newCategory': {
      const category = nextUnlockedCategory(profile);
      if (category) {
        profile.unlockedCategories.push(category);
        notices.push({
          kind: 'success',
          title: 'New category unlocked',
          message: 'Your shop now carries another product category. Stock it from the Shop.',
        });
      }
      break;
    }
    case 'permanentKiosk':
      notices.push({
        kind: 'success',
        title: 'Permanent kiosk',
        message: 'Your nightly setup fee is gone. The stall is yours for good.',
      });
      break;
    default:
      break;
  }

  profile.employees = employeeCount(profile);
  profile.stallCount = Math.max(profile.stallCount, 1 + (hasUpgrade(profile, 'secondStall') ? 1 : 0));
  profile.reputation = Math.min(100, profile.reputation + 1.5);
  notices.push({
    kind: 'success',
    title: `${option.name} installed`,
    message: option.effect,
  });
  checkGoalProgress(profile, notices);
  profile.updatedAt = Date.now();
  return { ok: true, notices };
}

export interface PowerUpResult {
  ok: boolean;
  error?: string;
  notices: EconomyNotice[];
}

export function activatePowerUp(
  profile: PlayerProfile,
  id: string,
  now: number,
  msUntilDayEnd: number,
): PowerUpResult {
  const notices: EconomyNotice[] = [];
  const definition = POWERUPS[id as PowerUpId];
  if (!definition) return { ok: false, error: 'Unknown power-up.', notices };
  syncExpiredPowerUps(profile, now);

  const alreadyActive = profile.powerUps.some((p) => {
    if (p.id !== id) return false;
    if (p.endsAt !== null) return p.endsAt > now;
    return (p.uses ?? 0) > 0;
  });
  if (alreadyActive) return { ok: false, error: 'That power-up is already active.', notices };
  if (profile.balance < definition.price) {
    return { ok: false, error: `You need ₱${definition.price - Math.floor(profile.balance)} more.`, notices };
  }

  profile.balance -= definition.price;
  recordExpense(profile, 'Power-ups', definition.price);

  let endsAt: number | null = now + (definition.durationMs === 'day' ? msUntilDayEnd : 0);
  if (definition.durationMs === 'day') endsAt = now + msUntilDayEnd;
  else if (definition.durationMs === 'untilUsed') endsAt = null;
  else endsAt = now + definition.durationMs;

  profile.powerUps.push({
    id: definition.id,
    activatedAt: now,
    endsAt,
    uses: definition.id === 'permitShield' ? 1 : undefined,
  });

  if (definition.id === 'permitShield') profile.permitShields = Math.min(3, profile.permitShields + 1);

  notices.push({
    kind: 'success',
    title: `${definition.name} activated`,
    message: definition.description,
  });
  profile.updatedAt = now;
  return { ok: true, notices };
}

export function consumePermitShield(profile: PlayerProfile): boolean {
  if (profile.permitShields <= 0) return false;
  profile.permitShields -= 1;
  const shieldState = profile.powerUps.find(
    (p) => p.id === 'permitShield' && (p.uses ?? 0) > 0,
  );
  if (shieldState) {
    shieldState.uses = Math.max(0, (shieldState.uses ?? 1) - 1);
    if ((shieldState.uses ?? 0) <= 0) {
      profile.powerUps = profile.powerUps.filter((p) => p !== shieldState);
    }
  } else {
    profile.powerUps = profile.powerUps.filter((p) => p.id !== 'permitShield' || (p.uses ?? 0) > 0);
  }
  return true;
}
