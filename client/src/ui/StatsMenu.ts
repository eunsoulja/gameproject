import { ACHIEVEMENTS, GOALS, PRODUCTS, upgradeById } from '../../../shared/config';
import type { PlayerProfile } from '../../../shared/types';
import { openModal } from './Modal';
import { escapeHtml, peso } from './format';
import { icon } from './icons';
import type { MenuContext } from './MenuContext';

const BUNTING_COLORS = ['#e4574a', '#f1b74e', '#57a6c9', '#79b55c', '#d77eb2', '#f4e4c6'];
const TALLY_COLORS = ['#f0c14c', '#e4574a', '#57a6c9', '#79b55c', '#d77eb2'];

export class StatsMenu {
  private ctx: MenuContext;

  constructor(ctx: MenuContext) {
    this.ctx = ctx;
  }

  open(): void {
    const profile = this.ctx.getProfile();
    const net = profile.today.revenue - profile.today.expenses;
    const good = net >= 0;
    const completedGoals = Math.min(profile.goalStage, GOALS.length);
    const goalStage = Math.min(profile.goalStage + 1, GOALS.length);
    const sellers = Object.entries(profile.today.soldByProduct)
      .filter(([, quantity]) => quantity > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const topVolume = sellers[0]?.[1] ?? 1;
    const reports = profile.reports.slice(-4).reverse();
    const peakReport = reports.reduce((max, report) => Math.max(max, report.revenue), 0);
    const upgrades = Object.entries(profile.chosenUpgrades).sort(([a], [b]) => a.localeCompare(b));
    const buntingFlags = Array.from(
      { length: 18 },
      (_, index) =>
        `<i style="--flag:${BUNTING_COLORS[index % BUNTING_COLORS.length]};--i:${index}"></i>`,
    ).join('');

    const modal = openModal(
      `
        <div class="ledger-awning" aria-hidden="true"></div>
        <div class="ledger-bunting" aria-hidden="true">${buntingFlags}</div>

        <header class="ledger-head">
          <div class="ledger-parol" aria-hidden="true">${icon('parol', 44, 1.4)}</div>
          <div class="ledger-title-wrap">
            <div class="ledger-eyebrow">Talaan ng Merkado <span>·</span> Colon Street</div>
            <h2>Your merkado story</h2>
            <p class="ledger-sub">${escapeHtml(profile.name)} · ${escapeHtml(profile.businessName)} · Bay ${String(profile.plotIndex + 1).padStart(2, '0')} · Night ${profile.day}</p>
          </div>
          <div class="ledger-head-side">
            <div class="ledger-till">
              <span>Till</span>
              <b>${icon('coin', 13)}${peso(profile.balance)}</b>
            </div>
            <button class="ledger-close" type="button" data-modal-close aria-label="Close the ledger">✕</button>
          </div>
        </header>

        <div class="ledger-body">
          <section class="ledger-summary">
            <div class="ledger-total">
              <span class="ledger-label">Lifetime earned</span>
              <strong>${peso(profile.lifetime.totalEarnings)}</strong>
              <small>${profile.lifetime.totalUpgrades} upgrades installed</small>
            </div>
            <div class="ledger-figures">
              <div class="ledger-figure">
                <span class="ledger-fig-icon" style="--c:#8fc66b">${icon('users', 15)}</span>
                <span class="ledger-fig-label">Customers served</span>
                <b>${profile.lifetime.totalCustomers.toLocaleString('en-PH')}</b>
                <small>${profile.today.customers} today</small>
              </div>
              <div class="ledger-figure">
                <span class="ledger-fig-icon" style="--c:#f0c14c">${icon('star', 15)}</span>
                <span class="ledger-fig-label">Reputation</span>
                <b>${Math.floor(profile.reputation)}<em>/100</em></b>
                <small>${reputationTier(profile.reputation)}</small>
              </div>
              <div class="ledger-figure">
                <span class="ledger-fig-icon" style="--c:#8cc5f3">${icon('calendar', 15)}</span>
                <span class="ledger-fig-label">Days on Colon</span>
                <b>${profile.lifetime.daysPlayed}</b>
                <small>Goal ${goalStage}/${GOALS.length}</small>
              </div>
            </div>
          </section>

          <div class="ledger-columns">
            <section class="ledger-receipt">
              <div class="receipt-head">
                <div>
                  <span class="receipt-kicker">${icon('receipt', 12)} Resibo ng araw</span>
                  <b>Today's ledger</b>
                </div>
                <span class="receipt-day">Day ${profile.day}</span>
              </div>
              <div class="receipt-lines">
                <div class="receipt-row"><span>Revenue</span><b class="pos">+${peso(profile.today.revenue)}</b></div>
                <div class="receipt-row"><span>Expenses</span><b class="neg">−${peso(profile.today.expenses)}</b></div>
                ${Object.entries(profile.today.expenseBreakdown)
                  .filter(([, amount]) => amount > 0)
                  .map(([label, amount]) => `<div class="receipt-row receipt-sub"><span>${escapeHtml(label)}</span><b class="neg">−${peso(amount)}</b></div>`)
                  .join('')}
                <div class="receipt-row"><span>Products sold</span><b>${profile.today.productsSold}</b></div>
                <div class="receipt-row"><span>Spoiled / lost</span><b>${profile.today.spoiled}</b></div>
              </div>
              <div class="receipt-total">
                <span>Net</span>
                <b class="${good ? 'pos' : 'neg'}">${signed(net)}</b>
              </div>
              <div class="receipt-foot">
                <span class="receipt-thanks">Salamat, suki!</span>
                <span class="receipt-stamp ${good ? 'profit' : 'loss'}"><b>${good ? 'KITA' : 'LUGI'}</b><i>${good ? 'profit' : 'loss'}</i></span>
              </div>
            </section>

            <section class="ledger-card ledger-goals">
              <div class="ledger-card-head">
                <div class="ledger-card-title">
                  <span class="ledger-card-icon" style="--c:#ffc16b">${icon('parol', 17)}</span>
                  <div><b>Business goals</b><small>Follow the lanterns down Colon</small></div>
                </div>
                <span class="ledger-card-meta">${completedGoals}/${GOALS.length} lit</span>
              </div>
              <div class="goal-trail">
                ${GOALS.map((goal, index) => {
                  const done = index < profile.goalStage;
                  const current = index === profile.goalStage;
                  const state = done ? 'done' : current ? 'current' : 'locked';
                  return `<div class="goal-step ${state}">
                    <span class="goal-node">${done ? icon('check', 12, 2.4) : icon('parol', 13, 1.7)}</span>
                    <div class="goal-copy">
                      <span class="goal-stage">${escapeHtml(goal.targetLabel)}</span>
                      <b>${escapeHtml(goal.title)}</b>
                    </div>
                    ${done ? '<span class="goal-tag done">Lit</span>' : current ? '<span class="goal-tag now">Now</span>' : ''}
                  </div>`;
                }).join('')}
              </div>
            </section>
          </div>

          <div class="ledger-columns ledger-bottom">
            <section class="ledger-card ledger-tally">
              <div class="ledger-card-head">
                <div class="ledger-card-title">
                  <span class="ledger-card-icon" style="--c:#d77eb2">${icon('box', 16)}</span>
                  <div><b>Best sellers today</b><small>Today's fastest movers</small></div>
                </div>
                <span class="ledger-card-meta">By volume</span>
              </div>
              <div class="tally-list">
                ${
                  sellers
                    .map(([id, quantity], index) => {
                      const product = PRODUCTS.find((item) => item.id === id);
                      const width = Math.max(7, Math.round((quantity / topVolume) * 100));
                      const color = TALLY_COLORS[index % TALLY_COLORS.length];
                      return `<div class="tally-row">
                        <span class="tally-rank ${index < 3 ? 'medal' : ''}">${index + 1}</span>
                        <span class="tally-name">${escapeHtml(product?.name ?? id)}</span>
                        <span class="tally-track"><i style="--w:${width}%;--c:${color}"></i></span>
                        <b>${quantity}<small>sold</small></b>
                      </div>`;
                    })
                    .join('') ||
                  '<div class="ledger-empty">No sales yet tonight. Walk to your counter, press <b>E</b>, and restock before the evening rush.</div>'
                }
              </div>
            </section>

            <section class="ledger-card ledger-closings">
              <div class="ledger-card-head">
                <div class="ledger-card-title">
                  <span class="ledger-card-icon" style="--c:#8cc5f3">${icon('moon', 16)}</span>
                  <div><b>Recent closings</b><small>The last four nights</small></div>
                </div>
                <span class="ledger-card-meta">After dark</span>
              </div>
              <div class="closing-list">
                ${
                  reports
                    .map((report) => {
                      const reportGood = report.net >= 0;
                      const width = Math.max(8, Math.round((report.revenue / Math.max(1, peakReport)) * 100));
                      return `<div class="closing-row">
                        <div class="closing-top">
                          <span class="closing-day">Day ${report.day}</span>
                          <b class="${reportGood ? 'pos' : 'neg'}">${signed(report.net)}</b>
                        </div>
                        <div class="closing-track"><i style="--w:${width}%;--c:${reportGood ? '#8fc66b' : '#e4574a'}"></i></div>
                        <span class="closing-rev">${peso(report.revenue)} revenue</span>
                      </div>`;
                    })
                    .join('') ||
                  '<div class="ledger-empty">Your first closing report will be waiting after the market day ends.</div>'
                }
              </div>
              <div class="closing-totals">
                <div><span>Lifetime revenue</span><b>${peso(profile.lifetime.totalRevenue)}</b></div>
                <div><span>Lifetime expenses</span><b>−${peso(profile.lifetime.totalExpenses)}</b></div>
                <div><span>Peak day</span><b>${peso(profile.lifetime.peakDayRevenue)}</b></div>
              </div>
            </section>

            <section class="ledger-card ledger-fixtures">
              <div class="ledger-card-head">
                <div class="ledger-card-title">
                  <span class="ledger-card-icon" style="--c:#9bd88a">${icon('sparkle', 16)}</span>
                  <div><b>Installed upgrades</b><small>Fixtures around your stall</small></div>
                </div>
                <span class="ledger-card-meta">${upgrades.length} owned</span>
              </div>
              <div class="fixture-tags">
                ${
                  upgrades
                    .map(([key, id]) => {
                      const found = upgradeById(id);
                      return `<span class="fixture-tag"><i class="fixture-lamp"></i><span>${escapeHtml(found?.option.name ?? id)}</span><b>${key.split('-')[0].toUpperCase()} · T${found?.tier ?? ''}</b></span>`;
                    })
                    .join('') ||
                  '<div class="ledger-empty">No upgrades yet. Visit the glowing pads around your stall or open the Upgrade panel on the right.</div>'
                }
              </div>
            </section>
          </div>

          ${
            profile.quest
              ? `<section class="ledger-card ledger-quest">
            <div class="ledger-card-head">
              <div class="ledger-card-title">
                <span class="ledger-card-icon" style="--c:#ffc16b">${icon('target', 16)}</span>
                <div><b>Tonight's mission</b><small>+${peso(profile.quest.reward)} when finished</small></div>
              </div>
              <span class="ledger-card-meta">${Math.min(profile.quest.progress, profile.quest.target)}/${profile.quest.target}</span>
            </div>
            <div class="quest-body">
              <div class="quest-label">${escapeHtml(profile.quest.label)}</div>
              <div class="quest-track"><i style="--w:${Math.min(100, (profile.quest.progress / Math.max(1, profile.quest.target)) * 100)}%"></i></div>
              <div class="quest-state">${profile.quest.paid ? 'Paid out — salamat!' : profile.quest.done ? 'Complete — collect at closing' : 'In progress tonight'}</div>
            </div>
          </section>`
              : ''
          }

          <section class="ledger-card ledger-badges">
            <div class="ledger-card-head">
              <div class="ledger-card-title">
                <span class="ledger-card-icon" style="--c:#f0c14c">${icon('award', 16)}</span>
                <div><b>Badges</b><small>Milestones earned on Colon Street</small></div>
              </div>
              <span class="ledger-card-meta">${ACHIEVEMENTS.filter((a) => a.check(profile)).length}/${ACHIEVEMENTS.length}</span>
            </div>
            <div class="badge-grid">
              ${ACHIEVEMENTS.map((a) => {
                const earned = a.check(profile);
                return `<div class="badge ${earned ? 'earned' : 'locked'}" title="${escapeHtml(a.description)}">
                  <span class="badge-icon">${icon(a.icon, 18)}</span>
                  <b>${escapeHtml(a.title)}</b>
                  <small>${earned ? escapeHtml(a.description) : 'Not yet earned'}</small>
                </div>`;
              }).join('')}
            </div>
          </section>

          <section class="ledger-card ledger-suki">
            <div class="ledger-card-head">
              <div class="ledger-card-title">
                <span class="ledger-card-icon" style="--c:#f0c14c">${icon('users', 16)}</span>
                <div><b>Your regulars</b><small>Suki who keep coming back to your stall</small></div>
              </div>
              <span class="ledger-card-meta">${profile.suki.length} known</span>
            </div>
            <div class="suki-list">
              ${
                [...profile.suki]
                  .sort((a, b) => b.visits - a.visits)
                  .slice(0, 8)
                  .map((suki) => {
                    const favorite = PRODUCTS.find((p) => p.id === suki.favorite);
                    return `<div class="suki-row">
                      <span class="suki-name">${escapeHtml(suki.name)}</span>
                      <span class="suki-fav">${favorite ? escapeHtml(favorite.name) : '—'}</span>
                      <b class="suki-visits">${suki.visits} visit${suki.visits === 1 ? '' : 's'}</b>
                    </div>`;
                  })
                  .join('') ||
                '<div class="ledger-empty">No regulars yet. Keep your prices fair and your shelves full — suki will find you.</div>'
              }
            </div>
          </section>
        </div>

        <footer class="ledger-foot">
          <span class="ledger-foot-note">${icon('sparkle', 11)} Peak day ${peso(profile.lifetime.peakDayRevenue)} · ${profile.lifetime.totalProductsSold} products sold all-time</span>
          <button type="button" class="ledger-btn" data-modal-close>${icon('book', 13)} Close the ledger</button>
        </footer>
      `,
      'ledger-modal',
    );

    window.requestAnimationFrame(() => {
      const trail = modal.el.querySelector<HTMLElement>('.goal-trail');
      const current = modal.el.querySelector<HTMLElement>('.goal-step.current');
      if (trail && current) {
        trail.scrollTop = Math.max(0, current.offsetTop - trail.clientHeight / 2 + current.clientHeight / 2);
      }
    });
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
