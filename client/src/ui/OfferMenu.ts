import type { MarketOffer } from '../../../shared/types';
import { openModal, modalHeader, type ModalHandle } from './Modal';
import { escapeHtml, peso } from './format';
import { icon } from './icons';
import type { MenuContext } from './MenuContext';

/**
 * A bulk-buy offer from a market regular. Shows a live countdown and
 * resolves through the server when the vendor accepts or declines.
 */
export class OfferMenu {
  private ctx: MenuContext;
  private handle: ModalHandle | null = null;
  private offer: MarketOffer | null = null;
  private timer: number | null = null;
  private busy = false;

  constructor(ctx: MenuContext) {
    this.ctx = ctx;
  }

  open(offer: MarketOffer): void {
    // One offer at a time — a fresh offer replaces the old modal.
    this.close();
    this.offer = offer;
    this.handle = openModal(
      `
        ${modalHeader({
          eyebrow: 'Bulk order',
          eyebrowIcon: icon('box', 13),
          title: `${escapeHtml(offer.buyerName)} wants ${offer.quantity}× ${escapeHtml(offer.productName)}`,
          subtitle: 'A regular buyer is offering a bundle price — below your shelf price, paid in full right now.',
        })}
        <div class="modal-body">
          <div class="offer-card">
            <div class="offer-line"><span>Units</span><b>${offer.quantity}</b></div>
            <div class="offer-line"><span>Per unit</span><b>${peso(offer.unitPrice)}</b></div>
            <div class="offer-line offer-total"><span>Total payout</span><b>${peso(offer.total)}</b></div>
            <div class="offer-timer"><span data-ref="offer-time"></span><i data-ref="offer-bar"></i></div>
          </div>
          <div class="offer-note">${icon('info', 12)} Accepting deducts the stock immediately and pays out on the spot. Declining costs nothing.</div>
        </div>
        <div class="modal-foot">
          <span class="modal-foot-note" data-ref="offer-status">Answer before the buyer walks on.</span>
          <div class="offer-actions">
            <button type="button" class="btn-ghost" data-offer="decline">Decline</button>
            <button type="button" class="btn-gold" data-offer="accept">${icon('coin', 12)} Accept ₱${offer.total.toLocaleString('en-PH')}</button>
          </div>
        </div>
      `,
      'offer-modal',
    );
    const tick = (): void => {
      if (!this.handle || !this.offer) return;
      const remaining = Math.max(0, this.offer.expiresAt - Date.now());
      const el = this.handle.el.querySelector<HTMLElement>('[data-ref="offer-time"]');
      const bar = this.handle.el.querySelector<HTMLElement>('[data-ref="offer-bar"]');
      if (el) el.textContent = `${Math.ceil(remaining / 1000)}s left`;
      if (bar) bar.style.width = `${Math.min(100, (remaining / 45_000) * 100)}%`;
      if (remaining <= 0) this.resolve(false);
    };
    tick();
    this.timer = window.setInterval(tick, 500);
    this.handle.el.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLElement>('[data-offer]');
      if (!btn || this.busy) return;
      void this.resolve(btn.dataset.offer === 'accept');
    });
  }

  private async resolve(accept: boolean): Promise<void> {
    const offer = this.offer;
    if (!offer || this.busy) return;
    this.busy = true;
    try {
      const result = await this.ctx.network.respondOffer(offer.id, accept);
      if (result.data) this.ctx.onProfile(result.data);
      if (!result.ok && accept) {
        this.ctx.notify.info('Offer failed', result.error ?? 'The market did not respond.', 'warning');
      }
    } catch {
      this.ctx.notify.info('Offer failed', 'The market did not respond. Try again.', 'warning');
    } finally {
      this.busy = false;
      this.close();
    }
  }

  /** Server says the offer was accepted elsewhere or expired. */
  resolved(id: string, accepted: boolean): void {
    if (!this.offer || this.offer.id !== id) return;
    if (accepted) this.ctx.notify.info('Bulk order filled', 'The buyer paid out — check your till.', 'success');
    this.close();
  }

  private close(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.handle?.close();
    this.handle = null;
    this.offer = null;
    this.busy = false;
  }

  get isOpen(): boolean {
    return !!this.handle;
  }
}
