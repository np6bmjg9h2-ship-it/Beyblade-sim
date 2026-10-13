// Story mode: data integrity, progression, once-only rewards, chapter
// unlocks, training objectives, story opponents and story tournaments.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, STORY_CAST, STORY_STYLES } from '../src/data/story.js';
import { CHARACTER_INDEX } from '../src/data/characters.js';
import { ARCHETYPE_INDEX } from '../src/data/opponents.js';
import { PART_INDEX } from '../src/data/parts.js';
import { LAUNCHER_INDEX, CABLE_INDEX, TECHNIQUE_INDEX } from '../src/data/launchers.js';
import { ARENA_INDEX } from '../src/data/arenas.js';
import { TOURNAMENT_INDEX, STORY_TOURNAMENTS } from '../src/data/tournaments.js';
import { newProfile, normalizeProfile } from '../src/systems/profile.js';
import {
  storyState, startChapter, currentNode, advance, chapterUnlocked, chapterProgress, grantStoryReward, resolveLines, applyChoice,
  applyCreation, storyOpponent, nextChapter,
} from '../src/systems/story.js';
import { createTournament, readyMatches, applyResult, finishTournament, PLAYER } from '../src/systems/tournament.js';
import { ObjectiveTracker } from '../src/game/objectives.js';
import { assembleTop } from '../src/systems/assembly.js';
import { validateLoadout } from '../src/systems/loadout.js';
import { Rng } from '../src/core/rng.js';

const baseOf = (b) => PART_INDEX[b] || LAUNCHER_INDEX[b] || CABLE_INDEX[b];

test('story data: six chapters, every speaker, opponent, stadium, part and tournament exists', () => {
  assert.equal(CHAPTERS.length, 6);
  const speaker = (s) => s === 'player' || STORY_CAST[s] || CHARACTER_INDEX[s];
  const ids = new Set();
  for (const ch of CHAPTERS) {
    assert.ok(ch.nodes.length >= 5, `${ch.id} has substance`);
    assert.ok(ch.nodes.some((n) => n.type === 'battle'), `${ch.id} has a battle`);
    for (const n of ch.nodes) {
      assert.ok(!ids.has(n.id), 'unique node id ' + n.id); ids.add(n.id);
      for (const k of ['lines', 'pre', 'win', 'lose', 'post']) for (const l of n[k] || []) assert.ok(speaker(l[0]), `${n.id}: speaker ${l[0]}`);
      const rewards = [n.reward, ...(n.choice?.options || []).map((o) => o.reward)].filter(Boolean);
      for (const r of rewards) {
        for (const it of r.items || []) assert.ok(baseOf(it.base), `${n.id}: item ${it.base}`);
        for (const a of r.arenas || []) assert.ok(ARENA_INDEX[a], `${n.id}: arena ${a}`);
        for (const t of r.techniques || []) assert.ok(TECHNIQUE_INDEX[t], `${n.id}: technique ${t}`);
      }
      if (n.arena) assert.ok(ARENA_INDEX[n.arena]);
      if (n.opponent?.rival) assert.ok(CHARACTER_INDEX[n.opponent.rival]);
      if (n.opponent?.archetype) assert.ok(ARCHETYPE_INDEX[n.opponent.archetype]);
      if (n.type === 'tournament') { assert.ok(TOURNAMENT_INDEX[n.tournament]?.hidden, `${n.id}: hidden story tournament`); assert.ok(n.need >= 1); }
      if (n.type === 'battle') assert.ok(n.win?.length && n.lose?.length, `${n.id} has win and lose lines`);
    }
  }
  // chapter 1 covers the full opening: creation, training, rival, Spirit Chip discovery, choice, tournament
  const types = CHAPTERS[0].nodes.map((n) => n.type);
  for (const t of ['create', 'training', 'battle', 'tournament']) assert.ok(types.includes(t), `chapter 1 has a ${t} node`);
  assert.ok(CHAPTERS[0].nodes.some((n) => n.choice), 'chapter 1 has a choice');
  assert.ok(CHAPTERS[0].nodes.some((n) => n.reward?.flags?.includes('ch1_orrery')), 'Spirit Chip discovery');
  for (const s of STORY_STYLES) for (const it of s.items) assert.ok(baseOf(it.base));
});

