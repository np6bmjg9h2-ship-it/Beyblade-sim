// Launch energy and technique per legend vs the attack relic build (12 bo3 each, Standard).
const ROOT=new URL('../../', import.meta.url).href;
const { Battle } = await import(ROOT+'src/game/battle.js');
const { participants } = await import('./legprobe-lib.mjs');
for (const leg of ['azure','vermilion','white','black']) {
  const [pl, pr] = await participants(leg, 'attack');
  const e = { l: [], r: [], tl: {}, tr: {} };
  for (let i = 0; i < 12; i++) {
    const b = new Battle({ arenaId: 'standard', format: 'bo3', seed: 9000 + i * 7919, participants: [pl, pr] });
    b.on('roundStart', () => {});
    const origEnd = b.endRound.bind(b);
    b.endRound = () => { const [fl, fr] = b.fighters; e.l.push(fl.launch.result?.energy || 0); e.r.push(fr.launch.result?.energy || 0); e.tl[fl.launch.technique] = (e.tl[fl.launch.technique]||0)+1; e.tr[fr.launch.technique]=(e.tr[fr.launch.technique]||0)+1; origEnd(); };
    b.runHeadless();
  }
  const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
  console.log(leg.padEnd(10), 'legend E', avg(e.l), JSON.stringify(e.tl), launcherOf(pl), '| relic E', avg(e.r), JSON.stringify(e.tr));
}
function launcherOf(p) { return (p.launcher?.base || p.launcher?.baseId || '') + '/' + (p.cable?.base || ''); }
