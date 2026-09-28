'use strict';
// Offline regression tests for the real Scriptable sources. No weather forecasts or
// Calendar records are read online. The mock records UI trees; it does NOT emulate
// iOS text shaping, truncation, widget refresh timing, permissions or device memory.
// Run: TZ=Asia/Tokyo node regression.cjs [path/to/main.js] [path/to/loader.js]
process.env.TZ = 'Asia/Tokyo';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = __dirname;
const sourceRoot = fs.existsSync(path.join(root, 'main.js')) ? root : path.dirname(root);
const mainPath = path.resolve(process.argv[2] || path.join(sourceRoot, 'main.js'));
const loaderPath = path.resolve(process.argv[3] || path.join(sourceRoot, 'loader.js'));
const source = fs.readFileSync(mainPath, 'utf8');
const loader = fs.readFileSync(loaderPath, 'utf8');
const baselinePath = path.join(root, 'main.v171.js');
const old = fs.existsSync(baselinePath) ? fs.readFileSync(baselinePath, 'utf8') : null;
const NOW = Date.parse('2030-01-30T12:00:00+09:00');
const CACHE = '/documents/ore-dashboard-loader/main.lastgood.js';
const results = [];
const plain = x => JSON.parse(JSON.stringify(x));
const gitHash = s => crypto.createHash('sha1').update('blob ' + Buffer.byteLength(s) + '\0').update(s).digest('hex');
const dateKey = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const shifted = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
function weatherJSON(now=NOW) {
  const date=new Date(now);
  return {
    latitude:35.68,longitude:139.76,utc_offset_seconds:32400,
    current:{time:dateKey(date)+'T'+String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0'),interval:900,
      temperature_2m:22.4,weather_code:3,is_day:1,precipitation:0,rain:0,showers:0,snowfall:0},
    daily:{time:Array.from({length:7},(_,i)=>dateKey(shifted(date,i))),
      weather_code:[61,63,3,2,0,71,95],temperature_2m_max:[23,22,24,25,26,27,28],
      temperature_2m_min:[19,18,17,16,15,14,13],precipitation_probability_max:[92,60,50,30,10,60,70]}
  };
}
function fixtures(now=NOW) {
  const day=new Date(now);day.setHours(0,0,0,0);
  function event(title,offset,hour,allDay=false) {
    const start=shifted(day,offset); start.setHours(hour,0,0,0);
    return {title,notes:'',calendar:{title:'Test Calendar'},startDate:start,
      endDate:new Date(+start+(allDay?86400000:3600000)),isAllDay:allDay};
  }
  return [event('Schedule all day',0,0,true),event('Schedule today',0,19),
    event('Schedule one',1,14),event('Schedule two',2,15),event('UFC 999 test',3,9),
    event('PRIME VIDEO BOXING 999',4,10),event('Schedule overflow',5,10),
    event('テスト提出期限A',2,0,true),event('テスト申込期限B',5,0,true),
    event('【中止】Schedule cancelled',0,18),event('Schedule ended',0,8)];
}
function env(opts={}) {
  const now=opts.now??NOW;
  const record={widgets:[],published:[],presented:[],complete:0,logs:[],requests:[],writes:[],calendarWrites:0};
  const data=opts.data === undefined ? weatherJSON(now) : opts.data;
  const events=opts.events===undefined ? fixtures(now) : opts.events;
  class Clock extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return now;} }
  class Color { constructor(hex,alpha=1){this.hex=hex;this.alpha=alpha;} static dynamic(light,dark){return opts.dark?dark:light;} }
  class Size { constructor(width,height){this.width=width;this.height=height;} }
  class Rect { constructor(x,y,width,height){Object.assign(this,{x,y,width,height});} }
  class Node {
    constructor(kind){this.kind=kind;this.children=[];}
    addStack(){const n=new Node('stack');this.children.push(n);return n;}
    addText(text){assert.equal(typeof text,'string');const n=new Node('text');n.text=text;this.children.push(n);return n;}
    addImage(image){const n=new Node('image');n.image=image;this.children.push(n);return n;}
    addDate(date){assert.ok(Number.isFinite(+date));const n=new Node('date');n.date=new Date(+date).toISOString();this.children.push(n);return n;}
    addSpacer(length){const n=new Node('spacer');n.length=length??null;this.children.push(n);return n;}
    setPadding(...values){assert.ok(values.every(x=>Number.isFinite(x)&&x>=0));this.padding=values;}
    layoutVertically(){this.layout='vertical';}
    layoutHorizontally(){this.layout='horizontal';}
    centerAlignContent(){this.align='center';}
    topAlignContent(){this.align='top';}
    bottomAlignContent(){this.align='bottom';}
    applyRelativeStyle(){this.dateStyle='relative';}
    applyFittingContentMode(){this.fitting=true;}
  }
  class ListWidget extends Node {
    constructor(){super('widget');record.widgets.push(this);}
    async presentLarge(){record.presented.push({family:'large',widget:this});}
    async presentMedium(){record.presented.push({family:'medium',widget:this});}
  }
  const Font={};
  for(const name of ['systemFont','mediumSystemFont','semiboldSystemFont','boldSystemFont'])
    Font[name]=size=>({name,size});
  class DateFormatter {
    string(d){d=new Date(+d);switch(this.dateFormat){
      case 'HH:mm':return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
      case 'M/d':return (d.getMonth()+1)+'/'+d.getDate();
      case 'M月d日 EEE':return (d.getMonth()+1)+'月'+d.getDate()+'日 '+['日','月','火','水','木','金','土'][d.getDay()];
      default:throw new Error('Unsupported format '+this.dateFormat);
    }}
  }
  class Request {
    constructor(url){this.url=url;record.requests.push(url);}
    async loadJSON(){if(opts.weatherError)throw new Error('Mock weather unavailable');return plain(data);}
    async loadString(){if(opts.remoteError)throw new Error('Mock remote unavailable');return opts.remoteCode??source;}
  }
  class DrawContext {
    setFont(){} setTextColor(){} setTextAlignedCenter(){} drawTextInRect(text){this.text=text;}
    getImage(){if(opts.drawError)throw new Error('Mock draw failure');return {emoji:this.text};}
  }
  const files=opts.files??new Map();
  if(opts.cache!==undefined)files.set(CACHE,opts.cache);
  const dirs=new Set();
  const fm={documentsDirectory:()=>'/documents',joinPath:(a,b)=>a+'/'+b,
    fileExists:p=>files.has(p)||dirs.has(p),createDirectory:p=>dirs.add(p),
    readString:p=>{if(!files.has(p))throw new Error('Missing mock file');return files.get(p);},
    writeString:(p,s)=>{if(opts.cacheWriteError)throw new Error('Mock storage full');files.set(p,s);record.writes.push(p);}};
  const mock={Date:Clock,Color,Size,Rect,ListWidget,Font,DateFormatter,Request,DrawContext,
    Device:{screenSize:()=>({width:opts.screenWidth||393,height:852})},
    SFSymbol:{named:name=>opts.missingSymbols?.includes(name)?null:({image:{symbol:name},applyFont(){}})},
    Location:{setAccuracyToThreeKilometers(){},current:async()=>{if(opts.locationError)throw new Error('Denied');return {latitude:35.68,longitude:139.76};},
      reverseGeocode:async()=>[{locality:'テスト市'}]},
    CalendarEvent:{today:async()=>{if(opts.todayError)throw new Error('Denied');return events.filter(e=>+e.startDate<=now && dateKey(e.endDate)>=dateKey(new Date(now)) || dateKey(e.startDate)===dateKey(new Date(now)));},
      between:async(start,end)=>{
        const deadlineSearch=new Date(+start).getDate()===new Date(now).getDate();
        if(opts.calendarError||(deadlineSearch?opts.deadlineError:opts.futureError))throw new Error('Denied');
        return events.filter(e=>+e.startDate>=+start&&+e.startDate<+end);
      }},
    Script:{setWidget:w=>{record.published.push(w);},complete:()=>{record.complete++;}},
    FileManager:{local:()=>fm},URLScheme:{forRunningScript:()=> 'scriptable:///run/test'},
    config:{runsInWidget:opts.preview!==true,widgetFamily:opts.family||'large'},
    args:{queryParameters:{family:opts.family||'large'}},
    ORE_DASH_CONFIG:{cfg:{fallbackCity:'予備テスト市',fallbackLat:35.68,fallbackLon:139.76,...opts.cfg}},
    console:{log:(...x)=>record.logs.push(x.join(' ')),warn:(...x)=>record.logs.push(x.join(' '))}
  };
  if(opts.runtime!==null)mock.ORE_DASH_RUNTIME=opts.runtime??{loaderVersion:'1.3',codeSource:'network'};
  return {context:vm.createContext(mock),record,files};
}
async function run(code=source,opts={}){
  const e=env(opts);
  await new vm.Script('(async function(){\n'+code+'\n})()', {filename:'scriptable-under-test.js'}).runInContext(e.context,{timeout:2000});
  e.widget=e.record.published.at(-1)||e.record.presented.at(-1)?.widget;
  return e;
}
async function funcs(code=source,opts={}){
  const prefix=code.slice(0,code.indexOf('const fetchedAt=new Date(RUN_NOW);'));
  const e=env(opts);
  e.api=await new vm.Script('(async function(){\n'+prefix+'\nreturn {currentWeatherInfo,weatherInfo,getWeather,weatherTimestamp,forecastGrid,isInactiveTitle,isDeadlineEvent,safeSoccerTitle,calendarURL,weatherCodeOrNull,temperatureOrNull,precipitationProbabilityOrNull,precipitationAmountOrNull,coordinateOrNull};})()').runInContext(e.context);
  return e;
}
function nodes(root,kind){return [root,...root.children.flatMap(c=>nodes(c))].filter(n=>!kind||n.kind===kind);}
const texts=w=>nodes(w,'text').map(n=>n.text);
const card=(w,title)=>nodes(w,'stack').find(n=>n.children[0]?.kind==='stack'&&n.children[0].children.some(x=>x.text===title));
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',message:e.stack});}}
async function main(){
  await test('Source syntax: real main + loader as async Scriptable bodies',()=>{
    const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
    new AsyncFunction(source);new AsyncFunction(loader);
  });
  if(old){
    await test('Baseline bytes match previously fetched GitHub SHA',()=>assert.equal(gitHash(old),'729fa3e94bfa1f1e272189d3a22c29d046cb0349'));
    await test('REPRO: old source loses thunderstorm when snowfall is positive',async()=>{
      const {api}=await funcs(old);assert.equal(api.currentWeatherInfo({code:95,currentSnowfall:0.01})[0],'雪');
    });
    await test('REPRO: old Large omits fallback warning',async()=>{
      const r=await run(old,{runtime:{codeSource:'lastGood'}});assert.ok(!texts(r.widget).includes('前回コード'));
    });
  }
  const f=await funcs();
  const codes=[0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99];
  for(const code of codes)for(const isDay of [true,false]){
    await test('WMO '+code+' '+(isDay?'day':'night')+': preserve code across interval totals',()=>{
      const expected=plain(f.api.currentWeatherInfo({code,isDay}));
      for(const amount of [0,0.01,0.1,2,100,null,-1,NaN]){
        const actual=plain(f.api.currentWeatherInfo({code,isDay,currentPrecip:amount,currentSnowfall:amount,rain:100}));
        assert.deepEqual(actual,expected);assert.equal(actual[2],code);assert.equal(actual[3],'weather-code');
      }
      assert.equal(expected[0],f.api.weatherInfo(code)[0]);
      if(!isDay&&code===0)assert.equal(expected[1],'moon.stars.fill');
      if(!isDay&&[1,2].includes(code))assert.equal(expected[1],'cloud.moon.fill');
    });
  }
  for(const input of [undefined,null,{}, {code:null},{code:'61'}, {code:NaN},{code:Infinity},{code:777}]){
    await test('Missing/unsupported weather does not become fabricated rain: '+JSON.stringify(input),()=>{
      const r=f.api.currentWeatherInfo(input);assert.equal(r[0],'不明');assert.equal(r[1],'questionmark.circle.fill');
    });
  }
  for(const code of [0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99])
    await test('Weather parser accepts supported WMO '+code,()=>assert.equal(f.api.weatherCodeOrNull(code),code));
  for(const code of [-1,4,44,49,50,58,60,68,70,78,79,83,84,87,94,100,777,1.5,'61',NaN,Infinity,null,undefined])
    await test('Weather parser rejects unsupported WMO '+String(code),()=>assert.equal(f.api.weatherCodeOrNull(code),null));
  for(const [value,expected] of [[-100,-100],[70,70],[-100.1,null],[70.1,null],['22',null],[NaN,null],[Infinity,null]])
    await test('Temperature bounds '+String(value),()=>assert.equal(f.api.temperatureOrNull(value),expected));
  for(const [value,expected] of [[0,0],[100,100],[-0.1,null],[100.1,null],['92',null],[NaN,null],[Infinity,null]])
    await test('Precipitation probability bounds '+String(value),()=>assert.equal(f.api.precipitationProbabilityOrNull(value),expected));
  for(const [value,expected] of [[0,0],[1000,1000],[-0.1,null],[1000.1,null],['1',null],[NaN,null],[Infinity,null]])
    await test('Precipitation amount bounds '+String(value),()=>assert.equal(f.api.precipitationAmountOrNull(value),expected));
  for(const [value,min,max,expected] of [[-90,-90,90,-90],[90,-90,90,90],[-90.1,-90,90,null],[180,-180,180,180],[180.1,-180,180,null]])
    await test('Coordinate bounds '+String(value),()=>assert.equal(f.api.coordinateOrNull(value,min,max),expected));
  await test('Invalid current WMO code fails live weather instead of rendering unknown as current',async()=>{
    const j=weatherJSON();j.current.weather_code=777;const r=await run(source,{data:j,family:'large'});assert.ok(texts(r.widget).includes('天気を取得できません'));
  });
  await test('Invalid current temperature fails live weather',async()=>{
    const j=weatherJSON();j.current.temperature_2m=99;const r=await run(source,{data:j,family:'large'});assert.ok(texts(r.widget).includes('天気を取得できません'));
  });
  await test('Invalid daily probability becomes partial, never 101 percent',async()=>{
    const j=weatherJSON();j.daily.precipitation_probability_max[0]=101;const r=await run(source,{data:j,family:'large'});const tt=texts(r.widget);
    assert.ok(!tt.includes('今日降水101%'));assert.ok(tt.includes('今日降水不明')||tt.includes('一部未取得'));
  });
  await test('Inverted daily high/low becomes partial instead of publishing impossible pair',async()=>{
    const j=weatherJSON();j.daily.temperature_2m_max[0]=10;j.daily.temperature_2m_min[0]=20;
    const r=await run(source,{data:j,family:'large'});const tt=texts(r.widget);assert.ok(!tt.includes('10/20'));
  });
  const timestampCases=[
    ['2030-01-30T12:00',32400,'2030-01-30T03:00:00.000Z'],
    ['2030-01-30T12:00:00+09:00',0,'2030-01-30T03:00:00.000Z'],
    ['2030-01-30T03:00Z',null,'2030-01-30T03:00:00.000Z'],
    ['2030-02-30T12:00',32400,null],['2030-01-30T24:00',32400,null],['2030-01-30T12:60',32400,null],
    ['2030-01-30T12:00+14:01',0,null],['2030-01-30T12:00',null,null],['bad',32400,null]
  ];
  for(const [time,offset,expected] of timestampCases)await test('Timestamp validation '+time+' / '+offset,()=>{
    assert.equal(f.api.weatherTimestamp(time,offset)?.toISOString()??null,expected);
  });
  const weatherScenarios=[
    ['normal',{},null],
    ['weather request failure',{weatherError:true},'天気を取得できません'],
    ['stale 91 minutes',{data:(()=>{const j=weatherJSON();j.current.time='2030-01-30T10:29';return j;})()},'天気データ古い'],
    ['exactly 90 minutes',{data:(()=>{const j=weatherJSON();j.current.time='2030-01-30T10:30';return j;})()},null],
    ['unknown timestamp',{data:(()=>{const j=weatherJSON();j.current.time='bad';return j;})()},'天気時刻不明'],
    ['future timestamp',{data:(()=>{const j=weatherJSON();j.current.time='2030-01-30T12:16';return j;})()},'天気時刻不明'],
    ['missing temperature',{data:(()=>{const j=weatherJSON();j.current.temperature_2m=null;return j;})()},'天気を取得できません'],
    ['API error',{data:{error:true}},'天気を取得できません'],
    ['null response',{data:null},'天気を取得できません']
  ];
  for(const family of ['large','medium'])for(const [label,opts,warning] of weatherScenarios){
    await test(family+': '+label+' under full mock execution',async()=>{
      const r=await run(source,{...opts,family});const tt=texts(r.widget);
      assert.equal(r.record.published.length,1);assert.equal(r.record.complete,0);
      assert.equal(r.widget.url,'calshow:');assert.ok(Number.isFinite(+r.widget.refreshAfterDate));
      if(warning)assert.ok(tt.includes(warning),warning+' not found');
      if(family==='large'&&warning){assert.ok(!tt.includes('週間天気'));assert.ok(!tt.includes('くもり'));}
      assert.ok(tt.includes('Schedule all day'));assert.ok(!tt.includes('Schedule ended'));assert.ok(!tt.includes('【中止】Schedule cancelled'));
    });
  }
  for(const dark of [false,true])for(const runtime of [{codeSource:'network'},{codeSource:'lastGood'},null,{}]){
    await test('Large source warning, '+(dark?'dark':'light')+', '+JSON.stringify(runtime),async()=>{
      const r=await run(source,{dark,runtime});const tt=texts(r.widget);
      const label=runtime?.codeSource==='lastGood'?'前回コード':runtime?.codeSource==='network'?'':'取得元不明';
      assert.equal(tt.includes('前回コード'),label==='前回コード');assert.equal(tt.includes('取得元不明'),label==='取得元不明');
      if(label){const n=nodes(r.widget,'text').find(x=>x.text===label);assert.equal(n.lineLimit,1);assert.equal(n.minimumScaleFactor,1);assert.equal(n.textColor.hex,dark?'#FF9F0A':'#A64B00');}
      const sc=card(r.widget,'予定');assert.ok(sc);assert.ok(texts(sc).includes('Schedule today'));
    });
  }
  for(const failure of [{weatherError:true},{todayError:true},{futureError:true},{deadlineError:true},{locationError:true},{weatherError:true,todayError:true,futureError:true,deadlineError:true}]){
    await test('Fallback stays visible together with failures '+JSON.stringify(failure),async()=>{
      const r=await run(source,{...failure,runtime:{codeSource:'lastGood'}});const tt=texts(r.widget);
      assert.equal(tt.filter(t=>t==='前回コード').length,1);
      if(failure.todayError||failure.futureError)assert.ok(tt.includes('一部取得失敗'));
      if(failure.weatherError)assert.ok(tt.includes('天気を取得できません'));
    });
  }
  if(old){
    for(const family of ['large','medium'])for(const dark of [false,true])await test('Normal UI tree equals v1.71: '+family+' '+(dark?'dark':'light'),async()=>{
      const a=await run(old,{family,dark});const b=await run(source,{family,dark});assert.deepEqual(plain(b.widget),plain(a.widget));
    });
    await test('Medium render, header, cards, calendar + weather fetch unchanged byte-for-byte',()=>{
      assert.equal(source.slice(source.indexOf('// MEDIUM'),source.indexOf('// LARGE')),old.slice(old.indexOf('// MEDIUM'),old.indexOf('// LARGE')));
      assert.equal(source.slice(source.indexOf('// DEADLINES:')),old.slice(old.indexOf('// DEADLINES:')));
      assert.equal(source.slice(source.indexOf('async function getWeather'),source.indexOf('function weatherInfo')),old.slice(old.indexOf('async function getWeather'),old.indexOf('function weatherInfo')));
    });
  }
  for(const family of ['large','medium'])await test('Preview route '+family,async()=>{
    const r=await run(source,{family,preview:true});assert.equal(r.record.published.length,0);assert.equal(r.record.presented[0].family,family);
  });
  await test('Large: 6 schedules, 2 deadlines, 6 days retained',async()=>{
    const r=await run();const a=texts(card(r.widget,'予定'));const d=texts(card(r.widget,'重要期限'));const w=card(r.widget,'週間天気');
    assert.equal(a.filter(t=>/^Schedule |^UFC |^PRIME /.test(t)).length,6);
    assert.equal(d.filter(t=>/テスト.*期限/.test(t)).length,2);assert.equal(nodes(w,'image').length,6);
    assert.ok(texts(w).includes('今日降水92%'));
  });
  await test('Medium compact: budget remains bounded',async()=>{
    const r=await run(source,{family:'medium',screenWidth:320});
    // 4 top + 44 header + 2 gap + (8 padding + 4*15 rows + 3 divider + 15 deadline) + 5 bottom.
    const expected=4+44+2+(8+4*15+3+15)+5;
    assert.equal(expected,141);assert.ok(r.record.logs.some(s=>s.includes('budget='+expected+'pt')));
  });
  await test('Empty Calendar produces empty states, not fake schedules',async()=>{
    const r=await run(source,{events:[]});const tt=texts(r.widget);assert.ok(tt.includes('直近の予定なし'));assert.ok(tt.includes('30日以内の重要期限なし'));
  });
  await test('Long deadlines retained in 2-line UI nodes',async()=>{
    const events=fixtures();for(const e of events)if(e.title.includes('期限'))e.title+=' 検証用の長いタイトル'.repeat(4);
    const r=await run(source,{events});const ns=nodes(card(r.widget,'重要期限'),'text').filter(n=>n.text.includes('検証用'));
    assert.equal(ns.length,2);assert.ok(ns.every(n=>n.lineLimit===2)); // No assertion of iOS rendered height.
  });
  await test('Weekly missing field shows warning rather than six invented forecasts',async()=>{
    const data=weatherJSON();data.daily.weather_code[5]=null;
    const r=await run(source,{data});const w=card(r.widget,'週間天気');assert.ok(texts(w).includes('一部未取得'));assert.equal(nodes(w,'image').length,0);
  });
  await test('Day/month rollover selects matching forecast dates',async()=>{
    const r=await run(source,{now:Date.parse('2030-01-31T23:59:00+09:00')});const tt=texts(card(r.widget,'週間天気'));
    assert.ok(tt.includes('1金'));assert.ok(tt.includes('今日'));assert.ok(!tt.includes('31木'));
  });
  await test('Icon drawing failure falls back without crashing',async()=>{
    const r=await run(source,{drawError:true});assert.ok(nodes(r.widget,'image').some(n=>n.image.symbol==='figure.boxing'));
  });
  await test('Unsafe Calendar URL cannot replace Calendar route',async()=>{
    const r=await run(source,{cfg:{calendarOpenURL:'javascript:alert(1)'}});assert.equal(r.widget.url,'calshow:');
  });
  const loaderScenarios=[
    ['network success',{cache:'keep'},false,null],
    ['remote offline / valid new cache',{remoteError:true,cache:source},true,null],
    ['remote malformed / valid new cache',{remoteCode:'{broken',cache:source},true,null],
    ['remote runtime error / valid new cache',{remoteCode:'throw new Error("mock remote runtime");',cache:source},true,null],
    ['offline code + unavailable weather',{remoteError:true,weatherError:true,cache:source},true,'天気を取得できません'],
    ['first offline launch',{remoteError:true},false,'初回取得に失敗'],
    ['invalid cached code',{remoteError:true,cache:'const VERSION = "1.72-github"; {'},false,'ダッシュボード起動失敗'],
    ['unsupported old cache',{remoteError:true,cache:'const VERSION = "1.49-github";'},false,'最新版を取得できません'],
    ['cache write failure does not discard successful render',{cacheWriteError:true,cache:'keep'},false,null]
  ];
  for(const [label,opts,fallback,warning] of loaderScenarios)await test('Repo loader v1.3: '+label,async()=>{
    const r=await run(loader,opts);assert.ok(r.widget);assert.equal(r.record.complete,1);const tt=texts(r.widget);
    if(fallback)assert.ok(tt.includes('前回コード'));
    if(warning)assert.ok(tt.includes(warning));
    if(opts.cacheWriteError)assert.equal(r.files.get(CACHE),'keep');
    if(!opts.remoteError&&!opts.remoteCode&&!opts.cacheWriteError)assert.equal(r.files.get(CACHE),source);
    assert.equal(r.record.calendarWrites,0);
  });
  await test('Loader recovers from offline cache to network on next invocation',async()=>{
    const files=new Map([[CACHE,source]]);
    const a=await run(loader,{remoteError:true,files});assert.ok(texts(a.widget).includes('前回コード'));
    const b=await run(loader,{files});assert.ok(!texts(b.widget).includes('前回コード'));assert.equal(b.context.ORE_DASH_RUNTIME.codeSource,'network');
  });
  const failed=results.filter(r=>r.status==='FAIL');
  const report={source:mainPath,mainBlob:gitHash(source),loaderBlob:gitHash(loader),environment:process.version,
    passed:results.length-failed.length,failed:failed.length,total:results.length,
    limits:['Offline mocks only, not real iOS rendering or field weather accuracy.',
      'Old cached renderers do not gain this patch until a successful new-code fetch.',
      'Installed iPhone loader version is not established by testing the repository loader.'],results};
  fs.writeFileSync(path.join(root,'test-results.json'),JSON.stringify(report,null,2));
  for(const r of results)console.log(r.status+' '+r.name+(r.message?'\n'+r.message:''));
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,total:report.total,mainBlob:report.mainBlob}));
  if(failed.length)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
