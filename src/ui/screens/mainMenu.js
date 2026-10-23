// Main hub menu.

import { h, btn } from '../ui.js';
import { beastImg } from '../widgets.js';
import { BEAST_INDEX, bondLevel } from '../../data/beasts.js';
import { PLAYER_LEVEL_XP } from '../../systems/profile.js';
import { MENU_ENTRIES } from './registry.js';
import { TitleScreen } from './title.js';

const TILE_ICONS = { story: '★', rift: '◈', quick: '⚡', modes: '◎', tournaments: '♛', workshop: '⚒', store: '✦', beasts: '❂', archive: '❖', skills: '✚', stats: '▤', settings: '⚙', save: '⬇' };

export class MainMenu {
  static screenName = 'MainMenu';
  render() {
    const app = this.app;
    const p = app.profile;
    const L = p.loadouts[p.activeLoadout] || p.loadouts[0];
    const beast = L?.beast ? BEAST_INDEX[L.beast] : null;
    const bs = beast ? p.beasts[beast.id] : null;
    const card = h('div', { class: 'panel player-card' },
      h('div', { class: 'pc-name' }, p.player.name),
      h('div', { class: 'pc-title' }, p.player.title),
      h('div', { class: 'pc-row' }, `Level ${p.player.level}`, h('div', { class: 'bar small' }, h('div', { class: 'bar-fill', style: { width: `${(p.player.xp / PLAYER_LEVEL_XP(p.player.level)) * 100}%` } }))),
      h('div', { class: 'pc-row' }, `Credits ${p.currency.credits.toLocaleString()} · Research ${p.currency.research}`),
      p.player.skillPoints ? h('div', { class: 'pc-row highlight' }, `${p.player.skillPoints} skill point${p.player.skillPoints > 1 ? 's' : ''} to spend`) : null,
      L ? h('div', { class: 'pc-loadout' }, beast ? beastImg(beast.id, 48) : null, h('div', {}, h('div', { class: 'muted' }, 'Active loadout'), h('b', {}, L.name), beast ? h('div', { class: 'muted' }, `${beast.name} · Bond ${bondLevel(bs?.bondXp || 0)}`) : null)) : null);
    const grid = h('div', { class: 'menu-grid', 'data-wrap': '' });
    for (const e of MENU_ENTRIES) {
      if (e.hidden?.(p)) continue;
      const locked = e.locked?.(p);
      const badge = e.badge?.(p);
      const b = btn(h('div', { class: 'tile' }, h('span', { class: 'tile-icon', 'aria-hidden': 'true' }, TILE_ICONS[e.id] || '◆'), h('div', { class: 'tile-title' }, e.label, badge ? h('span', { class: 'badge' }, '!') : null), h('div', { class: 'tile-desc' }, locked || e.desc)), () => this.open(e), { class: 'tile-btn' + (e.primary ? ' primary' : ''), disabled: !!locked });
      b.dataset.id = e.id;
      b.dataset.desc = locked || e.desc;
      grid.append(b);
    }
    return h('div', { class: 'main-menu' },
      h('div', { class: 'logo small' }, h('div', { class: 'logo-main' }, 'CHAOS', h('span', { class: 'logo-spin' }, 'SPIN')), h('div', { class: 'logo-sub' }, 'ARENA ZERO')),
      h('div', { class: 'main-cols' }, grid, card));
  }

  onEnter() {
    this.app.audio.playMusic('menu');
    if (this.app.sceneMode !== 'showcase') this.app.startShowcase();
  }
  onResume() { this.ui.refresh(this); if (this.app.sceneMode !== 'showcase') this.app.startShowcase(); this.app.audio.playMusic('menu'); }

  async open(e) {
    if (e.action) return e.action(this.app, this);
    this.ui.push(e.screen(this.app));
  }

  async onBack() {
    const ok = await this.ui.confirm('Return to title?', 'Your progress is saved automatically at safe points. Save now and return to the title screen?', { yes: 'Save & quit' });
    if (ok) { await this.app.save(); quitToTitle(this.app); }
    return true;
  }

  prompts() { return [['confirm', 'Select'], ['back', 'Quit to title']]; }
}

export function quitToTitle(app) {
  app.profile = null; app.slot = null;
  app.ui.show(new TitleScreen());
}
