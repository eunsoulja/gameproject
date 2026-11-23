import { STALL_CATEGORIES, upgradeById } from '../../../shared/config';
import type { PublicPlot } from '../../../shared/types';
import { modalHeader, openModal } from './Modal';
import { escapeHtml, initials, peso, timeAgo } from './format';
import { CATEGORY_ICONS, icon } from './icons';

export function openVisitMenu(plot: PublicPlot): void {
  const online = plot.online;
  openModal(
    `
      ${modalHeader({
        eyebrow: `Colon Bay ${String(plot.index + 1).padStart(2, '0')}`,
        eyebrowIcon: icon('pin', 13),
        title: 'Vendor stall',
        subtitle: 'A neighbor on the market row. Every bay has its own story.',
      })}
      <div class="modal-body">
        <div class="visit-banner">
          <div class="visit-avatar" style="background:linear-gradient(145deg, ${plot.appearance.shirt}, ${plot.appearance.pants}); color:${plot.appearance.skin}">${escapeHtml(initials(plot.ownerName))}</div>
          <div class="visit-banner-copy">
            <div class="visit-business">${escapeHtml(plot.businessName)}</div>
            <h3>${escapeHtml(plot.ownerName)}</h3>
            <p>${online ? 'At their counter right now' : `Last seen ${timeAgo(plot.lastSeen)}`} · ${plot.stallCount} stall${plot.stallCount === 1 ? '' : 's'}</p>
          </div>
          <span class="visit-status ${online ? '' : 'offline'}"><span class="live-dot"></span>${online ? 'Open' : 'Away'}</span>
        </div>

        <div class="visit-grid">
          <div class="visit-stat"><span>Reputation</span><b>${Math.floor(plot.reputation)}</b></div>
          <div class="visit-stat"><span>Lifetime sales</span><b>${peso(plot.totalEarnings)}</b></div>
          <div class="visit-stat"><span>Upgrades</span><b>${plot.upgrades.length}</b></div>
          <div class="visit-stat"><span>Categories</span><b>${plot.categories.length}/4</b></div>
        </div>

        <div class="visit-section">
          <div class="visit-section-head">On the counter</div>
          <div class="category-chips">
            ${plot.categories.map((category) => {
              const def = STALL_CATEGORIES[category];
              return `<span class="category-chip" style="--chip-color:${def.color}">${icon(CATEGORY_ICONS[category], 12)} ${def.shortName}</span>`;
            }).join('')}
          </div>
        </div>

        <div class="visit-section">
          <div class="visit-section-head">Installed upgrades</div>
          ${
            plot.upgrades.length
              ? `<div class="visit-upgrades">${plot.upgrades.map((id) => {
                  const found = upgradeById(id);
                  return `<span class="visit-upg">${escapeHtml(found?.option.name ?? id)}</span>`;
                }).join('')}</div>`
              : '<div class="empty-state" style="padding:4px 0;text-align:left">A humble first stall — no upgrades installed yet.</div>'
          }
        </div>

        <div class="vendor-note">${icon('info', 14)}
          <span>${online ? 'Say hi when you pass by their bay. Friendly vendors make Colon feel like home.' : 'This vendor is away. Their stall and stock will be exactly where they left them.'} Purchases and upgrades for your own stall are managed at your own counter.</span>
        </div>
      </div>
      <div class="modal-foot">
        <span class="modal-foot-note">Bay ${String(plot.index + 1).padStart(2, '0')} · ${plot.online ? 'Vendor online' : 'Vendor offline'}</span>
        <button type="button" class="btn-ghost" data-modal-close>Back to the street</button>
      </div>
    `,
    'visit-modal',
  );
}
