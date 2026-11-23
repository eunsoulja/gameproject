import type { Appearance } from '../../../shared/types';
import type { GameSettings, QualitySetting, SettingsManager } from '../systems/Settings';
import { modalHeader, openModal } from './Modal';
import { escapeHtml, peso } from './format';
import { icon } from './icons';
import type { MenuContext } from './MenuContext';

interface SettingsOptions extends MenuContext {
  settings: SettingsManager;
  onSettingsChanged: (settings: GameSettings) => void;
  onAppearancePreview: (appearance: Appearance) => void;
  onSignOut: () => void;
}

const SKIN = ['#f6d6b8', '#edbe98', '#d59c70', '#b97b4f', '#8e5a36', '#623d26'];
const HAIR = ['#1b1412', '#33211a', '#5c3922', '#8b5b32', '#d2a65e', '#252331'];
const SHIRTS = ['#e0a33c', '#d9544a', '#3f8ccc', '#54a86f', '#8a5bc7', '#e17b4f', '#f0e5ce', '#334156'];
const PANTS = ['#273449', '#151a22', '#3f5975', '#67604f', '#5b2d34', '#2e4038'];

export class SettingsMenu {
  private opts: SettingsOptions;
  private appearance: Appearance;
  private busy = false;

  constructor(options: SettingsOptions) {
    this.opts = options;
    // The menu is built before login; the real appearance is read when it opens.
    this.appearance = { shirt: '#e0a33c', pants: '#273449', skin: '#edbe98', hair: '#1b1412' };
  }

