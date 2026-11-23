import { GOALS, PRODUCTS, upgradeById } from '../../../shared/config';
import type { PlayerProfile } from '../../../shared/types';
import { modalHeader, openModal } from './Modal';
import { escapeHtml, peso } from './format';
import { icon } from './icons';
import type { MenuContext } from './MenuContext';

export class StatsMenu {
  private ctx: MenuContext;

  constructor(ctx: MenuContext) {
    this.ctx = ctx;
  }

  open(): void {
    const profile = this.ctx.getProfile();
    openModal(
      `
        ${modalHeader({
          eyebrow: 'Ledger & milestones',
          eyebrowIcon: icon('chart', 13),
          title: 'Your merkado story',
          subtitle: `${escapeHtml(profile.name)} · ${escapeHtml(profile.businessName)} · Colon Bay ${String(profile.plotIndex + 1).padStart(2, '0')}`,
          right: `<div class="modal-balance">${icon('coin', 14)}${peso(profile.balance)}</div>`,
        })}
        <div class="modal-body">
          <div class="stats-summary">
            <div class="stat-tile highlight">${icon('trophy', 16)}<span>Lifetime earned</span><strong>${peso(profile.lifetime.totalEarnings)}</strong><small>${profile.lifetime.totalUpgrades} upgrades installed</small></div>
            <div class="stat-tile green">${icon('users', 16)}<span>Customers served</span><strong>${profile.lifetime.totalCustomers.toLocaleString('en-PH')}</strong><small>${profile.today.customers} today</small></div>
            <div class="stat-tile blue">${icon('star', 16)}<span>Reputation</span><strong>${Math.floor(profile.reputation)}/100</strong><small>${reputationTier(profile.reputation)}</small></div>
            <div class="stat-tile">${icon('calendar', 16)}<span>Days on Colon</span><strong>${profile.lifetime.daysPlayed}</strong><small>Goal stage ${Math.min(profile.goalStage + 1, GOALS.length)}/${GOALS.length}</small></div>
          </div>

          <div class="stats-columns">
            <section class="stats-card">
              <div class="stats-card-head">${icon('receipt', 14)}<b>Today's ledger</b><span>Day ${profile.day}</span></div>
              <div class="stats-card-body">
                <div class="detail-line"><span>Revenue</span><b class="pos">+${peso(profile.today.revenue)}</b></div>
                <div class="detail-line"><span>Expenses</span><b class="neg">−${peso(profile.today.expenses)}</b></div>
                <div class="detail-line"><span>Net</span><b class="${profile.today.revenue - profile.today.expenses >= 0 ? 'pos' : 'neg'}">${signed(profile.today.revenue - profile.today.expenses)}</b></div>
                <div class="detail-line"><span>Products sold</span><b>${profile.today.productsSold}</b></div>
                <div class="detail-line"><span>Spoiled / lost</span><b>${profile.today.spoiled}</b></div>
                ${Object.entries(profile.today.expenseBreakdown)
                  .filter(([, amount]) => amount > 0)
                  .map(([label, amount]) => `<div class="detail-line"><span>${escapeHtml(label)}</span><b class="neg">−${peso(amount)}</b></div>`)
                  .join('')}
              </div>
            </section>

            <section class="stats-card">
              <div class="stats-card-head">${icon('target', 14)}<b>Business goals</b><span>${Math.min(profile.goalStage, GOALS.length)}/${GOALS.length} complete</span></div>
              <div class="stats-card-body">
                <div class="goal-list">
                  ${GOALS.map((goal, index) => {
                    const done = index < profile.goalStage;
                    const current = index === profile.goalStage;
                    return `<div class="goal-list-item ${done ? 'done' : ''} ${current ? 'current' : ''}">
                      <span class="goal-mark">${done ? '✓' : index + 1}</span>
                      <span>${done ? '<b>' + escapeHtml(goal.targetLabel) + '</b> — ' : ''}${escapeHtml(goal.title)}</span>
                    </div>`;
                  }).join('')}
                </div>
              </div>
            </section>
          </div>

          <div class="stats-columns" style="margin-top:14px">
            <section class="stats-card">
              <div class="stats-card-head">${icon('box', 14)}<b>Best sellers today</b><span>By volume</span></div>
              <div class="stats-card-body">
                ${
                  Object.entries(profile.today.soldByProduct)
                    .filter(([, quantity]) => quantity > 0)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 7)
                    .map(([id, quantity]) => {
                      const product = PRODUCTS.find((item) => item.id === id);
                      return `<div class="detail-line"><span>${escapeHtml(product?.name ?? id)}</span><b>${quantity} sold</b></div>`;
                    })
                    .join('') || '<div class="empty-state">No sales yet today. Walk to your counter, press E and restock before the evening rush.</div>'
                }
              </div>
            </section>

            <section class="stats-card">
              <div class="stats-card-head">${icon('book', 14)}<b>Recent closings</b><span>Last 4 nights</span></div>
              <div class="stats-card-body">
                ${
                  profile.reports.slice(-4).reverse().map((report) => {
                    const net = report.net;
                    return `<div class="report-list-item">
                      <span class="report-day">Day ${report.day}</span>
                      <span class="report-rev">${peso(report.revenue)} revenue</span>
                      <span class="report-net" style="color:${net >= 0 ? '#99e2a7' : '#e59b8f'}">${signed(net)}</span>
                    </div>`;
                  }).join('') || '<div class="empty-state">Your first closing report will be waiting after the market day ends.</div>'
                }
                <div class="detail-line" style="margin-top:7px"><span>Lifetime revenue</span><b>${peso(profile.lifetime.totalRevenue)}</b></div>
                <div class="detail-line"><span>Lifetime expenses</span><b>−${peso(profile.lifetime.totalExpenses)}</b></div>
                <div class="detail-line"><span>Peak day</span><b>${peso(profile.lifetime.peakDayRevenue)}</b></div>
              </div>
            </section>
          </div>

          <div class="section-label" style="margin-top:18px">Installed upgrades</div>
          ${
            Object.entries(profile.chosenUpgrades)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, id]) => {
                const found = upgradeById(id);
                return `<div class="upgrade-history-item"><span class="upg-dot"></span><span>${escapeHtml(found?.option.name ?? id)}</span><b>${key.split('-')[0].toUpperCase()} · T${found?.tier ?? ''}</b></div>`;
              })
              .join('') ||
            '<div class="empty-state">No upgrades yet. Visit the glowing pads around your stall or open the Upgrade panel on the right.</div>'
          }
        </div>
        <div class="modal-foot">
          <span class="modal-foot-note">Peak day ${peso(profile.lifetime.peakDayRevenue)} · ${profile.lifetime.totalProductsSold} products sold all-time</span>
          <button type="button" class="btn-ghost" data-modal-close>Close</button>
        </div>
      `,
      'stats-modal',
    );
  }
}

function signed(value: number): string {
  if (Math.abs(value) < 0.5) return '₱0';
  return `${value >= 0 ? '+' : '−'}${peso(Math.abs(value))}`;
}

function reputationTier(reputation: number): string {
  if (reputation >= 85) return 'Colon legend';
  if (reputation >= 60) return 'Market favorite';
  if (reputation >= 40) return 'Trusted vendor';
  if (reputation >= 20) return 'Making a name';
  return 'New vendor';
}
