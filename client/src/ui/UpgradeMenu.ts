import {
  BRANCH_ORDER,
  UPGRADE_TREE,
  type UpgradeBranch,
  type UpgradeOption,
  type UpgradeTier,
} from '../../../shared/config';
import type { PlayerProfile } from '../../../shared/types';
import { isModalOpen, modalHeader, openModal, type ModalHandle } from './Modal';
import { escapeHtml, peso } from './format';
import { icon } from './icons';
import type { MenuContext } from './MenuContext';

export class UpgradeMenu {
  private ctx: MenuContext;
  private handle: ModalHandle | null = null;
  private activeBranch: UpgradeBranch = 'stall';
  private busy = false;

  constructor(ctx: MenuContext) {
    this.ctx = ctx;
  }

  open(branch: UpgradeBranch = 'stall'): void {
    this.activeBranch = branch;
    const profile = this.ctx.getProfile();
    this.handle = openModal(
      `
        ${modalHeader({
          eyebrow: 'Business upgrades',
          eyebrowIcon: icon('arrowUp', 13),
          title: 'Grow the merkado',
          subtitle: 'Every tier is a permanent choice. Pick the path that fits your stall.',
          right: `<div class="modal-balance">${icon('coin', 14)}<span data-ref="balance">${peso(profile.balance)}</span></div>`,
        })}
        <div class="branch-tabs" data-ref="tabs"></div>
        <div class="modal-body" data-ref="body"></div>
        <div class="modal-foot">
          <span class="modal-foot-note legend-lock">${icon('lock', 11)} Tiers unlock in order · choices are permanent</span>
          <button type="button" class="btn-ghost" data-modal-close>Close</button>
        </div>
      `,
      'upgrade-modal',
    );
    this.renderTabs();
    this.renderBody();
    this.bind();
  }

  refresh(_profile: PlayerProfile): void {
    if (!this.handle) return;
    this.renderTabs();
    this.renderBody();
    this.updateBalance();
  }

  private get profile(): PlayerProfile {
    return this.ctx.getProfile();
  }