  open(): void {
    const profile = this.opts.getProfile();
    this.appearance = { ...profile.appearance };
    const settings = this.opts.settings.current;
    const modal = openModal(
      `
        ${modalHeader({
          eyebrow: 'Your booth & controls',
          eyebrowIcon: icon('settings', 13),
          title: 'Market settings',
          subtitle: 'Tune the light, the sound and the way you move through Colon.',
          right: `<div class="modal-balance">${icon('coin', 14)}${peso(profile.balance)}</div>`,
        })}
        <div class="modal-body">
          <div class="settings-group">
            <div class="settings-group-head">${icon('volume', 15)}<b>Sound</b><span>Saved on this device</span></div>
            ${this.slider('Master volume', 'masterVolume', settings.masterVolume)}
            ${this.slider('Market ambience', 'ambienceVolume', settings.ambienceVolume)}
            ${this.slider('Effects & footsteps', 'effectsVolume', settings.effectsVolume)}
          </div>

          <div class="settings-group">
            <div class="settings-group-head">${icon('eye', 15)}<b>Camera & comfort</b><span>Drag the world to look</span></div>
            ${this.slider('Mouse sensitivity', 'sensitivity', settings.sensitivity, 0.35, 2.2, 2)}
            ${this.toggle('Invert drag', 'invertDrag', settings.invertDrag, 'Drag left to look right')}
            ${this.toggle('Player name tags', 'showNames', settings.showNames, 'Show vendor names above other players')}
            ${this.toggle('Reduce motion', 'reduceMotion', settings.reduceMotion, 'Calmer camera and fewer visual effects')}
          </div>

          <div class="settings-group">
            <div class="settings-group-head">${icon('monitor', 15)}<b>Graphics & weather</b><span>${settings.quality} quality</span></div>
            <div class="setting-row">
              <label for="quality-select">Scene quality</label>
              <select id="quality-select" class="select-input" data-setting="quality">
                <option value="low" ${settings.quality === 'low' ? 'selected' : ''}>Low — smooth on older laptops</option>
                <option value="medium" ${settings.quality === 'medium' ? 'selected' : ''}>Medium — balanced detail</option>
                <option value="high" ${settings.quality === 'high' ? 'selected' : ''}>High — full lights & shadows</option>
              </select>
              <span class="setting-value">${settings.quality === 'high' ? 'FULL' : settings.quality.toUpperCase()}</span>
            </div>
            ${this.toggle('Weather effects', 'weatherEffects', settings.weatherEffects, 'Rain, wind and lightning on screen')}
          </div>

          <div class="settings-group">
            <div class="settings-group-head">${icon('palette', 15)}<b>Your vendor look</b><span>Blocky, not boring</span></div>
            <div class="biz-row business-edit-row">
              <input class="text-input" id="business-name-input" maxlength="30" value="${escapeHtml(profile.businessName)}" aria-label="Business name" />
              <button type="button" class="btn-gold" data-save-business>${icon('edit', 12)} Rename</button>
            </div>
            ${this.swatchRow('Shirt', 'shirt', SHIRTS)}
            ${this.swatchRow('Pants', 'pants', PANTS)}
            ${this.swatchRow('Skin', 'skin', SKIN)}
            ${this.swatchRow('Hair', 'hair', HAIR)}
            <div class="settings-actions">
              <button type="button" class="btn-gold" data-save-appearance>${icon('save', 12)} Save look</button>
              <button type="button" class="btn-ghost" data-reset-camera>${icon('refresh', 12)} Reset camera</button>
            </div>
          </div>

          <div class="settings-group">
            <div class="settings-group-head">${icon('users', 15)}<b>Session</b><span>Guest save on this device</span></div>
            <div class="controls-grid">
              ${control('Walk', ['W', 'A', 'S', 'D'])}
              ${control('Sprint', ['Shift'])}
              ${control('Jump', ['Space'])}
              ${control('Interact', ['E'])}
              ${control('Camera', ['Drag'])}
              ${control('Zoom', ['Wheel'])}
            </div>
            <div class="settings-actions">
              <button type="button" class="btn-ghost" data-sign-out>${icon('close', 12)} Sign out on this device</button>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <span class="modal-foot-note">Progress, stock and upgrades are stored on the market server — settings stay on this device.</span>
          <button type="button" class="btn-ghost" data-modal-close>Close</button>
        </div>
      `,
      'settings-modal',
    );

    modal.el.querySelectorAll<HTMLElement>('[data-swatch-group]').forEach((group) => {
      group.addEventListener('click', (event) => {
        const swatch = (event.target as HTMLElement).closest<HTMLElement>('[data-swatch]');
        if (!swatch) return;
        const key = swatch.dataset.swatchGroup as keyof Appearance;
        const color = swatch.dataset.swatch!;
        this.appearance = { ...this.appearance, [key]: color };
        group.querySelectorAll('.color-swatch').forEach((item) => item.classList.remove('selected'));
        swatch.classList.add('selected');
        this.opts.onAppearancePreview(this.appearance);
      });
    });

    modal.el.addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement;
      const key = input.dataset.setting as keyof GameSettings | undefined;
      if (!key) return;
      if (input.type === 'range') {
        const min = Number(input.min);
        const max = Number(input.max);
        const value = Number(input.value);
        if (key === 'sensitivity') {
          this.opts.settings.set('sensitivity', value);
          const output = input.parentElement?.querySelector<HTMLElement>('[data-range-output]');
          if (output) output.textContent = value.toFixed(2);
        } else {
          const normalized = (value - min) / Math.max(0.0001, max - min);
          this.opts.settings.set(key as 'masterVolume' | 'ambienceVolume' | 'effectsVolume', normalized);
          const output = input.parentElement?.querySelector<HTMLElement>('[data-range-output]');
          if (output) output.textContent = `${Math.round(normalized * 100)}%`;
        }
        input.style.setProperty('--val', `${((value - min) / Math.max(0.0001, max - min)) * 100}%`);
        this.opts.onSettingsChanged(this.opts.settings.current);
      }
    });

    modal.el.addEventListener('change', (event) => {
      const select = event.target as HTMLSelectElement;
      if (select.dataset.setting === 'quality') {
        this.opts.settings.set('quality', select.value as QualitySetting);
        const side = select.closest('.settings-group')?.querySelector('.settings-group-head span');
        if (side) side.textContent = `${select.value} quality`;
        this.opts.onSettingsChanged(this.opts.settings.current);
      }
    });

    modal.el.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const toggle = target.closest<HTMLElement>('[data-toggle]');
      if (toggle) {
        const key = toggle.dataset.toggle as keyof GameSettings;
        const current = Boolean(this.opts.settings.current[key]);
        this.opts.settings.set(key, !current as never);
        toggle.classList.toggle('on', !current);
        toggle.setAttribute('aria-pressed', String(!current));
        this.opts.onSettingsChanged(this.opts.settings.current);
        return;
      }
      if (target.closest('[data-save-appearance]')) {
        void this.saveAppearance();
        return;
      }
      if (target.closest('[data-save-business]')) {
        void this.renameBusiness(modal.el);
        return;
      }
      if (target.closest('[data-reset-camera]')) {
        this.opts.onSettingsChanged(this.opts.settings.current);
        window.dispatchEvent(new CustomEvent('merkado:reset-camera'));
        this.opts.notify.info('Camera reset', 'The view has been placed behind your vendor.');
        return;
      }
      if (target.closest('[data-sign-out]')) {
        if (window.confirm('Sign out on this device? Your server-side stall is saved, but you will need to enter your vendor name again.')) {
          this.opts.onSignOut();
        }
      }
    });
  }

  private async saveAppearance(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const result = await this.opts.network.setAppearance(this.appearance);
      if (!result.ok) {
        this.opts.notify.info('Look not saved', result.error ?? 'Try again.', 'warning');
      } else if (result.data) {
        this.opts.onProfile(result.data);
        this.opts.notify.info('New look', 'Your vendor outfit has been updated.', 'success');
      }
    } catch {
      this.opts.notify.info('Look not saved', 'The market did not respond.', 'warning');
    } finally {
      this.busy = false;
    }
  }

  private async renameBusiness(modal: HTMLElement): Promise<void> {
    if (this.busy) return;
    const input = modal.querySelector<HTMLInputElement>('#business-name-input');
    if (!input) return;
    const name = input.value.replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 30) {
      this.opts.notify.info('Name not changed', 'Business names must be 2–30 characters.', 'warning');
      return;
    }
    this.busy = true;
    try {
      const result = await this.opts.network.setBusinessName(name);
      if (!result.ok) {
        this.opts.notify.info('Name not changed', result.error ?? 'Try again.', 'warning');
      } else if (result.data) {
        this.opts.onProfile(result.data);
      }
    } catch {
      this.opts.notify.info('Name not changed', 'The market did not respond.', 'warning');
    } finally {
      this.busy = false;
    }
  }

  private slider(
    label: string,
    key: keyof GameSettings,
    value: number,
    min = 0,
    max = 1,
    decimals = 0,
  ): string {
    const normalized = (value - min) / Math.max(0.0001, max - min);
    const display = key === 'sensitivity' ? value.toFixed(2) : `${Math.round(value * 100)}%`;
    return `
      <div class="setting-row">
        <label for="setting-${key}">${label}</label>
        <input id="setting-${key}" class="range-input" type="range" min="${min}" max="${max}" step="${key === 'sensitivity' ? 0.05 : 0.01}"
          value="${value}" data-setting="${key}" style="--val:${normalized * 100}%" />
        <span class="setting-value" data-range-output>${decimals >= 2 ? value.toFixed(2) : display}</span>
      </div>
    `;
  }

  private toggle(label: string, key: keyof GameSettings, value: boolean, hint: string): string {
    return `
      <div class="toggle-row">
        <div class="toggle-copy"><b>${label}</b><span>${hint}</span></div>
        <button type="button" class="toggle ${value ? 'on' : ''}" data-toggle="${key}" aria-pressed="${value}" aria-label="${label}"></button>
      </div>
    `;
  }

  private swatchRow(label: string, key: keyof Appearance, colors: string[]): string {
    return `
      <div class="setting-row" style="grid-template-columns:76px 1fr; margin-bottom:8px">
        <label>${label}</label>
        <div class="color-swatches" data-swatch-group="${key}">
          ${colors.map((color) => `
            <button type="button" class="color-swatch ${this.appearance[key].toLowerCase() === color.toLowerCase() ? 'selected' : ''}"
              style="background:${color}" data-swatch="${color}" data-swatch-group="${key}" aria-label="${label} ${color}"></button>
          `).join('')}
        </div>
      </div>
    `;
  }
}

function control(label: string, keys: string[]): string {
  return `<div class="control-row"><span>${label}</span><span class="control-keys">${keys.map((key) => `<kbd>${key}</kbd>`).join('')}</span></div>`;
}
