import type { DailyReport, PlayerProfile } from '../../../shared/types';
import { openModal } from './Modal';
import { escapeHtml, peso } from './format';
import { icon } from './icons';
import type { Notifications } from './Notifications';

export function openDailyReport(
  report: DailyReport,
  profile: PlayerProfile,
  notify?: Notifications,
): void {
  const net = report.net;
  const good = net >= 0;
  const tomorrow = profile.nextDayEvent;
  openModal(
    `
      <div class="report-hero">
        <button class="modal-close" type="button" data-modal-close aria-label="Close">✕</button>
        <div class="report-eyebrow">Day ${report.day} · ${escapeHtml(report.dateLabel)}</div>
        <h2>Closing <span>time</span></h2>
        <p>${report.customers > 0 ? `${report.customers} customers passed your counter before the lanterns dimmed.` : 'The street was quiet at your bay tonight.'}${report.topProduct ? ` Best seller: ${escapeHtml(report.topProduct)}.` : ''}</p>
        <div class="report-net-hero">
          <strong style="color:${good ? '#a9e7b6' : '#e8a093'}">${good ? '+' : '−'}${peso(Math.abs(net))}</strong>
          <span>net for the day</span>
          <span class="net-label ${good ? 'good' : 'bad'}">${good ? 'PROFIT' : 'LOSS'}</span>
        </div>
      </div>
      <div class="modal-body">
        <div class="report-metrics">
          <div class="report-metric"><span>Revenue</span><b style="color:#a9e7b6">${peso(report.revenue)}</b></div>
          <div class="report-metric"><span>Expenses</span><b style="color:#e8a093">${peso(report.expenses)}</b></div>
          <div class="report-metric"><span>Products sold</span><b>${report.productsSold}</b></div>
          <div class="report-metric"><span>Reputation</span><b>${report.reputationDelta >= 0 ? '+' : '−'}${Math.abs(report.reputationDelta).toFixed(1)} → ${Math.floor(report.reputation)}</b></div>
        </div>

        <div class="section-label">Day ledger</div>
        <div class="report-breakdown">
          <div class="breakdown-row"><span>Counter sales</span><b style="color:#a9e7b6">+${peso(report.revenue)}</b></div>
          ${report.breakdown.map((line) => `
            <div class="breakdown-row">
              <span>${escapeHtml(line.label)}</span>
              <b style="color:${line.amount >= 0 ? '#a9e7b6' : '#e8a093'}">${line.amount >= 0 ? '+' : '−'}${peso(Math.abs(line.amount))}</b>
            </div>
          `).join('')}
          <div class="breakdown-row total"><span>Net result</span><b>${good ? '+' : '−'}${peso(Math.abs(net))}</b></div>
        </div>

        <div class="report-metrics" style="grid-template-columns:repeat(3,1fr)">
          <div class="report-metric"><span>Customers today</span><b>${report.customers}</b></div>
          <div class="report-metric"><span>Spoiled stock</span><b>${report.spoiled}</b></div>
          <div class="report-metric"><span>Security incidents</span><b>${report.incidents}</b></div>
        </div>

        <div class="report-notes">
          ${(report.notes.length ? report.notes : ['The stall is still standing. Tomorrow is another market day.'])
            .map((note) => `<div class="report-note">${icon('sparkle', 11)}<span>${escapeHtml(note)}</span></div>`)
            .join('')}
        </div>
      </div>
      <div class="modal-foot">
        <span class="report-tomorrow">${tomorrow ? `${icon('info', 11)} Tomorrow: <b>${escapeHtml(tomorrow)}</b>` : `${icon('info', 11)} A new market day is already opening.`}</span>
        <button type="button" class="btn-gold" data-modal-close>Open the next day</button>
      </div>
    `,
    'report-modal',
  );
  notify?.info('Day closed', `Day ${report.day}: ${good ? 'profit' : 'loss'} of ${peso(Math.abs(net))}.`, good ? 'success' : 'warning');
}
