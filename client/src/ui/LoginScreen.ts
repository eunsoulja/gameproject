import { CATEGORY_ORDER, STALL_CATEGORIES, type StallCategory } from '../../../shared/config';
import type { JoinResult } from '../../../shared/types';
import { escapeHtml } from './format';
import { CATEGORY_ICONS, icon } from './icons';

export interface LoginSubmitPayload {
  name: string;
  token?: string;
  category: StallCategory;
}

export class LoginScreen {
  private el: HTMLElement;
  private onSubmit: (payload: LoginSubmitPayload) => Promise<JoinResult>;
  private selectedCategory: StallCategory = 'streetFood';
  private serverInfo = { online: 0, persistence: 'memory', reachable: true };
  private busy = false;

  constructor(
    container: HTMLElement,
    onSubmit: (payload: LoginSubmitPayload) => Promise<JoinResult>,
  ) {
    this.el = container;
    this.onSubmit = onSubmit;
    this.render();
    this.bind();
  }

  private get savedName(): string {
    return localStorage.getItem('merkado.playerName') ?? '';
  }

  private get savedToken(): string | null {
    return localStorage.getItem('merkado.token');
  }

  private render(): void {
    const savedName = this.savedName;
    const hasSave = !!this.savedToken && !!savedName;
    this.el.innerHTML = `
      <div class="login-layout">
        <div class="login-brand">
          <div class="login-eyebrow">Colon Street · Cebu City · Night Market</div>
          <h1>Merkado<span>De 'Colon</span></h1>
          <p class="login-tagline">
            The street is humming. Umbrellas glow above a hundred crowded stalls, and every bay
            is somebody's dream. Set up your counter, call out your best price, and turn
            <em>₱1,250 into a Colon Street empire.</em>
          </p>
          <div class="login-chips">
            <span class="login-chip"><i class="dot"></i>Live shared night market</span>
            <span class="login-chip">${icon('stall', 12)} 16 vendor bays</span>
            <span class="login-chip">${icon('users', 12)} NPC customers</span>
            <span class="login-chip">${icon('bolt', 12)} 7 power-ups</span>
          </div>
          <div class="login-bay-strip">
            <div class="login-bay-stat"><strong>4</strong><span>Stall types</span></div>
            <div class="login-bay-stat"><strong>12</strong><span>Upgrade paths</span></div>
            <div class="login-bay-stat"><strong>11</strong><span>Market events</span></div>
          </div>
        </div>

        <form class="login-card" id="login-form" autocomplete="off" novalidate>
          <div class="login-card-head">
            <div>
              <h2>Open your stall</h2>
              <p>Pick a vendor name and your first product line.</p>
            </div>
            <span class="guest-pill">${icon('sparkle', 10)} Guest save</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="vendor-name">
              Vendor name <small>${hasSave ? 'Save found on this device' : '2–18 characters'}</small>
            </label>
            <input
              id="vendor-name"
              class="text-input"
              name="vendorName"
              maxlength="18"
              placeholder="e.g. Nena of Colon"
              value="${escapeHtml(savedName)}"
              autocapitalize="words"
              spellcheck="false"
              required
            />
          </div>

          <div class="form-group">
            <div class="form-label">Start with <small>You can unlock all four</small></div>
            <div class="category-picker" id="category-picker">
              ${CATEGORY_ORDER.map((id) => {
                const cat = STALL_CATEGORIES[id];
                return `
                  <button type="button" class="category-tile ${id === this.selectedCategory ? 'selected' : ''}" data-category="${id}">
                    <span class="category-tile-icon" style="color:${cat.accent}">${icon(CATEGORY_ICONS[id], 18)}</span>
                    <span>
                      <b>${cat.shortName}</b>
                      <small>${cat.tagline.split('.')[0]}</small>
                    </span>
                  </button>`;
              }).join('')}
            </div>
          </div>

          <button type="submit" class="btn-primary" id="enter-btn"><span>Open my stall at Colon ${icon('arrowRight', 15)}</span></button>
          <div class="login-error" id="login-error"></div>
          <p class="login-note">
            ${hasSave ? 'Your progress is on this device.' : 'A private save token is created for this device.'}
            Your stall, upgrades and earnings save automatically.
          </p>
          <div class="login-server" id="login-server">
            <span class="server-dot ${this.serverInfo.reachable ? '' : 'offline'}"></span>
            <span id="login-server-text">Checking the night market…</span>
          </div>
        </form>
      </div>
      <div class="login-footer-line">
        <span>WASD to walk</span><span>E to interact</span><span>Space to jump</span><span>Shift to run</span>
      </div>
    `;
  }

  private bind(): void {
    this.el.querySelectorAll<HTMLButtonElement>('.category-tile').forEach((tile) => {
      tile.addEventListener('click', () => {
        this.selectedCategory = tile.dataset.category as StallCategory;
        this.el.querySelectorAll('.category-tile').forEach((t) => t.classList.remove('selected'));
        tile.classList.add('selected');
      });
    });

    const form = this.el.querySelector<HTMLFormElement>('#login-form')!;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submit();
    });
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    const input = this.el.querySelector<HTMLInputElement>('#vendor-name')!;
    const errorEl = this.el.querySelector<HTMLElement>('#login-error')!;
    const button = this.el.querySelector<HTMLButtonElement>('#enter-btn')!;
    const name = input.value.replace(/\s+/g, ' ').trim();
    errorEl.classList.remove('visible');

    if (name.length < 2 || name.length > 18) {
      this.showError('Your vendor name must be 2–18 characters.');
      input.focus();
      return;
    }
    if (!/^[\p{L}\p{N}][\p{L}\p{N} .'_-]*$/u.test(name)) {
      this.showError('Use letters, numbers, spaces, apostrophes, periods or hyphens.');
      input.focus();
      return;
    }

    const token =
      this.savedToken && this.savedName.trim().toLowerCase() === name.toLowerCase()
        ? this.savedToken
        : undefined;

    this.busy = true;
    button.classList.add('loading');
    button.disabled = true;
    try {
      const result = await this.onSubmit({ name, token: token ?? undefined, category: this.selectedCategory });
      if (!result.ok) {
        this.showError(result.error ?? 'Could not open your stall. Try again.');
      }
    } catch {
      this.showError('The market server is not responding. Please try again.');
    } finally {
      this.busy = false;
      button.classList.remove('loading');
      button.disabled = false;
    }
  }

  private showError(message: string): void {
    const errorEl = this.el.querySelector<HTMLElement>('#login-error');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.classList.add('visible');
  }

  setServerStatus(info: { online: number; persistence: string; reachable: boolean }): void {
    this.serverInfo = info;
    const dot = this.el.querySelector<HTMLElement>('#login-server .server-dot');
    const text = this.el.querySelector<HTMLElement>('#login-server-text');
    if (!dot || !text) return;
    dot.classList.toggle('offline', !info.reachable);
    if (!info.reachable) {
      text.textContent = 'Market server offline — run npm run dev';
      return;
    }
    const save = info.persistence === 'mongodb' ? 'MongoDB save' : 'local save';
    text.textContent = `Market open · ${info.online} vendor${info.online === 1 ? '' : 's'} online · ${save}`;
  }

  show(): void {
    this.el.classList.remove('hidden');
    window.setTimeout(() => this.el.querySelector<HTMLInputElement>('#vendor-name')?.focus(), 450);
  }

  hide(): void {
    if (this.el.classList.contains('hidden')) return;
    this.el.classList.add('leaving');
    window.setTimeout(() => this.el.classList.add('hidden'), 600);
  }
}
