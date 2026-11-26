import {
  BRANCH_ORDER,
  GOALS,
  MARKET_EVENTS,
  POWERUPS,
  PRODUCTS,
  UPGRADE_TREE,
  dateForDay,
  phaseFor,
  type ActiveEventState,
  type PowerUpId,
  type UpgradeBranch,
} from '../../../shared/config';
import type { PlayerProfile } from '../../../shared/types';
import {
  clockLabel,
  currentProgress,
  escapeHtml,
  formatDuration,
  goalInfo,
  nextTier,
  peso,
  phaseLabel,
  weatherIcon,
  weatherText,
} from './format';
import { BRANCH_ICONS, EVENT_ICONS, icon } from './icons';

export interface HUDActions {
  onBranch: (branch: UpgradeBranch) => void;
  onBoosts: () => void;
  onShop: () => void;
  onStats: () => void;
  onSettings: () => void;
  onHelp: () => void;
}

export interface PromptInfo {
  key?: string;
  title: string;
  subtitle?: string;
  price?: string;
}

export class HUD {
  private root: HTMLElement;
  private actions: HUDActions;
  private profile: PlayerProfile | null = null;
  private profileAt = Date.now();
  private serverOffset = 0;
  private online = 0;
  private event: ActiveEventState | null = null;
  private lastBalance = -1;
  private tickTimer = 0;
  private hintTimer = 0;
  private promptVisible = false;

  constructor(root: HTMLElement, actions: HUDActions) {
    this.root = root;
    this.actions = actions;
    this.render();
    this.bind();
    this.tickTimer = window.setInterval(() => this.tick(), 500);
  }

