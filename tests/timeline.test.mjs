import assert from 'node:assert/strict';
import test from 'node:test';
import { createChannelLanes, createTimelineLayout, programmeScrollTop, programmeSpan, MIN_TOUCH_HEIGHT } from '../lib/timeline.mjs';
import { initialChannels, liveProgramme, selectChannelSlot } from '../lib/client.mjs';
const day='2026-10-11';
const p=(id,start,end)=>({id,start:`${day}T${start}:00+08:00`,end:`${day}T${end}:00+08:00`});
const close=(a,b)=>assert.ok(Math.abs(a-b)<0.00001,`${a} != ${b}`);
test('15 minute and one minute programmes have usable touch targets before measurement',()=>{
  const items=[p('a','08:00','08:15'),p('b','08:15','08:16'),p('c','08:16','08:30')];
  const layout=createTimelineLayout(items,day);
  for(const item of items) assert.ok(layout.positions.get(item.id).height>=MIN_TOUCH_HEIGHT-0.00001);
  close(layout.positions.get('a').top+layout.positions.get('a').height,layout.positions.get('b').top);
  close(layout.positions.get('b').top+layout.positions.get('b').height,layout.positions.get('c').top);
});
test('long Chinese title/preview measured at narrow width expands the shared axis without overlaps',()=>{
  const items=[p('a','08:00','08:15'),p('b','08:15','08:30'),p('other','08:00','08:30')];
  const layout=createTimelineLayout(items,day,{a:420,b:190,other:270});
  assert.ok(layout.positions.get('a').height>=420);
  assert.ok(layout.positions.get('b').height>=190);
  close(layout.positions.get('other').top,layout.positions.get('a').top);
  close(layout.positions.get('other').height,layout.positions.get('a').height+layout.positions.get('b').height);
  close(layout.minuteToY(495),layout.positions.get('b').top);
  close(layout.minuteToY(510),layout.positions.get('b').top+layout.positions.get('b').height);
});
test('large-font remeasurement grows geometry and keeps minute labels monotonic',()=>{
  const items=[p('a','08:00','08:15'),p('b','08:15','08:30')];
  const normal=createTimelineLayout(items,day,{a:100,b:110});
  const large=createTimelineLayout(items,day,{a:260,b:320});
  assert.ok(large.height>normal.height);
  for(let minute=0;minute<1440;minute++) assert.ok(large.minuteToY(minute)<large.minuteToY(minute+1));
  close(large.positions.get('b').top,large.minuteToY(495));
});
test('mobile channel 81 live target follows expanded geometry instead of a fixed minute scale',()=>{
  assert.equal(initialChannels(true,['rthk-31','tvb-81'])[0],'tvb-81');
  const items=[p('earlier','20:00','20:15'),p('current','20:15','20:30')];
  const layout=createTimelineLayout(items,day,{earlier:400,current:270});
  const current=liveProgramme(items,Date.parse(`${day}T20:20:00+08:00`));
  assert.equal(current.id,'current');
  close(layout.minuteToY(programmeSpan(current,day).startMinute),layout.positions.get('current').top);
  assert.ok(layout.positions.get('current').top>20*60*2.5+15*2.5);
  assert.equal(liveProgramme(items,Date.parse(`${day}T23:00:00+08:00`)),null);
});
test('cross-midnight clipping still has a usable card and exact date boundaries',()=>{
  const item={id:'carry',start:'2026-10-10T23:55:00+08:00',end:'2026-10-11T00:05:00+08:00'};
  const layout=createTimelineLayout([item],day,{carry:160});
  assert.equal(layout.positions.get('carry').top,0);
  assert.ok(layout.positions.get('carry').height>=160);
  close(layout.minuteToY(5),layout.positions.get('carry').height);
  assert.equal(createTimelineLayout([item],'2026-10-12').positions.size,0);
});

test('real source overlaps use separate lanes while adjacent programmes keep one full-width lane',()=>{
  const carry={id:'carry',start:'2026-10-10T23:50:00+08:00',end:'2026-10-11T00:04:00+08:00'};
  const items=createChannelLanes([p('next','00:00','00:30'),carry,p('after','00:30','00:45')],day);
  assert.deepEqual(items.map(x=>x.id),['carry','next','after']);
  assert.equal(items[0].laneCount,2);assert.equal(items[1].laneCount,2);
  assert.notEqual(items[0].lane,items[1].lane);
  assert.equal(items[2].laneCount,1);
  assert.equal(items[0].start,carry.start);assert.equal(items[0].end,carry.end);
  const layout=createTimelineLayout(items,day,{carry:300,next:450,after:120});
  assert.equal(layout.positions.get('carry').top,0);
  assert.equal(layout.positions.get('next').top,0);
  close(layout.positions.get('after').top,layout.minuteToY(30));
});

