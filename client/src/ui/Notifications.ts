import type { NotificationPayload } from '../../../shared/types';
import { escapeHtml } from './format';
import { icon } from './icons';

const ICON_BY_KIND: Record<string, string> = {
  info: 'info',
  success: 'checkCircle',
  warning: 'warning',
  danger: 'warning',
  event: 'sparkle',
};

export class Notifications {
  private root: HTMLElement;
  private onSound?: (kind: string) => void;

  constructor(root: HTMLElement, onSound?: (kind: string) => void) {
    this.root = root;
    this.onSound = onSound;
  }

  show(payload: NotificationPayload, duration = 5200): void {
    const signature = `${payload.kind}|${payload.title}|${payload.message}`;
    const existing = this.root.querySelectorAll<HTMLElement>('.toast');
    for (const el of existing) {
      if (el.dataset.signature === signature) {
        // Refresh a repeat notice instead of stacking duplicates.
        el.classList.remove('leaving');
        window.clearTimeout(Number(el.dataset.timer ?? 0));
        const ms = payload.kind === 'event' ? Math.max(duration, 7600) : duration;
        el.dataset.timer = String(window.setTimeout(() => this.dismiss(el), ms));
        el.classList.remove('pulse');
        void el.offsetWidth;
        el.classList.add('pulse');
        return;
      }
    }
    if (existing.length >= 4) {
      this.dismiss(existing[0]);
    }
    const el = document.createElement('div');
    el.className = `toast ${payload.kind}`;
    el.dataset.signature = signature;
    el.innerHTML = `
      <div class="toast-icon">${icon(ICON_BY_KIND[payload.kind] ?? 'sparkle', 15)}</div>
      <div class="toast-copy">
        <b>${escapeHtml(payload.title)}</b>
        <p>${escapeHtml(payload.message)}</p>
      </div>
    `;
    el.addEventListener('click', () => this.dismiss(el));
    this.root.appendChild(el);
    this.onSound?.(payload.kind);
    const ms = payload.kind === 'event' ? Math.max(duration, 7600) : duration;
    el.dataset.timer = String(window.setTimeout(() => this.dismiss(el), ms));
  }

  info(title: string, message: string, kind: NotificationPayload['kind'] = 'info'): void {
    this.show({ kind, title, message });
  }

  private dismiss(el: HTMLElement): void {
    if (!el.isConnected || el.classList.contains('leaving')) return;
    window.clearTimeout(Number(el.dataset.timer ?? 0));
    el.classList.add('leaving');
    window.setTimeout(() => el.remove(), 300);
  }

  clear(): void {
    this.root.innerHTML = '';
  }
}