  private render(): void {
    this.root.innerHTML = `
      <header class="hud-top">
        <div class="hud-panel panel-day">
          <div class="panel-icon">${icon('calendar', 19)}</div>
          <div class="panel-copy">
            <span class="panel-label">Day</span>
            <div class="panel-value" data-ref="day-value">Day 1</div>
            <span class="panel-sub" data-ref="day-date">Mon, Nov 16</span>
          </div>
        </div>
        <div class="hud-panel panel-money">
          <div class="panel-icon">${icon('cash', 20)}</div>
          <div class="panel-copy">
            <span class="panel-label">Balance</span>
            <div class="panel-value" data-ref="money-value">₱1,250</div>
            <span class="panel-sub" data-ref="money-sub">Today <b>+₱0</b></span>
          </div>
        </div>
        <div class="hud-panel panel-rep">
          <div class="panel-icon">${icon('star', 19)}</div>
          <div class="panel-copy">
            <span class="panel-label">Reputation</span>
            <div class="panel-value"><span data-ref="rep-value">0</span><span style="font-size:9px;color:#7e8895;font-weight:600">/100</span></div>
            <div class="rep-bar"><span data-ref="rep-bar"></span></div>
            <span class="panel-sub" data-ref="rep-sub">New vendor on the block</span>
          </div>
        </div>
        <div class="hud-panel panel-weather" data-ref="weather-panel">
          <div class="panel-icon" data-ref="weather-icon">${icon('moon', 19)}</div>
          <div class="panel-copy">
            <span class="panel-label">Weather</span>
            <div class="panel-value" data-ref="weather-value">Clear Night</div>
            <span class="panel-sub" data-ref="weather-sub">24°C · 18:00</span>
          </div>
        </div>
      </header>

      <aside class="upgrade-menu">
        <div class="upgrade-head">
          <div class="upgrade-mark">${icon('arrowUp', 15)}</div>
          <div>
            <h3>Upgrade</h3>
            <p>Build the business</p>
          </div>
        </div>
        <div class="upgrade-list">
          ${BRANCH_ORDER.map((branch) => {
            const def = UPGRADE_TREE[branch];
            return `
              <button class="upgrade-btn" type="button" data-branch="${branch}" style="--thumb:${def.color}">
                <span class="upgrade-thumb">${icon(BRANCH_ICONS[branch], 17)}</span>
                <span class="upgrade-copy">
                  <b>+ ${def.name}</b>
                  <small data-ref="next-${branch}">Next upgrade</small>
                </span>
                <span class="upgrade-chevron">›</span>
              </button>
            `;
          }).join('')}
        </div>
        <button class="upgrade-boosts" type="button" data-action="boosts">
          ${icon('bolt', 12)} <span>Power-ups & boosts</span>
          <span class="count hidden" data-ref="boost-count">0</span>
        </button>
      </aside>

      <div class="event-chip hidden" data-ref="event-chip">
        <span class="event-ico">${icon('sparkle', 13)}</span>
        <div>
          <b data-ref="event-name">Market event</b>
          <span data-ref="event-desc">Something is happening</span>
        </div>
        <span class="event-time" data-ref="event-time">0:00</span>
      </div>

      <div class="powerup-strip" data-ref="powerup-strip"></div>

      <div class="market-meta">
        <div class="online-chip"><span class="live-dot"></span><b data-ref="online">0</b>&nbsp;vendor<span data-ref="online-s">s</span> online</div>
        <button class="icon-btn" type="button" data-action="help" aria-label="Help and controls">${icon('help', 15)}</button>
      </div>

      <aside class="goal-panel">
        <div class="goal-badge">!</div>
        <div class="goal-copy">
          <div class="goal-head">
            <b>Goal</b>
            <span data-ref="goal-stage">1 / ${GOALS.length}</span>
          </div>
          <p class="goal-text" data-ref="goal-text">Earn ₱5,000 by the end of the week!</p>
          <div class="goal-progress">
            <div class="goal-bar"><span data-ref="goal-bar"></span></div>
            <small data-ref="goal-progress">₱0 / ₱5,000</small>
          </div>
        </div>
      </aside>

      <nav class="bottom-nav">
        <button class="nav-btn" type="button" data-action="stats">
          ${icon('chart', 20)}<span>Stats</span>
        </button>
        <button class="nav-btn" type="button" data-action="shop">
          ${icon('shop', 20)}<span>Shop</span>
          <i class="nav-badge hidden" data-ref="shop-badge"></i>
        </button>
        <button class="nav-btn" type="button" data-action="settings">
          ${icon('settings', 20)}<span>Settings</span>
        </button>
      </nav>

      <div class="interaction-prompt hidden" data-ref="prompt">
        <span class="keycap" data-ref="prompt-key">E</span>
        <span class="prompt-copy">
          <b data-ref="prompt-title">Open stall</b>
          <span data-ref="prompt-sub">Manage inventory and prices</span>
        </span>
        <span class="prompt-price hidden" data-ref="prompt-price"></span>
      </div>

      <div class="hud-hint" data-ref="hint">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk</span>
        <span><kbd>Shift</kbd> run</span>
        <span><kbd>Space</kbd> jump</span>
        <span><kbd>E</kbd> interact</span>
        <span>Drag mouse to look</span>
      </div>

      <div class="mobile-controls">
        <div class="joystick-zone" id="joystick-zone" aria-label="Movement joystick">
          <div class="joystick-knob" data-ref="joystick-knob"></div>
        </div>
        <div class="mobile-actions">
          <button type="button" class="mobile-action sprint" data-mobile="sprint" aria-label="Sprint">${icon('bolt', 17)}<span>RUN</span></button>
          <button type="button" class="mobile-action interact" data-mobile="interact" aria-label="Interact">${icon('bag', 17)}<span>USE</span></button>
          <button type="button" class="mobile-action jump" data-mobile="jump" aria-label="Jump">${icon('arrowUp', 19)}<span>JUMP</span></button>
        </div>
      </div>
    `;
  }