test('five-minute programmes without descriptions keep their title and clickable measured area',()=>{
  const weather={...p('weather','23:30','23:35'),title:'天氣報告'};
  const music={...p('music','15:55','16:00'),title:'勁歌推介'};
  const retained=createChannelLanes([weather,music],day);
  assert.equal(retained.length,2);
  assert.ok(retained.every(item=>item.title && item.description===undefined));
  const layout=createTimelineLayout(retained,day,{weather:82,music:96});
  assert.ok(layout.positions.get('weather').height>=82);
  assert.ok(layout.positions.get('music').height>=96);
});
test('scroll centres a short card under the sticky header and reveals the start of tall preview text',()=>{
  const header=54,viewport=650;
  const short={top:2000,height:100};
  const top=programmeScrollTop(short,header,viewport,8000);
  close(header+short.top-top+short.height/2,header+(viewport-header)/2);
  const tall={top:2500,height:900};
  const tallTop=programmeScrollTop(tall,header,viewport,8000);
  close(header+tall.top-tallTop,header+12);
  assert.equal(programmeScrollTop({top:0,height:100},header,viewport,8000),0);
  assert.equal(programmeScrollTop({top:9999,height:200},header,viewport,3000),3000);
});
test('last channel/date request owns live geometry after rapid changes; missing programmes never produce unrelated target',async()=>{
  const {createLatestRequest}=await import('../lib/client.mjs');
  const begin=createLatestRequest();
  const first=begin(), second=begin(), last=begin();
  const old=p('old','19:00','19:15'),current=p('latest','20:00','20:15');
  const now=Date.parse(`${day}T20:05:00+08:00`);
  assert.equal(first.isCurrent(),false);assert.equal(second.isCurrent(),false);assert.equal(last.isCurrent(),true);
  assert.equal(liveProgramme([old],now),null);
  const target=liveProgramme([current],now);
  const layout=createTimelineLayout([target],day,{latest:380});
  const position=layout.positions.get(target.id);
  const scroll=programmeScrollTop(position,54,650,layout.height-650);
  assert.ok(54+position.top-scroll>=54);
});

test('jump uses the visible part of the guide when the container extends below the browser window',()=>{
  const header=72,containerHeight=650,containerPageTop=440,windowHeight=757;
  const position={top:3000,height:130};
  const visibleBottom=windowHeight-containerPageTop;
  const scroll=programmeScrollTop(position,header,containerHeight,9000,0,visibleBottom);
  const cardWindowTop=containerPageTop+header+position.top-scroll;
  assert.ok(cardWindowTop>=containerPageTop+header);
  assert.ok(cardWindowTop+position.height<=windowHeight-12);
  const tall={top:3000,height:600};
  const tallScroll=programmeScrollTop(tall,header,containerHeight,9000,0,visibleBottom);
  close(containerPageTop+header+tall.top-tallScroll,containerPageTop+header+12);
});

test('choosing any channel swaps duplicate slots and rapid selections preserve the last deliberate choice',()=>{
  const original=['rthk-31','hoy-77','tvb-81','viu-99'];
  const swapped=selectChannelSlot(original,1,'tvb-81');
  assert.deepEqual(swapped,['rthk-31','tvb-81','hoy-77','viu-99']);
  const latest=selectChannelSlot(selectChannelSlot(swapped,1,'tvb-84'),1,'hoy-78');
  assert.equal(latest[1],'hoy-78');
  assert.deepEqual(original,['rthk-31','hoy-77','tvb-81','viu-99']);
});

test('remeasuring preceding long text keeps the current card readable when re-anchored',()=>{
  const items=[p('previous','20:00','20:15'),p('current','20:15','20:30')];
  for(const measured of [{previous:80,current:95},{previous:650,current:800}]){
    const layout=createTimelineLayout(items,day,measured);
    const position=layout.positions.get('current');
    const top=programmeScrollTop(position,54,650,layout.height-650,0,380);
    const visibleCardTop=54+position.top-top;
    assert.ok(visibleCardTop>=54 && visibleCardTop<380);
  }
});