test('battler creation grants style parts once and equips a valid style loadout', () => {
  for (const st of STORY_STYLES) {
    const P = newProfile(3);
    const n0 = Object.keys(P.inventory).length;
    const r = applyCreation(P, { name: 'Tess', color: '#ff9f43', style: st.id, pronouns: 'she' });
    assert.equal(P.player.archetype, st.id);
    assert.equal(P.player.name, 'Tess');
    assert.equal(Object.keys(P.inventory).length, n0 + st.items.length);
    const L = P.loadouts[P.activeLoadout];
    assert.equal(L.id, 'STYLE');
    assert.ok(validateLoadout(P, L).ok, `${st.id} loadout valid`);
    applyCreation(P, { style: st.id });
    assert.equal(Object.keys(P.inventory).length, n0 + st.items.length, 'no duplicate grant');
    assert.ok(r.items.length === st.items.length);
  }
});

test('progression: nodes advance, choices and rewards apply once, chapters unlock in order, saves round-trip', () => {
  const P = newProfile(11);
  assert.equal(nextChapter(P).id, 'ch1');
  assert.equal(chapterUnlocked(P, CHAPTERS[1]), false);
  startChapter(P, 'ch1');
  const credits0 = P.currency.credits;
  let guard = 0;
  while (currentNode(P) && guard++ < 50) {
    const n = currentNode(P);
    if (n.choice) applyChoice(P, n, n.choice.options[1].value);
    if (n.type === 'create') applyCreation(P, { style: 'drifter' });
    if (n.type === 'tournament') {
      // play the story bracket through the engine with the player winning
      const t = createTournament(TOURNAMENT_INDEX[n.tournament], P, { seed: 5 });
      t.storyNode = n.id;
      P.tournaments.active = t;
      for (let g = 0; g < 50 && t.status === 'active'; g++) for (const m of readyMatches(t)) applyResult(t, m.id, { winnerSide: m.a === PLAYER ? 0 : m.b === PLAYER ? 1 : 0, score: [2, 0] });
      finishTournament(P, t);
      assert.equal(storyState(P).results[n.id].place, 1);
    }
    grantStoryReward(P, n.id, n.reward);
    resolveLines(P, n.lines || []);
    // mid-chapter save/load keeps the position
    const copy = normalizeProfile(JSON.parse(JSON.stringify(P)));
    assert.equal(currentNode(copy).id, n.id);
    advance(P);
  }
  const S = storyState(P);
  assert.ok(S.completed.includes('ch1'));
  assert.ok(S.flags.ch1_qualifier && S.flags.ch1_orrery);
  assert.equal(S.choices.ch1_gift, 'weight');
  assert.ok(P.arenasUnlocked.includes('vortex'));
  assert.ok(P.currency.credits > credits0);
  assert.equal(chapterUnlocked(P, CHAPTERS[1]), true);
  assert.equal(nextChapter(P).id, 'ch2');
  assert.equal(chapterProgress(P, CHAPTERS[0]).complete, true);
  // replay: rewards are not granted twice
  const inv = Object.keys(P.inventory).length, cr = P.currency.credits;
  startChapter(P, 'ch1');
  while (currentNode(P)) { const n = currentNode(P); if (n.choice) applyChoice(P, n, n.choice.options[0].value); grantStoryReward(P, n.id, n.reward); advance(P); }
  assert.equal(Object.keys(P.inventory).length, inv, 'no duplicate items on replay');
  assert.equal(P.currency.credits, cr, 'no duplicate credits on replay');
});