  private bind(): void {
    this.root.querySelectorAll<HTMLElement>('[data-branch]').forEach((button) => {
      button.addEventListener('click', () => {
        const branch = button.dataset.branch as UpgradeBranch;
        this.actions.onBranch(branch);
      });
    });
    this.root.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        switch (button.dataset.action) {
          case 'stats':
            this.actions.onStats();
            break;
          case 'shop':
            this.actions.onShop();
            break;
          case 'settings':
            this.actions.onSettings();
            break;
          case 'help':
            this.actions.onHelp();
            break;
          case 'boosts':
            this.actions.onBoosts();
            break;
        }
      });
    });
    if (this.root.querySelector('.joystick-zone')) {
      document.body.classList.toggle('has-touch', matchMedia('(pointer: coarse)').matches);
    }
    this.hintTimer = window.setTimeout(() => {
      this.root.querySelector<HTMLElement>('[data-ref="hint"]')?.classList.add('fade');
    }, 11_000);
  }

  setOnline(count: number): void {
    this.online = count;
    this.el('online').textContent = String(count);
    this.el('online-s').textContent = count === 1 ? '' : 's';
  }

  setServerOffset(offset: number): void {
    this.serverOffset = offset;
  }

  setEvent(event: ActiveEventState | null): void {
    this.event = event;
    this.renderEvent();
    this.renderPowerUps();
  }

  private serverNow(): number {
    return Date.now() + this.serverOffset;
  }

  setProfile(profile: PlayerProfile): void {
    const previousBalance = this.profile?.balance ?? profile.balance;
    this.profile = profile;
    this.profileAt = Date.now();
    if (this.event === null && profile.activeEvent) {
      this.event = profile.activeEvent;
    }
    this.renderProfile(previousBalance !== profile.balance);
    this.renderEvent();
    this.renderPowerUps();
  }

  private renderProfile(animateMoney: boolean): void {
    const profile = this.profile;
    if (!profile) return;
    const progress = currentProgress(profile, this.profileAt);
    const phase = phaseFor(progress);
    this.el('day-value').textContent = `Day ${profile.day}`;
    this.el('day-date').textContent = dateForDay(profile.day);

    const moneyEl = this.el('money-value');
    const moneyText = peso(profile.balance);
    if (moneyEl.textContent !== moneyText) {
      moneyEl.textContent = moneyText;
      if (animateMoney) {
        moneyEl.classList.remove('money-flash');
        void moneyEl.offsetWidth;
        moneyEl.classList.add('money-flash');
      }
    }
    const dayNet = profile.today.revenue - profile.today.expenses;
    const sub = this.el('money-sub');
    sub.innerHTML = `Today <b class="${dayNet >= 0 ? '' : 'neg'}" style="color:${dayNet >= 0 ? '#b4edbf' : '#e59b8f'}">${dayNet >= 0 ? '+' : '−'}${peso(Math.abs(dayNet))}</b>`;

    this.el('rep-value').textContent = String(Math.floor(profile.reputation));
    this.el('rep-bar').style.width = `${Math.min(100, profile.reputation)}%`;
    this.el('rep-sub').textContent = reputationTier(profile.reputation);

    this.renderClock(progress);

    const goal = goalInfo(profile);
    this.el('goal-stage').textContent = goal.complete ? 'Complete' : `${goal.stage} / ${goal.total}`;
    this.el('goal-text').textContent = goal.title;
    this.el('goal-bar').style.width = `${goal.fraction * 100}%`;
    this.el('goal-progress').textContent = goal.progressLabel;

    for (const branch of BRANCH_ORDER) {
      const next = nextTier(profile, branch);
      const el = this.el(`next-${branch}`);
      if (!next.tier) {
        el.textContent = 'Fully upgraded';
        el.className = 'maxed';
      } else {
        el.textContent = `Tier ${next.tier} · from ${peso(next.cheapest ?? 0)}`;
        el.className = profile.balance >= (next.cheapest ?? Infinity) ? 'ready' : '';
      }
    }

    const active = profile.powerUps.length;
    const boostCount = this.el('boost-count');
    boostCount.textContent = String(active);
    boostCount.classList.toggle('hidden', active === 0);

    const lowStock = profile.unlockedCategories.some((category) => {
      const products = PRODUCTS.filter((product) => product.category === category);
      const total = products.reduce((sum, product) => sum + (profile.inventory[product.id] ?? 0), 0);
      return total <= 4;
    });
    this.el('shop-badge').classList.toggle('hidden', !lowStock);
  }

  private renderClock(progress: number): void {
    const profile = this.profile;
    if (!profile) return;
    const time = clockLabel(progress);
    const phase = phaseLabel(progress);
    const wIcon = weatherIcon(profile, progress);
    const iconEl = this.el('weather-icon');
    iconEl.innerHTML = icon(wIcon, 19);
    this.el('weather-panel').classList.toggle('is-rain', profile.weather.condition === 'rain');
    this.el('weather-value').textContent = weatherText(profile, progress);
    this.el('weather-sub').textContent = `${Math.round(profile.weather.temperature)}°C · ${time}`;
    this.el('day-date').textContent = `${dateForDay(profile.day)} · ${phase}`;
  }

  private renderEvent(): void {
    const chip = this.el('event-chip');
    if (!this.event) {
      chip.classList.add('hidden');
      return;
    }
    const def = MARKET_EVENTS[this.event.type];
    if (!def) {
      chip.classList.add('hidden');
      return;
    }
    chip.classList.remove('hidden');
    chip.classList.toggle('positive', def.severity === 'positive');
    chip.classList.toggle('info', def.type === 'rain' || def.type === 'blackout');
    chip.querySelector('.event-ico')!.innerHTML = icon(EVENT_ICONS[def.type] ?? 'sparkle', 13);
    this.el('event-name').textContent = def.name;
    this.el('event-desc').textContent = def.severity === 'positive' ? 'Crowds are surging' : 'Market conditions changed';
  }

  private renderPowerUps(): void {
    const profile = this.profile;
    const strip = this.el('powerup-strip');
    if (!profile) {
      strip.innerHTML = '';
      return;
    }
    const now = this.serverNow();
    const active = profile.powerUps.filter((p) => p.endsAt === null || p.endsAt > now);
    const quest = profile.quest && !profile.quest.paid ? profile.quest : null;
    const questChip = quest
      ? `<div class="active-powerup quest-chip" style="--pu-color:#f0c14c" title="${escapeHtml(quest.label)}">
          ${icon('target', 13)}
          <b>Mission</b>
          <span class="time">${Math.min(quest.progress, quest.target)}/${quest.target}</span>
        </div>`
      : '';
    strip.innerHTML = questChip + active
      .map((pu) => {
        const def = powerUpDef(pu.id);
        let remaining = 'Until used';
        if (pu.endsAt !== null) remaining = formatDuration(pu.endsAt - now);
        else if (pu.id === 'permitShield') remaining = `${profile.permitShields} shield${profile.permitShields === 1 ? '' : 's'}`;
        return `
          <div class="active-powerup" style="--pu-color:${def.color}">
            ${icon(def.icon, 13)}
            <b>${escapeHtml(def.name)}</b>
            <span class="time">${remaining}</span>
          </div>
        `;
      })
      .join('');
  }

  private tick(): void {
    if (!this.profile) return;
    const progress = currentProgress(this.profile, this.profileAt);
    this.renderClock(progress);
    this.renderPowerUps();
    if (this.event) {
      const remaining = Math.max(0, this.event.endsAt - this.serverNow());
      this.el('event-time').textContent = remaining > 0 ? shortDuration(remaining) : 'ending';
    }
  }

  showPrompt(info: PromptInfo): void {
    const el = this.el('prompt');
    el.classList.remove('hidden');
    this.el('prompt-key').textContent = info.key ?? 'E';
    this.el('prompt-title').textContent = info.title;
    this.el('prompt-sub').textContent = info.subtitle ?? '';
    const priceEl = this.el('prompt-price');
    priceEl.classList.toggle('hidden', !info.price);
    priceEl.textContent = info.price ?? '';
    this.promptVisible = true;
  }

  hidePrompt(): void {
    if (!this.promptVisible) return;
    this.el('prompt').classList.add('hidden');
    this.promptVisible = false;
  }

  setOnlineVisible(visible: boolean): void {
    this.root.querySelector<HTMLElement>('.market-meta')!.style.display = visible ? '' : 'none';
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  private el(ref: string): HTMLElement {
    const found = this.root.querySelector<HTMLElement>(`[data-ref="${ref}"]`);
    if (!found) {
      const fallback = document.createElement('span');
      return fallback;
    }
    return found;
  }
}

function reputationTier(reputation: number): string {
  if (reputation >= 85) return 'Colon legend · everyone knows you';
  if (reputation >= 60) return 'Market favorite · suki everywhere';
  if (reputation >= 40) return 'Trusted vendor · good word of mouth';
  if (reputation >= 20) return 'Making a name · regulars returning';
  if (reputation >= 8) return 'Getting known · curious shoppers';
  return 'New vendor on the block';
}

function shortDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function powerUpDef(id: string): { name: string; icon: string; color: string } {
  const def = POWERUPS[id as PowerUpId];
  const iconMap: Record<string, string> = {
    iceBlock: 'ice',
    sukiDay: 'suki',
    megaphone: 'megaphone',
    tawadShield: 'security',
    priceRadar: 'radar',
    extraHands: 'hands',
    permitShield: 'permit',
  };
  return {
    name: def?.name ?? id,
    icon: iconMap[id] ?? 'sparkle',
    color: def?.color ?? '#f0b45a',
  };
}
