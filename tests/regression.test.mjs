import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSchedules, overlappingDates, validateSchedules } from '../lib/schedules.mjs';
import { createLatestRequest, initialChannels, liveProgramme } from '../lib/client.mjs';
const channels = [{id:'tvb-81',operator:'TVB'}, {id:'viu-99',operator:'ViuTV'}];
const item = (channelId, start, end, title='Programme') => ({ id:`${channelId}-${Date.parse(start)}`, channelId, title, start, end });
const old = item('viu-99','2026-10-10T23:30:00+08:00','2026-10-11T01:00:00+08:00');
const archive = {date:'2026-10-10',updatedAt:'2026-10-10T00:00:00Z',channels,programmes:[old]};
const now = '2026-10-11T05:00:00Z';
test('partial failures and moving source windows preserve real archives and carry midnight programmes',()=>{
  const fresh=item('tvb-81','2026-10-11T00:00:00+08:00','2026-10-12T00:00:00+08:00');
  const merged=mergeSchedules([archive],{TVB:{items:[fresh]},ViuTV:{error:'outage'}},channels,now);
  validateSchedules(merged);
  assert.deepEqual(merged.map(s=>s.date),['2026-10-10','2026-10-11']);
  assert.ok(merged.every(s=>s.programmes.some(p=>p.id===old.id)));
  assert.equal(merged[1].sourceStatus.ViuTV.complete,false);
  assert.equal(merged[1].sourceStatus.ViuTV.channels['viu-99'].lastSuccessAt,null);
  assert.equal(merged[1].sourceStatus.TVB.complete,true);
  assert.equal(merged[0].sourceStatus.TVB.refreshed,false);
  const again=mergeSchedules(merged,{TVB:{items:[fresh]}},channels,now);
  assert.deepEqual(again.map(s=>s.programmes),merged.map(s=>s.programmes));
});
test('end exactly at midnight does not leak into next day, dates independent of host timezone',()=>{
  assert.deepEqual(overlappingDates(item('tvb-81','2026-10-10T15:00:00Z','2026-10-10T16:00:00Z')),['2026-10-10']);
});
test('new source interval replaces canceled programmes without deleting older dates',()=>{
  const fresh=item('viu-99',old.start,old.end,'Revised');
  const merged=mergeSchedules([archive],{ViuTV:{items:[fresh]}},channels,now);
  assert.equal(merged[0].programmes.length,1);
  assert.equal(merged[0].programmes[0].title,'Revised');
  assert.throws(()=>mergeSchedules([archive],{TVB:{items:[{...fresh,channelId:'invalid'}]}},channels,now));
});
test('validation rejects overlap and duplicates before publication',()=>{
  assert.throws(()=>validateSchedules([{...archive,programmes:[old,old]}]));
});
test('latest request rejects late response and canceled request; retry can succeed',()=>{
  const begin=createLatestRequest();const a=begin(), b=begin();
  assert.equal(a.isCurrent(),false);assert.equal(b.isCurrent(),true);
  b.cancel();assert.equal(b.signal.aborted,true);assert.equal(b.isCurrent(),false);
  const retry=begin();assert.equal(retry.isCurrent(),true);
});
test('mobile initial default is 81 and current programme handles midnight, gaps and end boundary',()=>{
  assert.deepEqual(initialChannels(true,['rthk-31','tvb-81','viu-99']),['tvb-81','rthk-31','viu-99']);
  assert.deepEqual(initialChannels(false,['rthk-31']),['rthk-31']);
  assert.equal(liveProgramme([old],Date.parse('2026-10-11T00:30:00+08:00')),old);
  assert.equal(liveProgramme([old],Date.parse(old.end)),null);
  assert.equal(liveProgramme([],Date.now()),null);
});

test('migration of all real archives preserves every known programme and repairs carryovers', async()=>{
  const {readFile}=await import('node:fs/promises');
  const root=new URL('../public/data/',import.meta.url);
  const index=JSON.parse(await readFile(new URL('index.json',root),'utf8'));
  const archives=await Promise.all(index.dates.map(async date=>JSON.parse(await readFile(new URL(`${date}.json`,root),'utf8'))));
  const migrated=mergeSchedules(archives,{},archives[0].channels,now);
  validateSchedules(migrated);
  const known=new Set(archives.flatMap(s=>s.programmes.map(p=>p.id)));
  const retained=new Set(migrated.flatMap(s=>s.programmes.map(p=>p.id)));
  assert.deepEqual(retained,known);
  for(const schedule of migrated) for(const programme of schedule.programmes) for(const date of overlappingDates(programme)) {
    assert.ok(migrated.find(s=>s.date===date)?.programmes.some(p=>p.id===programme.id));
  }
});

test('legacy per-run success never becomes confirmed per-date freshness',()=>{
  const result=mergeSchedules([{...archive,sourceStatus:{ViuTV:true}}],{},channels,now);
  assert.equal(result[0].sourceStatus.ViuTV.channels['viu-99'].lastSuccessAt,null);
  assert.equal(result[0].sourceStatus.ViuTV.complete,false);
});

test('sparse response preserves known programmes in holes and missing channels',()=>{
  const a=item('tvb-81','2026-10-11T00:00:00+08:00','2026-10-11T01:00:00+08:00');
  const b=item('tvb-81','2026-10-11T01:00:00+08:00','2026-10-11T02:00:00+08:00');
  const c=item('tvb-81','2026-10-11T02:00:00+08:00','2026-10-11T03:00:00+08:00');
  const result=mergeSchedules([{...archive,date:'2026-10-11',programmes:[a,b,c]}],{TVB:{items:[{...a,title:'Changed'},c]}},channels,now);
  assert.equal(result[0].programmes.length,3);
  assert.ok(result[0].programmes.some(p=>p.id===b.id));
  assert.equal(result[0].sourceStatus.TVB.channels['tvb-81'].lastSuccessAt,null);
  assert.equal(result[0].sourceStatus.TVB.refreshed,false);
  assert.equal(result[0].sourceStatus.TVB.complete,false);
});
test('source midnight conflicts are preserved and flagged incomplete',()=>{
  const next=item('viu-99','2026-10-11T00:00:00+08:00','2026-10-12T00:00:00+08:00');
  const result=mergeSchedules([archive,{...archive,date:'2026-10-11',programmes:[next]}],{},channels,now);
  validateSchedules(result);
  assert.equal(result[1].programmes.length,2);
  assert.equal(result[1].sourceStatus.ViuTV.complete,false);
});