test('dialogue resolves speakers, placeholders and conditions', () => {
  const P = newProfile(2);
  P.player.name = 'Tess';
  const lines = resolveLines(P, [['sora', 'Hi {player}!'], ['narrator', 'Quiet.'], ['hollis', 'Only if flagged', { flag: 'x' }], ['player', 'Me, with {beast}.']]);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].speaker, 'Sora Hayate');
  assert.equal(lines[0].text, 'Hi Tess!');
  assert.ok(lines[1].narrator);
  assert.equal(lines[2].text, 'Me, with Orrery.');
  assert.ok(P.rivals.sora?.seen, 'speaking rivals become seen');
});

test('training objectives are measured from battle events and time', () => {
  const me = { top: { active: true, p: { x: 0, z: 0 } } }, other = { top: { active: true, p: { x: 0.1, z: 0 } } };
  const battle = { fighters: [me, other], phase: 'battle', arena: { radius: 0.2 } };
  const ob = new ObjectiveTracker([
    { type: 'launch', min: 'Good', text: 'l' }, { type: 'hits', n: 2, text: 'h' }, { type: 'dash', text: 'd' },
    { type: 'counter', text: 'c' }, { type: 'survive', seconds: 2, text: 's' }, { type: 'center', seconds: 1, text: 'm' },
  ]);
  ob.onEvent('launch', { fighter: me, result: { quality: { label: 'Weak' } } }, battle, 0);
  assert.equal(ob.list[0].done, false, 'weak launch does not count');
  ob.onEvent('launch', { fighter: me, result: { quality: { label: 'Perfect' } } }, battle, 0);
  ob.onEvent('impact', { A: me, B: other, impulse: 0.03 }, battle, 0);
  ob.onEvent('impact', { A: other, B: me, impulse: 0.001 }, battle, 0);
  assert.equal(ob.list[1].progress, 1, 'glancing contacts do not count');
  ob.onEvent('impact', { A: other, B: me, impulse: 0.05 }, battle, 0);
  ob.onEvent('technique', { fighter: other, name: 'dash' }, battle, 0);
  assert.equal(ob.list[2].done, false, 'opponent dash does not count');
  ob.onEvent('technique', { fighter: me, name: 'dash' }, battle, 0);
  ob.onEvent('counter', { fighter: me }, battle, 0);
  for (let i = 0; i < 25; i++) ob.tick(battle, 0, 0.1);
  assert.ok(ob.list.every((o) => o.done), JSON.stringify(ob.list.map((o) => [o.type, o.done])));
  assert.ok(ob.complete);
});

test('every story battle and training opponent is a legal, battle-ready participant', () => {
  const P = newProfile(4);
  for (const ch of CHAPTERS) {
    for (const n of ch.nodes) {
      if (n.type !== 'battle' && n.type !== 'training') continue;
      const { participant: p, difficulty } = storyOpponent(P, { ...n, chapter: ch.id }, 1);
      const asm = assembleTop(p.build, { spin: p.spin });
      assert.ok(asm.spec.mass > 0.02, n.id);
      assert.ok(difficulty >= 0.4 && difficulty <= 1.35);
      const easy = storyOpponent(P, { ...n, chapter: ch.id }, 0.75).difficulty;
      if (n.type === 'battle') assert.ok(easy < difficulty || difficulty === 0.4, 'story difficulty lowers AI skill');
    }
  }
});

test('story tournaments run to completion in every format', () => {
  const P = newProfile(7);
  P.player.level = 30;
  for (const def of STORY_TOURNAMENTS) {
    const t = createTournament(def, P, { seed: 9 });
    const rng = new Rng(3);
    for (let g = 0; g < 200 && t.status === 'active'; g++) for (const m of readyMatches(t)) applyResult(t, m.id, { winnerSide: rng.chance(0.5) ? 0 : 1, score: [1, 0] });
    assert.equal(t.status, 'complete', def.id);
  }
});
