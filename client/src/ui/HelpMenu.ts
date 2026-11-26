import { GOALS } from '../../../shared/config';
import { modalHeader, openModal } from './Modal';
import { escapeHtml } from './format';
import { icon } from './icons';

export function openHelpMenu(): void {
  openModal(
    `
      ${modalHeader({
        eyebrow: 'How to run the merkado',
        eyebrowIcon: icon('help', 13),
        title: 'Welcome to Colon Street',
        subtitle: 'Your stall, your street, your story. Here is everything you need to get moving.',
      })}
      <div class="modal-body">
        <div class="help-grid">
          <div class="help-card">
            <b>${icon('bag', 14)} Open your stall</b>
            <p>Walk to the glowing counter in front of your bay and press <b>E</b> to buy stock, set prices and activate power-ups. Stock runs out as customers buy.</p>
          </div>
          <div class="help-card">
            <b>${icon('arrowUp', 14)} Upgrade pads</b>
            <p>Four colored pads sit beside your bay. Stand on one and press <b>E</b> to open that branch: Stall, Workers, Security or Products. Tiers unlock in order.</p>
          </div>
          <div class="help-card">
            <b>${icon('users', 14)} Serve the crowd</b>
            <p>Customers appear through the evening rush. Keep good stock and fair prices to build reputation, earn suki, and hit the goals on the left.</p>
          </div>
          <div class="help-card">
            <b>${icon('bolt', 14)} Power-ups & events</b>
            <p>Spend a little for ice, a megaphone or a permit shield. Colon throws typhoons, inspections, fiestas and blackouts — adapt and keep the till safe.</p>
          </div>
          <div class="help-card">
            <b>${icon('monitor', 14)} Controls</b>
            <p><b>WASD</b> walk · <b>Shift</b> run · <b>Space</b> jump · <b>E</b> interact · drag mouse to look · scroll to zoom. Panels: <b>B</b> stock · <b>P</b> power-ups · <b>T</b> ledger · <b>H</b> this help. Emotes: <b>1–4</b> wave, dance, point, cheer. Extras: <b>M</b> mute · <b>F</b> fullscreen · <b>R</b> reset camera.</p>
          </div>
          <div class="help-card">
            <b>${icon('suki', 14)} Suki & missions</b>
            <p>Regulars remember your stall — keep prices fair and they'll return with bulk orders you can accept or decline. A nightly mission pays bonus cash at closing.</p>
          </div>
          <div class="help-card">
            <b>${icon('hands', 14)} Neighborly market</b>
            <p>Visit other bays to see their stalls, send compliments and pick a pace — chill, standard or hustle — in Settings. Export your save there too.</p>
          </div>
          <div class="help-card">
            <b>${icon('calendar', 14)} The market day</b>
            <p>A market day lasts about six minutes and the shared clock only runs while vendors are online. At closing you get a full profit report and daily wages are charged.</p>
          </div>
          <div class="help-card">
            <b>${icon('target', 14)} Goals</b>
            <p>Six long-term goals track your rise from new vendor to Colon legend. They advance automatically as you hit the targets.</p>
          </div>
          <div class="help-card">
            <b>${icon('info', 14)} Save & multiplayer</b>
            <p>Your guest stall is saved on this device's token and on the server. Other vendors are real players — you can visit their bays, see their signs and trade in the same shared market.</p>
          </div>
        </div>
        <div class="section-label" style="margin-top:18px">Goal path</div>
        <div class="goal-list">
          ${GOALS.map((goal, index) => `<div class="goal-list-item"><span class="goal-mark">${index + 1}</span><span>${escapeHtml(goal.title)}</span></div>`).join('')}
        </div>
      </div>
      <div class="modal-foot">
        <span class="modal-foot-note">Tip: a well-stocked counter at 6pm is worth two at midnight.</span>
        <button type="button" class="btn-gold" data-modal-close>Let me sell</button>
      </div>
    `,
    'help-modal',
  );
}
