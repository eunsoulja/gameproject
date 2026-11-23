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
    const existing = this.root.querySelectorAll('.toast');
    if (existing.length >= 4) {
      this.dismiss(existing[0] as HTMLElement);
    }
    const el = document.createElement('div');
    el.className = `toast ${payload.kind}`;
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
    window.setTimeout(() => this.dismiss(el), ms);
  }

  info(title: string, message: string, kind: NotificationPayload['kind'] = 'info'): void {
    this.show({ kind, title, message });
  }

  private dismiss(el: HTMLElement): void {
    if (!el.isConnected || el.classList.contains('leaving')) return;
    el.classList.add('leaving');
    window.setTimeout(() => el.remove(), 300);
  }

  clear(): void {
    this.root.innerHTML = '';
  }
}
