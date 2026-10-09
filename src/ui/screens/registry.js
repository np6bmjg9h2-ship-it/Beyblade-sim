// Main-menu entries. Each entry opens a screen or runs an action. Only
// implemented features are listed.

import { QuickBattleScreen } from './quickBattle.js';
import { SettingsScreen } from './settings.js';
import { WorkshopScreen } from './workshop.js';
import { BeastsScreen } from './beasts.js';
import { trialStatus } from '../../systems/beasts.js';
import { BEASTS } from '../../data/beasts.js';

export const MENU_ENTRIES = [
  { id: 'quick', label: 'Quick Battle', desc: 'Jump straight into a match against an AI opponent.', primary: true, screen: () => new QuickBattleScreen() },
  { id: 'workshop', label: 'Workshop', desc: 'Assemble loadouts, manage inventory, repair, upgrade, craft and browse your collection.', screen: () => new WorkshopScreen() },
  { id: 'beasts', label: 'Bit-Beasts', desc: 'Your spirit partners: bond, lore, abilities, resonance, Spirit Trials and Awakening.', screen: () => new BeastsScreen(), badge: (p) => BEASTS.some((b) => trialStatus(p, b.id).available) },
  { id: 'settings', label: 'Settings', desc: 'Graphics, audio, controls, controller calibration and accessibility.', screen: () => new SettingsScreen() },
  { id: 'save', label: 'Save Game', desc: 'Write your progress to this save slot now.', action: async (app) => { if (await app.save()) app.ui.toast('Game saved.', 'good'); } },
];
