'use strict';
// Synthetic provider/calendar records only. Fixed boxes are checked, not native iOS glyphs.
process.env.TZ='Asia/Tokyo';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.dirname(__dirname),source=fs.readFileSync(process.argv[2]||path.join(root,'main.js'),'utf8');
const hpath=path.join(__dirname,'regression.cjs'),hs=fs.readFileSync(hpath,'utf8'),end=hs.indexOf('async function main(){');
assert.ok(end>0);const mod={exports:{}};
new Function('require','module','exports','__dirname','__filename',hs.slice(0,end)+'\nmodule.exports={run,env,nodes,texts,card,weatherJSON,fixtures};')(require,mod,mod.exports,__dirname,hpath);
const {run,nodes,texts,card,weatherJSON,fixtures}=mod.exports;
const results=[],plain=x=>JSON.parse(JSON.stringify(x));
const parent=(w,node)=>nodes(w,'stack').find(n=>n.children.includes(node));
const clock=(day,hour)=>Date.parse('2030-01-'+day+'T'+String(hour).padStart(2,'0')+':00:00+09:00');
const evt=(title,start,end,allDay=false)=>({title,calendar:{title:'Synthetic'},notes:'',startDate:new Date(start),endDate:new Date(end),isAllDay:allDay});
const rowWith=(w,title)=>{const n=nodes(w,'text').find(n=>n.text===title);assert.ok(n,'Missing title '+title);return parent(w,parent(w,n));};
const sumWidths=row=>row.children.reduce((sum,n)=>sum+(n.kind==='stack'?n.size.width:n.length||0),0);
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
async function main(){
 for(const width of [320,375,393,430])for(const dark of [false,true])for(const fallback of [false,true]){
  for(const city of ['合成市','合成テスト市','合成代替地域名が非常に長い市区町村'])await test('Location has protected width '+[width,dark,fallback,city],async()=>{
   const r=await run(source,{family:'large',screenWidth:width,dark,locationError:fallback,geocodeResult:[{locality:city}],cfg:{fallbackCity:city,fallbackLat:36,fallbackLon:140}});
   const forecast=card(r.widget,'週間天気');assert.ok(forecast);
   const heading=forecast.children[0],cityNode=nodes(heading,'text').find(n=>n.text===city);assert.ok(cityNode);
   const cityCell=parent(heading,cityNode);
   assert.ok(cityCell.size.width>=80,'Location must not be reduced to a few characters');
   assert.deepEqual(plain(cityCell.padding),[0,0,0,0]);assert.equal(cityCell.spacing,0);
   assert.equal(cityNode.font.size,10);assert.equal(cityNode.minimumScaleFactor,1);assert.equal(cityNode.lineLimit,1);
   assert.equal(sumWidths(heading),heading.size.width,'Heading allocations exactly fit their parent');
   assert.ok(heading.children.every(n=>n.kind==='stack'||(n.kind==='spacer'&&n.length===4)));
   const rain=nodes(heading,'text').find(n=>/^今日降水/.test(n.text));assert.ok(rain);
   assert.equal(parent(heading,rain).size.width,88);assert.equal(rain.minimumScaleFactor,1);
   const header=r.widget.children.find(n=>n.kind==='stack');
   assert.equal(texts(header).includes('代替地点の天気'),fallback,'Current weather must disclose fallback too');
   assert.equal(texts(heading).includes('〈代替地点〉'),fallback);
   if(fallback){const badge=nodes(heading,'text').find(n=>n.text==='〈代替地点〉');assert.equal(parent(heading,badge).size.width,64);assert.notEqual(parent(heading,badge),cityCell);}
   if(width===320&&fallback)assert.ok(!texts(heading).includes('週間天気'),'Caption yields before city shrinks');
   assert.equal(nodes(forecast,'image').length,6);
   const url=new URL(r.record.requests.find(u=>u.includes('api.open-meteo.com')));
   assert.equal(url.searchParams.get('latitude'),fallback?'36':'35.68');assert.equal(r.record.calendarWrites,0);
  });
 }
 for(const width of [320,393,430])for(const dark of [false,true])for(const kind of ['partial','weatherError','unknown-city'])await test('Location disclosure survives '+[width,dark,kind],async()=>{
  const data=weatherJSON();if(kind==='partial')data.daily.weather_code[5]=null;
  const r=await run(source,{family:'large',screenWidth:width,dark,data,weatherError:kind==='weatherError',locationError:kind!=='unknown-city',geocodeResult:[],cfg:{fallbackCity:'合成テスト市',fallbackLat:36,fallbackLon:140}});
  const header=r.widget.children.find(n=>n.kind==='stack');
  assert.equal(texts(header).includes('代替地点の天気'),kind!=='unknown-city');
  if(kind==='unknown-city'){assert.ok(texts(r.widget).includes('現在地・地名不明'));assert.ok(!texts(r.widget).includes('〈代替地点〉'));}
  else assert.ok(texts(r.widget).includes('合成テスト市'));
  if(kind==='weatherError')assert.ok(texts(header).includes('天気を取得できません'));
  if(kind==='partial'){const f=card(r.widget,'週間天気');assert.equal(nodes(f,'image').length,0);assert.ok(texts(f).includes('週間予報を取得できません'));}
 });
 const stages=[
  ['success',{},'current','ok','ok'],['GPS rejection',{locationError:true},'fallback','failed','not-requested'],
  ['GPS timeout',{locationNever:true,timerScale:0.002},'fallback','timeout','not-requested'],
  ['Timer missing',{noTimer:true},'fallback','timer-unavailable','not-requested'],
  ['Timer rejection',{timerError:true},'fallback','failed','not-requested'],
  ['invalid coordinates',{locationResult:{latitude:999,longitude:1}},'fallback','invalid-coordinates','not-requested'],
  ['geocode rejection',{geocodeError:true},'current','ok','failed'],
  ['geocode timeout',{geocodeNever:true,timerScale:0.002},'current','ok','timeout'],
  ['geocode empty',{geocodeResult:[]},'current','ok','empty-result'],
  ['geocode name absent',{geocodeResult:[{}]},'current','ok','name-missing'],
  ['geocode name invalid',{geocodeResult:[{locality:123}]},'current','ok','name-missing']
 ];
 for(const family of ['medium','large'])for(const [name,opts,src,gps,geo] of stages)await test('Safe stage diagnostics '+family+' '+name,async()=>{
  const r=await run(source,{...opts,family,cfg:{fallbackCity:'PRIVATE-CITY-SENTINEL',fallbackLat:36.12345,fallbackLon:140.54321}});
  const lines=r.record.logs.filter(x=>x.startsWith('[location]'));
  assert.deepEqual(lines,['[location] source='+src+' gps='+gps+' geocode='+geo]);
  assert.ok(!/PRIVATE|36\.12345|140\.54321|permission|denied/i.test(lines[0]),'Do not leak settings or invent permission diagnosis');
  assert.equal(r.record.calendarWrites,0);assert.equal(r.record.published.length,1);
 });
 for(const family of ['medium','large'])for(const dark of [false,true])for(const previous of ['all-day','timed','unknown'])await test('Unknown-time row repeats its absolute date '+[family,dark,previous],async()=>{
  const before=previous==='all-day'?evt('Synthetic preceding day',clock(31,0),clock(31,0)+86400000,true):evt(previous==='unknown'?'[時間未定] Synthetic preceding unknown':'Synthetic preceding timed',clock(31,1),clock(31,2));
  const title='[時間未発表] Synthetic target',target=evt(title,clock(31,10),clock(31,11));
  const records=[before,target],snapshot=JSON.stringify(records),r=await run(source,{family,dark,events:records});
  const row=rowWith(r.widget,title);assert.equal(texts(row.children[0])[0],'1/31');assert.ok(texts(row).includes('未定'));assert.ok(!texts(row).includes('10:00'));
  assert.equal(JSON.stringify(records),snapshot);assert.equal(r.record.calendarWrites,0);
 });
 for(const family of ['medium','large'])for(const day of [30,31])await test('Unknown-time day remains explicit '+family+' '+day,async()=>{
  const title='[時間未定] Synthetic date-only';
  const r=await run(source,{family,events:[evt(title,clock(day,0),clock(day,1))]});
  assert.equal(texts(rowWith(r.widget,title).children[0])[0],'1/'+day);
 });
 for(const family of ['medium','large'])await test('Known-time rows retain day grouping '+family,async()=>{
  const r=await run(source,{family,events:[evt('First',clock(31,13),clock(31,14)),evt('Second',clock(31,15),clock(31,16))]});
  assert.equal(texts(rowWith(r.widget,'Second').children[0])[0],'');assert.ok(texts(rowWith(r.widget,'Second')).includes('15:00'));
 });
 // Source contract: no new network request, permission change, or actual event edit.
 await test('Location stage labels do not expose raw exceptions',()=>{
  const a=source.indexOf('function locationDiagnostic('),b=source.indexOf('// The age threshold',a);assert.ok(a>0&&b>a);
  const fn=source.slice(a,b);assert.ok(!/pos\.(?:city|lat|lon)|error\.(?:message|stack)/.test(fn));
 });
 const failed=results.filter(r=>r.status==='FAIL');
 for(const r of results)console.log(r.status+' '+r.name+(r.error?'\n'+r.error:''));
 console.log(JSON.stringify({suite:'location-disclosure',passed:results.length-failed.length,failed:failed.length,total:results.length,limits:'Synthetic API/UI-tree checks; native text fit, GPS causes and refresh not established.'}));
 if(failed.length)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