  private bind(): void {
    if (!this.handle) return;
    this.handle.el.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const tab = target.closest<HTMLElement>('[data-branch-tab]');
      if (tab) {
        const branch = tab.dataset.branchTab as UpgradeBranch;
        if (branch && BRANCH_ORDER.includes(branch)) {
          this.activeBranch = branch;
          this.renderTabs();
          this.renderBody();
        }
        return;
      }
      const buy = target.closest<HTMLButtonElement>('[data-buy]');
      if (buy && !this.busy) {
        void this.purchase(
          buy.dataset.branch as UpgradeBranch,
          Number(buy.dataset.tier),
          buy.dataset.buy!,
        );
      }
    });
  }

  private renderTabs(): void {
    if (!this.handle) return;
    const tabs = this.handle.el.querySelector<HTMLElement>('[data-ref="tabs"]');
    if (!tabs) return;
    tabs.innerHTML = BRANCH_ORDER.map((branch) => {
      const def = UPGRADE_TREE[branch];
      const owned = [1, 2, 3].filter((tier) => this.profile.chosenUpgrades[`${branch}-${tier}`]).length;
      return `
        <button type="button" class="branch-tab ${branch === this.activeBranch ? 'active' : ''}"
          data-branch-tab="${branch}" style="--branch-color:${def.color}">
          <span class="branch-tab-icon">${icon(def.icon, 16)}</span>
          <span>
            <b>${def.name}</b>
            <small>${owned}/3 tiers</small>
          </span>
          <span class="branch-dots">${[1, 2, 3].map((tier) => `<i class="${this.profile.chosenUpgrades[`${branch}-${tier}`] ? 'done' : ''}"></i>`).join('')}</span>
        </button>
      `;
    }).join('');
  }

  private renderBody(): void {
    if (!this.handle) return;
    const body = this.handle.el.querySelector<HTMLElement>('[data-ref="body"]');
    if (!body) return;
    const branch = this.activeBranch;
    const def = UPGRADE_TREE[branch];
    const chosenCount = [1, 2, 3].filter((tier) => this.profile.chosenUpgrades[`${branch}-${tier}`]).length;
    const firstOpen = def.tiers.findIndex((tier) => !this.profile.chosenUpgrades[`${branch}-${tier.tier}`]);

    body.innerHTML = `
      <div class="branch-hero" style="--branch-color:${def.color}">
        <div class="branch-hero-icon">${icon(def.icon, 22)}</div>
        <div>
          <h3>${def.name}</h3>
          <p>${def.blurb}</p>
        </div>
        <div class="tier-progress"><b>${chosenCount}/3</b>Tiers chosen</div>
      </div>
      <div class="upgrade-tiers">
        ${def.tiers.map((tier, index) => this.renderTier(tier, index, firstOpen)).join('')}
      </div>
      <div class="upgrade-footer">
        <span class="legend-lock">${icon('lock', 11)} Later tiers require the previous tier.</span>
        <span>Daily wages are charged at closing time.</span>
      </div>
    `;
  }

  private renderTier(tier: UpgradeTier, index: number, firstOpen: number): string {
    const branch = this.activeBranch;
    const chosenId = this.profile.chosenUpgrades[`${branch}-${tier.tier}`];
    const locked = firstOpen !== -1 && index > firstOpen;
    const available = !locked && !chosenId;
    const status = chosenId
      ? `<span class="tier-status done">${icon('check', 9)} Completed</span>`
      : available
        ? '<span class="tier-status ready">Open now</span>'
        : '<span class="tier-status">Locked</span>';
    return `
      <section class="upgrade-tier ${locked ? 'locked-tier' : ''} ${chosenId ? 'completed-tier' : ''}">
        <div class="tier-label">
          <div class="tier-kicker">Tier ${tier.tier}</div>
          <h4>${tier.name}</h4>
          <p>${available ? 'Choose one permanent upgrade.' : chosenId ? 'Path selected for this tier.' : 'Finish the tier above first.'}</p>
          ${status}
        </div>
        <div class="tier-options">
          ${tier.options.map((option) => this.renderOption(option, tier, chosenId, locked, available)).join('')}
        </div>
      </section>
    `;
  }

  private renderOption(
    option: UpgradeOption,
    tier: UpgradeTier,
    chosenId: string | undefined,
    locked: boolean,
    available: boolean,
  ): string {
    const owned = chosenId === option.id;
    const alternative = !!chosenId && !owned;
    const affordable = this.profile.balance >= option.price;
    const branchDef = UPGRADE_TREE[this.activeBranch];
    const wage = option.dailyCost ? `₱${option.dailyCost}/day wage` : '';
    return `
      <article class="upg-card ${owned ? 'owned' : ''} ${locked ? 'locked' : ''} ${alternative ? 'alternative' : ''}"
        style="--upg-color:${branchDef.color}">
        <div class="upg-card-top">
          <div class="upg-icon">${icon(option.icon, 17)}</div>
          <div style="min-width:0">
            <div class="upg-name">${escapeHtml(option.name)}</div>
            <div class="upg-price">${peso(option.price)}</div>
          </div>
        </div>
        <p class="upg-desc">${escapeHtml(option.description)}</p>
        <div class="upg-effect">${icon('sparkle', 11)}<span>${escapeHtml(option.effect)}</span></div>
        <div class="upg-actions">
          ${wage ? `<span class="upg-wage">${wage}</span>` : '<span class="upg-wage">One-time cost</span>'}
          ${
            owned
              ? `<span class="owned-stamp">${icon('checkCircle', 12)} Installed</span>`
              : alternative
                ? '<span class="locked-note">Other path chosen</span>'
                : locked
                  ? `<span class="locked-note">${icon('lock', 10)} Tier locked</span>`
                  : available
                    ? `<button type="button" class="btn-buy ${affordable ? 'affordable' : ''}" data-buy="${option.id}" data-branch="${this.activeBranch}" data-tier="${tier.tier}" ${affordable ? '' : 'disabled'}>
                        ${icon('coin', 11)} Buy ${peso(option.price)}
                      </button>`
                    : ''
          }
        </div>
      </article>
    `;
  }

  private async purchase(branch: UpgradeBranch, tier: number, optionId: string): Promise<void> {
    this.busy = true;
    this.setButtonsDisabled(true);
    try {
      const result = await this.ctx.network.purchaseUpgrade(branch, tier, optionId);
      if (!result.ok) {
        this.ctx.notify.info('Upgrade not completed', result.error ?? 'Please try again.', 'warning');
        return;
      }
      if (result.data) {
        this.ctx.onProfile(result.data);
      }
      this.renderTabs();
      this.renderBody();
      this.updateBalance();
    } catch {
      this.ctx.notify.info('Upgrade not completed', 'The market did not respond. Try again.', 'warning');
    } finally {
      this.busy = false;
      this.setButtonsDisabled(false);
    }
  }

  private setButtonsDisabled(disabled: boolean): void {
    this.handle?.el.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((button) => {
      if (disabled) {
        button.dataset.wasDisabled = button.disabled ? '1' : '0';
        button.disabled = true;
      } else if (button.dataset.wasDisabled === '1') {
        button.disabled = true;
      } else if (button.dataset.wasDisabled === '0') {
        button.disabled = false;
      }
      if (!disabled) delete button.dataset.wasDisabled;
    });
  }

  private updateBalance(): void {
    const el = this.handle?.el.querySelector<HTMLElement>('[data-ref="balance"]');
    if (el) el.textContent = peso(this.profile.balance);
  }

  get isOpen(): boolean {
    return !!this.handle && isModalOpen();
  }
}
