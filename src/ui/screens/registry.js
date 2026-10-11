// Main-menu entries. Each entry opens a screen or runs an action. Only
// implemented features are listed.

import { QuickBattleScreen } from './quickBattle.js';
import { SettingsScreen } from './settings.js';
import { WorkshopScreen } from './workshop.js';
import { BeastsScreen } from './beasts.js';
import { TournamentsScreen } from './tournament.js';
import { StoryScreen } from './story.js';
import { ModesScreen } from './modes.js';
import { SkillsScreen } from './skills.js';
import { StatsScreen } from './stats.js';
import { RiftScreen } from './rift.js';
import { StoreScreen } from './store.js';
import { dealsUnseen } from '../../systems/store.js';
import { trialStatus } from '../../systems/beasts.js';
import { BEASTS } from '../../data/beasts.js';

export const MENU_ENTRIES = [
  { id: 'story', label: 'Story', desc: 'Six chapters from the harbor rooftops to Arena Zero: rivals, training, tournaments and the secret of Orrery.', primary: true, screen: () => new StoryScreen(), badge: (p) => !p.story?.completed?.length },
  { id: 'rift', label: 'Rift Run', desc: 'Roguelite runs: pick your path through four Rifts, grab parts and charms, earn boons, and push deeper for Essence.', screen: () => new RiftScreen(), badge: (p) => !!p.rift?.active },
  { id: 'quick', label: 'Quick Battle', desc: 'Jump straight into a match against an AI opponent.', screen: () => new QuickBattleScreen() },
  { id: 'modes', label: 'Modes', desc: 'Practice Lab, Custom Battle, Challenges, Survival and League.', screen: () => new ModesScreen(), badge: (p) => !!(p.survival?.active || p.league?.active) },
  { id: 'tournaments', label: 'Tournaments', desc: 'The competitive circuit: brackets, leagues, rivals, scouting and your career record.', screen: () => new TournamentsScreen({ openActive: true }), badge: (p) => !!p.tournaments.active },
  { id: 'workshop', label: 'Workshop', desc: 'Assemble loadouts, manage inventory, repair, upgrade, craft and browse your collection.', screen: () => new WorkshopScreen() },
  { id: 'store', label: 'Store', desc: 'Main Store: packs, capsules, bundles and daily deals for CR. Daily Store: one-of-a-kind prototype parts and launchers, new every day.', screen: () => new StoreScreen(), badge: (p) => dealsUnseen(p) },
  { id: 'beasts', label: 'Bit-Beasts', desc: 'Your spirit partners: bond, lore, abilities, resonance, Spirit Trials and Awakening.', screen: () => new BeastsScreen(), badge: (p) => BEASTS.some((b) => trialStatus(p, b.id).available) },
  { id: 'skills', label: 'Skills', desc: 'Spend skill points across five paths: Aggressor, Guardian, Endurance, Technician and Channeler. Respec any time.', screen: () => new SkillsScreen(), badge: (p) => p.player.skillPoints > 0 },
  { id: 'stats', label: 'Statistics', desc: 'Your records, finishes, launches, stadium, build and Bit-Beast usage, and recent battles.', screen: () => new StatsScreen() },
  { id: 'settings', label: 'Settings', desc: 'Graphics, audio, controls, controller calibration and accessibility.', screen: () => new SettingsScreen() },
  { id: 'save', label: 'Save Game', desc: 'Write your progress to this save slot now.', action: async (app) => { if (await app.save()) app.ui.toast('Game saved.', 'good'); } },
];
