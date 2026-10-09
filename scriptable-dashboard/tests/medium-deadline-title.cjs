'use strict';
// Focused tests for the real Medium formatter, not a reimplementation.
// Native iOS glyph widths/ellipsis are NOT measured. All records are synthetic.
process.env.TZ='Asia/Tokyo';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.dirname(__dirname),source=fs.readFileSync(process.argv[2]||path.join(root,'main.js'),'utf8');
const baseHash={large:'719b5d6fa41c552dfe664f0ff4c14d9841380a6f46d4f51f5e9d502b2945d608',medium:'a2c460727ceaf07f58f27b98f19f551ab28875a36b254d8c02ff36bee39f1abe',loader:'2806858b80e5333b740e2d5caea44c7bb8aa66791defb24f40fa2cb40d4d359a'};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const prefixEnd=source.indexOf('const fetchedAt=new Date(RUN_NOW);');
assert.ok(prefixEnd>0,'real function prefix not found');
function apiAt(iso){
  const now=Date.parse(iso);
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  class Color{constructor(hex,alpha){this.hex=hex;this.alpha=alpha;}static dynamic(light){return light;}}
  const prefix=source.slice(0,prefixEnd);
  return new vm.Script('(function(){\n'+prefix+'\nconst STATUS_NOW=new Date();\nreturn {mediumDeadlineTitle,compact:typeof mediumSessionDeadlineTitle===\"function\"?mediumSessionDeadlineTitle:null};})()').runInNewContext({Date:Clock,Color});
}
const upcoming=apiAt('2030-10-09T12:00:00+09:00'),elapsed=apiAt('2030-10-09T17:00:00+09:00');
const due=new Date('2030-10-09T16:00:00+09:00');
const item=(title,hasTime=true)=>Object.freeze({title,rawTitle:title,date:due,hasTime,allDay:!hasTime});
const results=[];
function test(name,fn){try{fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:String(error)});}}
const observed='猟銃等初心者講習：受講申込期限（11/12回）';
const observedShort='11/12回 申込〆 猟銃等初心者講習';
test('Observed template keeps session, application and full course name',()=>assert.equal(upcoming.mediumDeadlineTitle(item(observed)),observedShort));
test('Elapsed marker precedes the session and cannot be cut off by a long name',()=>assert.equal(elapsed.mediumDeadlineTitle(item(observed)),'【締切経過】'+observedShort));
test('No invented hour on all-day entry',()=>assert.equal(elapsed.mediumDeadlineTitle(item(observed,false)),observedShort));
test('Input deadline time and original title are not mutated',()=>{
  const record=item(observed),original=JSON.stringify(record);upcoming.mediumDeadlineTitle(record);elapsed.mediumDeadlineTitle(record);
  assert.equal(JSON.stringify(record),original);assert.equal(record.date.toISOString(),'2030-10-09T07:00:00.000Z');
});
for(const [session,expected] of [
  ['1/2回','1/2回'],['01/02回','01/02回'],['11/12回','11/12回'],['12/31回','12/31回'],
  ['2/29回','2/29回'],['2032/2/29回','2032/2/29回'],['2031/11/12回','2031/11/12回'],
  ['1月2日回','1月2日回'],['11月12日回','11月12日回'],['2032年2月29日回','2032年2月29日回']
])test('Keep date token without year inference: '+session,()=>{
  const value='合成講習：受講申込期限（'+session+'）';
  assert.equal(upcoming.mediumDeadlineTitle(item(value)),expected+' 申込〆 合成講習');
});
for(const prefix of ['【条件付き】','【延期】','【初心者のみ】','【条件付き】【要確認】'])test('Leading qualifier remains first: '+prefix,()=>{
  assert.equal(upcoming.mediumDeadlineTitle(item(prefix+observed)),prefix+observedShort);
  assert.equal(elapsed.mediumDeadlineTitle(item(prefix+observed)),'【締切経過】'+prefix+observedShort);
});
for(const course of ['猟銃等初心者講習','猟銃等経験者講習','合成安全講習会','合成講座','合成研修','合成セミナー'])test('Do not collapse course categories: '+course,()=>{
  const r=upcoming.mediumDeadlineTitle(item(course+'：受講申込期限（11/12回）'));
  assert.equal(r,'11/12回 申込〆 '+course);
});
for(const brackets of [['(',')'],['（','）']])test('Matching parentheses '+brackets.join(''),()=>{
  assert.equal(upcoming.mediumDeadlineTitle(item('合成講習: 受講申込期限 '+brackets[0]+'11/12回'+brackets[1])),'11/12回 申込〆 合成講習');
});
for(const value of [
  '合成提出期限','合成申込期限 11/12','合成講習：受講申込期限（11/12）',
  '合成講習：受講申込期限（11/12回・11/13回）','合成講習：受講申込期限（11/12～11/13回）',
  '合成講習：受講申込期限（11/12回） 必着','合成講習：受講申込期限（11/12回） ※窓口のみ',
  '合成講習：受講申込期限（11/12回）（12/1回）','合成講習：受講申込期限（11/12回）｜返金不可',
  '合成講習：受講申込期限（11/12回 延期）','合成講習：受講申込期限（第3回）',
  '合成講習：受講申込期限（13/12回）','合成講習：受講申込期限（11/31回）',
  '合成講習：受講申込期限（2027/2/29回）','合成講習：受講申込期限（0000/2/29回）',
  '合成講習：受講申込期限（0/1回）','合成講習：受講申込期限（1/0回）',
  '合成講習：受講申込期限（１１/１２回）','合成講習：受講申込期限（2027-11-12回）',
  '合成講習：受講申込期限（11/12回)','合成講習：受講申込期限(11/12回）',
  '合成講習（条件あり）：受講申込期限（11/12回）','【条件付き 合成講習：受講申込期限（11/12回）',
  '合成講習：申込不要（11/12回）','合成試験：受験申込期限（11/12回）',
  '合成講習：受講申込期限（11/12回必着）'
])test('Uncertain/other format keeps original: '+value,()=>{
  assert.equal(upcoming.mediumDeadlineTitle(item(value)),'【締切】'+value);
  assert.equal(elapsed.mediumDeadlineTitle(item(value)),'【締切経過】'+value);
  assert.equal(upcoming.mediumDeadlineTitle(item(value,false)),value);
});
test('Long names keep session/action first without manually dropping name text',()=>{
  const course='専門区分'.repeat(30)+'初心者講習',title=course+'：受講申込期限（2031/11/12回）';
  const r=upcoming.mediumDeadlineTitle(item(title));
  assert.equal(r,'2031/11/12回 申込〆 '+course);assert.ok(!r.includes('…'));
});
test('No deadline date is mistaken for the explicitly labeled session date',()=>{
  const r=upcoming.mediumDeadlineTitle(item(observed));assert.ok(r.startsWith('11/12回'));assert.ok(!r.includes('10/9回'));
});
test('No new clock/status data is invented for a record without an explicit timed flag',()=>{
  assert.equal(elapsed.mediumDeadlineTitle(Object.freeze({title:observed,date:due})),observedShort);
});
test('Malformed session parser values fail closed',()=>{
  assert.ok(upcoming.compact);for(const value of [null,undefined,0,{},[]])assert.equal(upcoming.compact(value),null);
});
test('Large renderer is byte-identical to v1.79',()=>assert.equal(sha(source.slice(source.indexOf('// LARGE'))),baseHash.large));
test('Medium renderer including width/height/date/time/footer route unchanged',()=>assert.equal(sha(source.slice(source.indexOf('// MEDIUM'),source.indexOf('// LARGE'))),baseHash.medium));
test('Loader is unchanged',()=>assert.equal(sha(fs.readFileSync(path.join(root,'loader.js'))),baseHash.loader));
const failed=results.filter(r=>r.status==='FAIL');
for(const result of results)console.log(result.status+' '+result.name+(result.error?'\n'+result.error:''));
console.log(JSON.stringify({suite:'medium-deadline-title',passed:results.length-failed.length,failed:failed.length,total:results.length,limits:'Pure formatter + renderer hashes; not native iOS text measurement'}));
if(failed.length)process.exitCode=1;
