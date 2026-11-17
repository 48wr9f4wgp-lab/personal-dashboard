'use strict';
// Synthetic provider/filesystem scenarios only. Native Scriptable networking and glyphs require a device.
process.env.TZ='Asia/Tokyo';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.dirname(__dirname),source=fs.readFileSync(process.argv[2]||path.join(root,'main.js'),'utf8');
const hpath=path.join(__dirname,'regression.cjs'),hs=fs.readFileSync(hpath,'utf8'),end=hs.indexOf('async function main(){');
assert.ok(end>0);const mod={exports:{}};
new Function('require','module','exports','__dirname','__filename',hs.slice(0,end)+'\nmodule.exports={env,nodes,texts,weatherJSON};')(require,mod,mod.exports,__dirname,hpath);
const {env,nodes,texts,weatherJSON}=mod.exports;
const NOW=Date.parse('2030-01-30T12:00:00+09:00'),CACHE='/documents/ore-dashboard-weather/last-good-v1.json';
const results=[],plain=x=>JSON.parse(JSON.stringify(x));
const forecast=w=>nodes(w,'stack').find(n=>n.backgroundColor&&n.children[0]?.kind==='stack'&&texts(n.children[0]).some(t=>/^(今日|前回)降水/.test(t)));
const failures=()=>[{error:'network'},{error:'network'}];
async function scenario(opts={}){
 const e=env({...opts,timerScale:opts.timerScale??0.002});
 const fm=e.context.FileManager.local(),read=fm.readString,write=fm.writeString;let count=0;
 e.record.weatherRequests=[];e.record.moves=[];
 fm.fileSize=p=>Buffer.byteLength(e.files.get(p)||'','utf8');
 fm.remove=p=>{e.files.delete(p);};
 fm.move=(a,b)=>{if(opts.moveError)throw new Error('Synthetic move failure');assert.ok(e.files.has(a));e.files.set(b,e.files.get(a));e.files.delete(a);e.record.moves.push([a,b]);};
 fm.readString=p=>{if(opts.weatherReadError&&p===CACHE)throw new Error('Synthetic read failure');return read(p);};
 fm.writeString=(p,s)=>{if(opts.weatherWriteError&&p.includes('ore-dashboard-weather'))throw new Error('Synthetic write failure');write(p,s);};
 const Native=e.context.Request;
 e.context.Request=class extends Native{
  async loadJSON(){
   assert.equal(this.timeoutInterval,4,'Native idle timeout must stay bounded');
   const i=count++,spec=opts.responses?.[Math.min(i,opts.responses.length-1)]||{};
   this.response={statusCode:spec.status??200,headers:spec.headers||{}};
   e.record.weatherRequests.push({timeout:this.timeoutInterval,status:this.response.statusCode});
   if(spec.never)return new Promise(resolve=>{e.record.releaseWeather=resolve;});
   if(spec.error){
    if(spec.error==='network')this.response=undefined;
    const err=new Error(spec.error==='timeout'?'The request timed out.':spec.error==='json'?'Unexpected token in JSON.':'Synthetic PRIVATE-ERROR https://private.invalid/?latitude=36.123456');
    if(spec.error==='timeout')this.response=undefined;
    if(spec.error==='json')err.name='SyntaxError';throw err;
   }
   if(Object.prototype.hasOwnProperty.call(spec,'data'))return plain(spec.data);
   return super.loadJSON();
  }
 };
 e.result=await new vm.Script('(async function(){\n'+source+'\n})()').runInContext(e.context,{timeout:2000});
 e.widget=e.record.published.at(-1)||e.record.presented.at(-1)?.widget;
 e.fetchLog=e.record.logs.find(s=>s.startsWith('[weather-fetch]'));
 assert.ok(e.widget);assert.equal(e.record.calendarWrites,0);
 return e;
}
async function seeded(opts={}){
 const files=new Map();const r=await scenario({...opts,files,now:opts.now??NOW});
 assert.ok(files.has(CACHE),'A validated live response must seed weather cache');return {files,r};
}
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
async function main(){
 for(const family of ['medium','large'])for(const dark of [false,true]){
  await test('Live then offline retains time/provenance '+family+' '+dark,async()=>{
   const {files,r:first}=await seeded({family,dark});const before=files.get(CACHE);
   assert.equal(first.record.weatherRequests.length,1);assert.ok(first.fetchLog.includes('source=network'));
   const r=await scenario({family,dark,files,now:NOW+20*60000,responses:failures()});const tt=texts(r.widget);
   assert.equal(r.record.weatherRequests.length,2);assert.ok(r.fetchLog.includes('source=cache'));
   assert.ok(tt.some(t=>t.includes('前回 12:00推定')));assert.ok(!tt.some(t=>t.includes('12:20推定')));
   assert.ok(tt.includes('前回降水92%'));assert.ok(!tt.includes('天気を取得できません'));
   assert.equal(files.get(CACHE),before,'Cache use cannot extend its age');
   assert.equal(r.record.moves.length,0);assert.equal(r.record.writes.length,0);
   if(family==='large')assert.equal(nodes(forecast(r.widget),'image').length,6);
   const recovered=await scenario({family,dark,files,now:NOW+25*60000});
   assert.ok(!texts(recovered.widget).some(t=>t.includes('前回 ')));assert.ok(recovered.fetchLog.includes('source=network'));
   assert.ok(texts(recovered.widget).some(t=>t.includes('12:25推定')));
  });
  for(const reason of ['network','timeout','json'])await test('Single retry recovers '+[family,dark,reason],async()=>{
   const r=await scenario({family,dark,responses:[{error:reason},{}]});
   assert.equal(r.record.weatherRequests.length,2);assert.ok(r.fetchLog.includes('source=network'));assert.ok(r.fetchLog.includes('reason=recovered'));
   assert.ok(!texts(r.widget).includes('天気を取得できません'));assert.ok(r.files.has(CACHE));
  });
  await test('Cold offline stays honest '+family+' '+dark,async()=>{
   const r=await scenario({family,dark,responses:failures()});
   assert.equal(r.record.weatherRequests.length,2);assert.ok(texts(r.widget).includes('天気を取得できません'));
   assert.ok(!r.files.has(CACHE));assert.ok(r.fetchLog.includes('source=none'));
   assert.ok(texts(r.widget).includes('Schedule today'));
  });
 }
 for(const status of [400,401,403,404,408,429,500,502,503,504])await test('HTTP retry policy '+status,async()=>{
  const shouldRetry=status===408||status>=500;
  const r=await scenario({responses:[{status,data:{error:true}},{}]});
  assert.equal(r.record.weatherRequests.length,shouldRetry?2:1);
  assert.ok(r.fetchLog.includes(shouldRetry?'source=network':'source=none'));
  if(status===429)assert.ok(r.fetchLog.includes('reason=rate-limit'));
 });
 for(const status of [429,503])await test('Retry-After prevents immediate retry '+status,async()=>{
  const {files}=await seeded();const r=await scenario({files,responses:[{status,headers:{'Retry-After':'60'},error:'json'}]});
  assert.equal(r.record.weatherRequests.length,1);assert.ok(r.fetchLog.includes('http='+status));assert.ok(r.fetchLog.includes('source=cache'));
 });
 for(const min of [0,89,90,91,180])await test('Source and save age limit '+min,async()=>{
  const {files}=await seeded();const r=await scenario({files,now:NOW+min*60000,responses:failures()});
  assert.equal(r.fetchLog.includes('source=cache'),min<=90);assert.equal(texts(r.widget).includes('天気を取得できません'),min>90);
 });
 await test('Reading cache repeatedly cannot renew TTL',async()=>{
  const {files}=await seeded();const saved=files.get(CACHE);
  for(const min of [30,60,89,91]){const r=await scenario({files,now:NOW+min*60000,responses:failures()});assert.equal(r.fetchLog.includes('source=cache'),min<=90);assert.equal(files.get(CACHE),saved);}
 });
 await test('Old model time is not hidden by new savedAt',async()=>{
  const {files}=await seeded();const entry=JSON.parse(files.get(CACHE));entry.payload.current.time='2030-01-30T09:00';files.set(CACHE,JSON.stringify(entry));
  const r=await scenario({files,responses:failures()});assert.ok(r.fetchLog.includes('cache=expired'));assert.ok(texts(r.widget).includes('天気を取得できません'));
 });
 await test('Midnight never maps yesterday forecasts to today',async()=>{
  const night=Date.parse('2030-01-30T23:55:00+09:00');const {files}=await seeded({now:night});
  const r=await scenario({files,now:night+10*60000,responses:failures()});assert.ok(!r.fetchLog.includes('source=cache'));assert.ok(!forecast(r.widget));
 });
 for(const change of [
  {locationResult:{latitude:36.3,longitude:139.4}},
  {geocodeResult:[{locality:'Different synthetic city'}]},
  {geocodeResult:[]},
  {locationError:true}
 ])await test('Different location scope rejects old weather '+JSON.stringify(change),async()=>{
  const {files}=await seeded();const r=await scenario({...change,files,responses:failures()});
  assert.ok(r.fetchLog.includes('cache=location-mismatch'));assert.ok(!r.fetchLog.includes('source=cache'));
 });
 await test('Fallback cache works only with same fallback scope',async()=>{
  const {files}=await seeded({locationError:true});
  const r=await scenario({locationError:true,files,responses:failures()});assert.ok(r.fetchLog.includes('source=cache'));assert.ok(texts(r.widget).includes('代替地点の天気'));
  const normal=await scenario({files,responses:failures()});assert.ok(normal.fetchLog.includes('cache=location-mismatch'));
 });
 for(const corrupt of ['invalid-json','schema','key','saved-future','saved-string','payload-code','payload-temp','payload-future','payload-time','too-large'])await test('Corrupt cache is ignored '+corrupt,async()=>{
  const {files}=await seeded();const entry=JSON.parse(files.get(CACHE));
  if(corrupt==='schema')entry.schema=999;if(corrupt==='key')entry.key='Other';
  if(corrupt==='saved-future')entry.savedAt=NOW+1;if(corrupt==='saved-string')entry.savedAt=String(NOW);
  if(corrupt==='payload-code')entry.payload.current.weather_code=777;if(corrupt==='payload-temp')entry.payload.current.temperature_2m=99;
  if(corrupt==='payload-future')entry.payload.current.time='2030-01-30T12:16';if(corrupt==='payload-time')entry.payload.current.time='bad';
  files.set(CACHE,corrupt==='invalid-json'?'{broken':corrupt==='too-large'?'x'.repeat(65000):JSON.stringify(entry));
  const r=await scenario({files,responses:failures()});assert.ok(!r.fetchLog.includes('source=cache'));assert.ok(texts(r.widget).includes('天気を取得できません'));
 });
 for(const fault of ['weatherReadError','weatherWriteError','moveError'])await test('Storage failure does not break live weather or overwrite last-good '+fault,async()=>{
  const {files}=await seeded();const prior=files.get(CACHE);
  const r=await scenario({files,[fault]:true,now:NOW+5*60000});assert.ok(r.fetchLog.includes('source=network'));
  assert.ok(!texts(r.widget).includes('天気を取得できません'));
  if(fault!=='weatherReadError'){assert.equal(files.get(CACHE),prior);assert.ok(r.fetchLog.includes('save=write-failed'));}
  assert.ok(![...files.keys()].some(k=>k.includes('/pending-')));
 });
 await test('Cache read failure during outage is harmless',async()=>{
  const {files}=await seeded();const r=await scenario({files,weatherReadError:true,responses:failures()});assert.ok(r.fetchLog.includes('cache=read-failed'));assert.ok(texts(r.widget).includes('天気を取得できません'));
 });
 for(const issue of ['code','temperature','daily','stale','time','api'])await test('Bad live payload does not poison last-good '+issue,async()=>{
  const {files}=await seeded();const saved=files.get(CACHE),bad=weatherJSON(NOW);
  if(issue==='code')bad.current.weather_code=777;if(issue==='temperature')bad.current.temperature_2m=999;
  if(issue==='daily')bad.daily.weather_code[5]=null;if(issue==='stale')bad.current.time='2030-01-30T09:00';
  if(issue==='time')bad.current.time='bad';if(issue==='api')bad.error=true;
  const r=await scenario({files,responses:[{data:bad}]});assert.equal(files.get(CACHE),saved);
  assert.ok(r.fetchLog.includes(issue==='daily'?'source=network':'source=cache'));
 });
 for(const family of ['medium','large'])for(const sourceState of ['network','lastGood','unknown'])await test('Cache and code-source warnings coexist '+family+' '+sourceState,async()=>{
  const {files}=await seeded({family});
  const r=await scenario({family,files,responses:failures(),runtime:{codeSource:sourceState}});const tt=texts(r.widget);
  assert.ok(tt.some(t=>t.includes('前回 12:00推定')));
  if(sourceState==='lastGood')assert.ok(tt.includes('前回コード'));if(sourceState==='unknown')assert.ok(tt.includes('取得元不明'));
 });
 for(const width of [320,375,393,430])for(const dark of [false,true])for(const sourceState of ['network','lastGood'])await test('Cached weather remains labeled in compact/regular layouts '+[width,dark,sourceState],async()=>{
  const {files}=await seeded({family:'medium',locationError:true,screenWidth:width,dark});
  const r=await scenario({family:'medium',locationError:true,screenWidth:width,dark,files,responses:failures(),runtime:{codeSource:sourceState}});
  const tt=texts(r.widget);assert.ok(tt.some(t=>t.includes('前回 12:00推定')));
  if(sourceState==='lastGood')assert.ok(tt.includes('前回コード'));
  const budget=+/budget=(\d+)pt/.exec(r.record.logs.find(x=>x.includes(' medium;')))[1];assert.ok(budget<=(width<=320?141:155));
 });
 for(const flag of ['noTimer','timerError'])await test('Unavailable Timer does not prevent native weather request '+flag,async()=>{
  const r=await scenario({[flag]:true});assert.equal(r.record.weatherRequests.length,1);assert.ok(r.fetchLog.includes('source=network'));
 });
 await test('Unsettled native request has bounded await, no overlap, no late cache mutation',async()=>{
  const {files}=await seeded();const saved=files.get(CACHE);
  const r=await scenario({files,responses:[{never:true}],timerScale:0.002});
  assert.equal(r.record.weatherRequests.length,1);assert.ok(r.fetchLog.includes('reason=time-budget'));assert.ok(r.fetchLog.includes('source=cache'));
  const tree=JSON.stringify(r.widget);r.record.releaseWeather(weatherJSON(NOW+60000));await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(JSON.stringify(r.widget),tree);assert.equal(files.get(CACHE),saved);assert.equal(r.record.published.length,1);
 });
 await test('New diagnostics do not disclose locations, URLs or native messages',async()=>{
  const r=await scenario({cfg:{fallbackCity:'PRIVATE-CITY',fallbackLat:36.123456,fallbackLon:140.98765},responses:failures()});
  assert.ok(r.fetchLog);assert.ok(!/PRIVATE|https?:|latitude|longitude|36\.123456|140\.98765/i.test(r.fetchLog));
 });
 const failed=results.filter(r=>r.status==='FAIL');for(const r of results)console.log(r.status+' '+r.name+(r.error?'\n'+r.error:''));
 console.log(JSON.stringify({suite:'weather-recovery',passed:results.length-failed.length,failed:failed.length,total:results.length,limits:'Synthetic request/time/storage/UI-tree tests, not native iPhone text fit or actual outage diagnosis.'}));
 if(failed.length)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
