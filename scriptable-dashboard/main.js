// 俺専用ダッシュボード v1.50-github
// Remote main for Scriptable loader.
// IMPORTANT: Script.complete() は loader 側で呼ぶ。

const VERSION = "1.50-github";

const USER = globalThis.ORE_DASH_CONFIG || {};
const RUN_NOW = new Date();

const CFG = Object.assign({
  fallbackCity:"現在地",
  fallbackLat:35.6812,
  fallbackLon:139.7671,
  maxEvents:6,
  deadlineLookAheadDays:180,
  deadlineDisplayDays:30,
  deadlineMaxItems:4,
  anniversaryMonth:null,
  anniversaryDay:null,
  refreshMinutes:15,
  previewFamily:"medium",
  calendarOpenURL:"calshow:"
}, USER.cfg || {});

const DEADLINE_KEYWORDS = ["締切","〆切","期限","払込期限","納入期限","提出期限","申込期限","申請期限","回答期限","最終日","必着"];

const C = {
  bg:Color.dynamic(new Color("#F2F2F7"),new Color("#0B0B0D")),
  text:Color.dynamic(new Color("#1D1D1F"),new Color("#F5F5F7")),
  sub:Color.dynamic(new Color("#6E6E73"),new Color("#A1A1AA")),
  blue:Color.dynamic(new Color("#0066CC"),new Color("#0A84FF")),
  green:Color.dynamic(new Color("#34C759"),new Color("#30D158")),
  orange:Color.dynamic(new Color("#A64B00"),new Color("#FF9F0A")),
  red:Color.dynamic(new Color("#C62828"),new Color("#FF453A")),
  purple:Color.dynamic(new Color("#7C3AED"),new Color("#BF5AF2")),
  gray:Color.dynamic(new Color("#8E8E93"),new Color("#8E8E93")),
  separator:Color.dynamic(new Color("#D1D1D6",0.75),new Color("#38383A",0.9)),
  card:Color.dynamic(new Color("#FFFFFF",0.98),new Color("#1C1C1E",0.98)),
  weakCard:Color.dynamic(new Color("#FFFFFF",0.96),new Color("#1C1C1E",0.96))
};

function icon(stack,name,color,size=12){const sf=SFSymbol.named(name)||SFSymbol.named("questionmark.circle");sf.applyFont(Font.systemFont(size));const i=stack.addImage(sf.image);i.imageSize=new Size(size,size);i.tintColor=color;return i;}
function normalize(v){return v?String(v).replace(/\s+/g," ").trim():"";}
function shorten(v,n){
  v=normalize(v);
  const parts=typeof Intl!=="undefined"&&Intl.Segmenter
    ?Array.from(new Intl.Segmenter("ja",{granularity:"grapheme"}).segment(v),x=>x.segment):Array.from(v);
  return parts.length<=n?v:parts.slice(0,Math.max(0,n-1)).join("")+"…";
}
function any(text,keys){text=normalize(text);return keys.some(k=>text.includes(k));}
function fmtTime(d,allDay=false){if(allDay)return "終日";const f=new DateFormatter();f.dateFormat="HH:mm";return f.string(d);}
function fmtDate(d){const f=new DateFormatter();f.locale="ja_JP";f.dateFormat="M/d";return f.string(d);}
function forecastDayLabel(iso){
  const d=parseISODate(iso);
  return d?d.getDate()+["日","月","火","水","木","金","土"][d.getDay()]:"--";
}
function todayText(){const f=new DateFormatter();f.locale="ja_JP";f.dateFormat="M月d日 EEE";return f.string(RUN_NOW);}
function dayStart(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function sameCalendarDay(a,b){return !!a&&!!b&&dayStart(a).getTime()===dayStart(b).getTime();}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function daysBetween(a,b){return Math.round((dayStart(b)-dayStart(a))/86400000);}
function relativeDay(d){const n=daysBetween(RUN_NOW,d);if(n<0)return Math.abs(n)+"日超過";if(n===0)return "今日";if(n===1)return "明日";return "あと"+n+"日";}
function realEventEnd(e){const d=new Date(e.endDate);if(e.isAllDay)d.setMilliseconds(d.getMilliseconds()-1);return d;}
function calName(x){return x.calendar&&x.calendar.title?normalize(x.calendar.title):"";}
function mkCard(p){const c=p.addStack();c.layoutVertically();c.backgroundColor=C.card;c.cornerRadius=14;c.setPadding(10,11,10,11);return c;}
function section(p,symbol,title,color){const r=p.addStack();r.centerAlignContent();icon(r,symbol,color,12);r.addSpacer(5);const t=r.addText(title);t.font=Font.boldSystemFont(12);t.textColor=C.text;return r;}

async function getPosition(){
  try{
    Location.setAccuracyToThreeKilometers();
    const loc=await Location.current();
    let city=CFG.fallbackCity;
    try{const p=await Location.reverseGeocode(loc.latitude,loc.longitude,"ja_JP");if(p&&p[0])city=p[0].locality||p[0].subLocality||city;}catch(_){}
    return {ok:true,city,lat:loc.latitude,lon:loc.longitude};
  }catch(_){return {ok:false,city:CFG.fallbackCity,lat:CFG.fallbackLat,lon:CFG.fallbackLon};}
}

async function getWeather(pos){
  const missing={ok:false,partial:true,temp:null,code:-1,isDay:null,max:null,min:null,rain:null,daily:[]};
  try{
    const u="https://api.open-meteo.com/v1/forecast?latitude="+pos.lat+"&longitude="+pos.lon+"&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4";
    const r=new Request(u);r.timeoutInterval=10;const j=await r.loadJSON();
    if(!j||j.error||!j.current)return missing;
    const d=j.daily||{};
    const read=(key,i)=>Array.isArray(d[key])?d[key][i]:null;
    const daily=(Array.isArray(d.time)?d.time:[]).map((date,i)=>({
      date,code:numberOrNull(read("weather_code",i)),max:roundedOrNull(read("temperature_2m_max",i)),
      min:roundedOrNull(read("temperature_2m_min",i)),rain:roundedOrNull(read("precipitation_probability_max",i))
    })).filter(day=>parseISODate(day.date));
    const temp=roundedOrNull(j.current.temperature_2m),code=numberOrNull(j.current.weather_code);
    const isDay=j.current.is_day===0?false:j.current.is_day===1?true:null;
    const first=daily[0]||{};
    const partial=daily.length<4||isDay===null||daily.some(day=>[day.code,day.max,day.min,day.rain].some(x=>x===null));
    return {ok:temp!==null&&code!==null,partial,temp,code:code===null?-1:code,isDay,
      max:first.max??null,min:first.min??null,rain:first.rain??null,daily,
      localDate:parseISODate(String(j.current.time||"").slice(0,10))?String(j.current.time).slice(0,10):isoDay(RUN_NOW)};
  }catch(_){return missing;}
}

function weatherInfo(code){
  if(code===0)return ["快晴","sun.max.fill"];
  if([1,2].includes(code))return ["晴れ","cloud.sun.fill"];
  if(code===3)return ["くもり","cloud.fill"];
  if([45,48].includes(code))return ["霧","cloud.fog.fill"];
  if([51,53,55,56,57].includes(code))return ["霧雨","cloud.drizzle.fill"];
  if([61,63,65,66,67,80,81,82].includes(code))return ["雨","cloud.rain.fill"];
  if([71,73,75,77,85,86].includes(code))return ["雪","cloud.snow.fill"];
  if([95,96,99].includes(code))return ["雷雨","cloud.bolt.rain.fill"];
  return ["不明","questionmark.circle.fill"];
}

async function getEvents(){
  try{
    const now=new Date(RUN_NOW);
    const list=await CalendarEvent.today();
    const seen=new Set();

    const all=list
      .filter(e=>!isHolidayCalendarTitle(calName(e)))
      .filter(e=>!isInactiveTitle(e.title))
      .filter(e=>!isDeadlineEvent(e))
      .filter(e=>isAllDayLikeEvent(e)||e.endDate>now)
      .sort((a,b)=>{
        const aa=isAllDayLikeEvent(a),bb=isAllDayLikeEvent(b);
        if(aa&&!bb)return -1;
        if(!aa&&bb)return 1;
        return a.startDate-b.startDate;
      })
      .filter(e=>{
        const key=normalize(e.title).toLowerCase()+"|"+new Date(e.startDate).getTime()+"|"+isAllDayLikeEvent(e);
        if(seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    return {ok:true,total:all.length,items:all.slice(0,CFG.maxEvents)};
  }catch(_){return {ok:false,total:0,items:[]};}
}

function isDeadlineText(text){
  return any(normalize(text),DEADLINE_KEYWORDS);
}

function cleanDeadlineTitle(title,date){
  let v=normalize(title);
  v=v.replace(/^放送大学\s*[|｜:：\-]*\s*/,"");
  if(date){
    const m=date.getMonth()+1,d=date.getDate();
    const patterns=[
      new RegExp(m+"\\/"+d+"\\s*"),
      new RegExp(m+"月"+d+"日\\s*")
    ];
    for(const p of patterns) v=v.replace(p,"");
  }
  return normalize(v)||"重要期限";
}

async function getImportantDeadlines(){
  const out={ok:false,items:[]};
  try{
    const now=new Date(RUN_NOW);
    const endSearch=addDays(now,CFG.deadlineLookAheadDays);
    const es=await CalendarEvent.between(dayStart(now),endSearch);
    out.ok=true;

    const seen=new Set();
    for(const e of es){
      const calendarTitle=calName(e);
      if(isHolidayCalendarTitle(calendarTitle)) continue;

      const title=normalize(e.title);
      if(!title || isInactiveTitle(title)) continue;

      // 説明欄に別日の「期限」が書かれていても、そのイベント自体を期限扱いしない。
      // 重要期限はイベント名が期限を明示しているものだけを採用する。
      if(!isDeadlineEvent(e)) continue;

      const date=new Date(e.startDate);
      const cleaned=cleanDeadlineTitle(title,date);
      const key=cleaned.toLowerCase()+"|"+date.getTime()+"|"+!!e.isAllDay;
      if(seen.has(key)) continue;
      seen.add(key);

      out.items.push({
        title:cleaned,
        rawTitle:title,
        date,
        color:C.red,
        source:calendarTitle||"カレンダー"
      });
    }

    out.items=out.items
      .filter(x=>x.date>=dayStart(now))
      .sort((a,b)=>a.date-b.date);

  }catch(_){out.ok=false;}

  return out;
}


function isHolidayCalendarTitle(title){
  const t=normalize(title).toLowerCase();
  return t.includes("祝日") || t.includes("holiday");
}

function isInactiveTitle(title){
  const t=normalize(title);
  // Explicit status markers also work after a calendar/category prefix.
  if(/[【\[](?:完了|中止|取消|キャンセル)[】\]]/.test(t))return true;
  return /(?:^|[|｜\s])(?:✅|☑️?|完了[：:\s]|中止[：:\s]|取消[：:\s]|キャンセル[：:\s])/u.test(t);
}

function stripLeadingSportEmoji(value){
  const cps=Array.from(normalize(value));
  const sports=new Set(["🥊","🥋","⚽"]);
  while(cps.length){
    const cp=cps[0];
    if(sports.has(cp) || cp==="\uFE0E" || cp==="\uFE0F" || cp==="\uFFFD"){
      cps.shift();
      continue;
    }
    break;
  }
  return cps.join("").trim();
}

function hasFlagEmoji(value){
  return Array.from(String(value||"")).some(ch=>{
    const cp=ch.codePointAt(0);
    return cp>=0x1F1E6 && cp<=0x1F1FF;
  });
}

function isCombatEvent(title,calendarTitle=""){
  if(isInactiveTitle(title)) return false;

  const clean=normalize(title);
  const first=Array.from(clean)[0]||"";
  if(first==="🥊" || first==="🥋") return true;

  const t=(clean+" "+normalize(calendarTitle)).toLowerCase();
  const patterns=[
    /(^|\s|[^a-z0-9])ufc([^a-z0-9]|$)/,
    /rizin/,
    /(^|\s|[^a-z0-9])mma([^a-z0-9]|$)/,
    /(^|\s|[^a-z0-9])pfl([^a-z0-9]|$)/,
    /bellator/,
    /one\s+(championship|samurai|fight\s*night)/,
    /k[- ]?1/,
    /knock\s*out/,
    /(^|\s|[^a-z0-9])rise\s*\d|rise\s+world\s+series/,
    /prime\s*video\s*boxing/,
    /boxing/,
    /ボクシング/,
    /格闘技/,
    /修斗/,
    /pancrase/,
    /deep\s*\d|deep\s*jewels/
  ];
  return patterns.some(r=>r.test(t));
}

function isSoccerEvent(title,calendarTitle="",notes=""){
  if(isInactiveTitle(title)) return false;

  const raw=normalize(title);
  const t=(raw+" "+normalize(calendarTitle)+" "+normalize(notes)).toLowerCase();

  if(t.includes("fotmob") || t.includes("fotmob.com")) return true;
  if(t.includes("⚽") || t.includes("サッカー") || t.includes("football") || t.includes("soccer")) return true;

  // 国代表は国名だけで判定せず、旗＋対戦区切りがある試合タイトルだけ拾う。
  if(hasFlagEmoji(raw) && /(\s-\s|\svs\.?\s|\sv\s)/i.test(raw)) return true;

  const known=[
    "manchester united","manchester city","liverpool","arsenal","chelsea","tottenham",
    "real madrid","atlético madrid","atletico madrid","barcelona","bayern","dortmund",
    "inter milan","ac milan","juventus","paris saint-germain","psg","augsburg"
  ];
  return known.some(k=>t.includes(k)) && /(\s-\s|\svs\.?\s|\sv\s)/i.test(raw);
}

function isAllDayLikeEvent(e){
  if(e.isAllDay) return true;

  const start=new Date(e.startDate);
  const end=new Date(e.endDate);
  const midnight=start.getHours()===0 && start.getMinutes()===0;
  const duration=end-start;

  return midnight && duration>=23*60*60*1000 && duration<=25*60*60*1000;
}

function upcomingPriority(item){
  if(item.source==="家族") return 0;
  if(item.source==="予定") return 1;
  return 2;
}

async function getUpcomingNext(ann){
  const now=new Date(RUN_NOW);
  const start=addDays(dayStart(now),1);
  const end=addDays(start,30);
  const out=[];
  let calendarOK=false;

  try{
    const es=await CalendarEvent.between(start,end);
    calendarOK=true;
    for(const e of es){
      const d=new Date(e.startDate);
      if(d<start || d>=end) continue;

      const calendarTitle=calName(e);
      if(isHolidayCalendarTitle(calendarTitle)) continue;

      const title=normalize(e.title);
      if(!title || isInactiveTitle(title)) continue;

      // Use the same classifier as the deadline list. Notes can mention another deadline.
      if(isDeadlineEvent(e)) continue;

      out.push({
        title,
        date:d,
        allDay:isAllDayLikeEvent(e),
        source:"予定",
        kind:"予定",
        color:C.blue,
        combat:isCombatEvent(title,calendarTitle),
        soccer:isSoccerEvent(title,calendarTitle,e.notes)
      });
    }
  }catch(_){calendarOK=false;}

  if(ann && ann.date>=start && ann.date<end){
    out.push({
      title:"結婚記念日",
      date:ann.date,
      allDay:true,
      source:"家族",
      kind:"予定",
      color:C.orange
    });
  }

  const seen=new Set();
  const items=out
    .sort((a,b)=>{
      const da=dayStart(a.date)-dayStart(b.date);
      if(da!==0) return da;
      const p=upcomingPriority(a)-upcomingPriority(b);
      if(p!==0) return p;
      return a.date-b.date;
    })
    .filter(x=>{
      // 同じ日に同名イベントが複数あっても、開始時刻が違えば別予定として残す。
      const k=normalize(x.title).toLowerCase()+"|"+x.date.getTime()+"|"+x.allDay;
      if(seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  return {ok:calendarOK,items};
}

function upcomingDayLabel(d){
  const n=daysBetween(new Date(),d);
  if(n===1) return "明日";
  return fmtDate(d);
}

function deadlineColor(date){
  const n=daysBetween(RUN_NOW,date);
  if(n<=3) return C.red;
  if(n<=7) return C.orange;
  return C.sub;
}

function compactUpcomingTitle(it){
  let v=stripLeadingSportEmoji(it.title)
    .replace(/[\uFE0E\uFE0F\uFFFD]/g,"")
    .trim();

  if(it.combat){
    v=v.split(/[|｜]/)[0].trim();

    const compactPatterns=[
      /^(PRIME VIDEO BOXING\s*\d+)/i,
      /^(RIZIN LANDMARK\s*\d+)/i,
      /^(RIZIN\.\d+)/i,
      /^(UFC\s*\d+)/i,
      /^(ONE SAMURAI\s*\d+)/i,
      /^(RISE\s*\d+)/i,
      /^(K-1 WORLD MAX\s*\d*\s*FINAL\d*)/i
    ];
    for(const p of compactPatterns){
      const m=v.match(p);
      if(m){v=m[1].trim();break;}
    }
  }

  if(it.soccer){
    // FotMob can append competition/status notes in parentheses.
    // The home widget only needs the fixture itself.
    v=v
      .replace(/\s*[（(][^）)]*[）)]\s*$/,"")
      .replace(/\s*[|｜].*$/,"")
      .trim();
  }

  return shorten(v,28);
}

function combatEmoji(it){
  const t=normalize(it.title).toLowerCase();
  if(t.includes("boxing") || t.includes("ボクシング") || t.includes("prime video boxing") || t.includes("pbc")) return "🥊";
  return "🥋";
}

function futureIconName(it){
  if(it.source==="家族" || normalize(it.title).includes("誕生日")) return "gift.fill";
  if(it.soccer) return "soccerball";
  return "calendar";
}

function futureIconColor(it){
  return C.sub;
}

function anniversary(){
  if(!CFG.anniversaryMonth || !CFG.anniversaryDay) return null;
  const n=new Date(RUN_NOW);let t=new Date(n.getFullYear(),CFG.anniversaryMonth-1,CFG.anniversaryDay);
  if(dayStart(t)<dayStart(n))t=new Date(n.getFullYear()+1,CFG.anniversaryMonth-1,CFG.anniversaryDay);
  return {date:t,days:daysBetween(n,t)};
}

// Shared audit fixes. No Calendar write APIs are used.
function numberOrNull(value){return typeof value==="number"&&Number.isFinite(value)?value:null;}
function roundedOrNull(value){const n=numberOrNull(value);return n===null?null:Math.round(n);}
function numberLabel(value){return numberOrNull(value)===null?"--":String(value);}
function parseISODate(value){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||""));
  if(!m)return null;
  const d=new Date(+m[1],+m[2]-1,+m[3]);
  return d.getFullYear()===+m[1]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3]?d:null;
}
function isoDay(date){return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");}
function timelineDay(date,now=RUN_NOW){
  const n=daysBetween(now,date);
  return n===0?"今日":n===1?"明日":fmtDate(date);
}
function isDeadlineEvent(e){return !!e&&!isInactiveTitle(e.title)&&isDeadlineText(e.title);}
function calendarURL(){
  // Opens Calendar; does not create/edit events. The native route needs device validation.
  const custom=String(CFG.calendarOpenURL||"").trim();
  return /^(calshow:|https:\/\/calendar\.google\.com\/)/i.test(custom)?custom:"calshow:";
}
function resolveFamily(){
  if(config.runsInWidget)return config.widgetFamily;
  const query=typeof args!=="undefined"&&args.queryParameters?args.queryParameters:{};
  const requested=String(query.family||CFG.previewFamily||"medium").toLowerCase();
  return requested==="large"?"large":"medium";
}
function currentWeatherInfo(code,isDay){
  const info=weatherInfo(code);
  if(isDay===false&&code===0)return [info[0],"moon.stars.fill"];
  if(isDay===false&&[1,2].includes(code))return [info[0],"cloud.moon.fill"];
  return info;
}
function forecastGrid(weather,now=RUN_NOW){
  const base=parseISODate(weather.localDate)||dayStart(now);
  return [1,2,3].map(offset=>{
    const date=isoDay(addDays(base,offset));
    return (weather.daily||[]).find(day=>day.date===date)||{date,code:null,max:null,min:null,rain:null};
  });
}
function nextRefresh(){
  const minutes=numberOrNull(CFG.refreshMinutes);
  return new Date(Math.min(Date.now()+Math.max(1,minutes===null?15:minutes)*60000,addDays(dayStart(new Date()),1).getTime()));
}

// A conservative 155pt content budget; 141pt compact mode omits only the redundant heading.
// These are design budgets, not a claim that Scriptable exposes the live widget frame.
function mediumMetrics(){
  let screenWidth=393;
  try{screenWidth=Math.min(Device.screenSize().width,Device.screenSize().height);}catch(_){}
  const compact=screenWidth<=320||CFG.mediumCompact===true;
  const width=screenWidth<=320?272:screenWidth<=375?301:screenWidth<=414?318:344;
  return {width,compact,top:6,bottom:8,header:46,gap:3,cardPad:5,
    heading:compact?0:14,headingGap:compact?0:1,row:16,divider:3,
    forecastWidth:146,dayWidth:32,timeWidth:38,iconWidth:14,columnGap:3};
}
function singleText(parent,value,font,color){
  const t=parent.addText(String(value));t.font=font;t.textColor=color;t.lineLimit=1;t.minimumScaleFactor=1;return t;
}
function fixedRow(parent,width,height){const row=parent.addStack();row.size=new Size(width,height);row.centerAlignContent();return row;}
function centeredRow(parent,width,height,draw){
  const row=fixedRow(parent,width,height);row.addSpacer();draw(row);row.addSpacer();return row;
}
function mediumState(events,future,deadlines,weather,position,runtime){
  const issues=[];
  if(!events.ok&&!future.ok)issues.push("予定未取得");
  else if(!events.ok||!future.ok)issues.push("予定一部未取得");
  if(!deadlines.ok)issues.push("期限未取得");
  if(!position.ok)issues.push("予備地点");
  if(!weather.ok)issues.push("天気未取得");
  else if(weather.partial)issues.push("予報一部未取得");
  if(runtime.codeSource==="lastGood")issues.push("前回コード");
  return {issues,label:issues.length>1?"一部未取得":(issues[0]||"")};
}

const fetchedAt=new Date(RUN_NOW);
const position=await getPosition();
const [W,eventsData,deadlineData]=await Promise.all([getWeather(position),getEvents(),getImportantDeadlines()]);
const ann=anniversary();
const upcomingData=await getUpcomingNext(ann);
const upcoming7=upcomingData.items;

const todaySchedule=eventsData.items.map(e=>{
  const calendarTitle=calName(e);
  return {
    title:normalize(e.title),
    date:new Date(e.startDate),
    allDay:isAllDayLikeEvent(e),
    source:"予定",
    kind:"予定",
    color:C.blue,
    today:true,
    combat:isCombatEvent(e.title,calendarTitle),
    soccer:isSoccerEvent(e.title,calendarTitle,e.notes)
  };
});

const allScheduleRows=[
  ...todaySchedule,
  ...upcoming7
];

// Home screen policy: show the next six things, not the size of the backlog.
const scheduleRows=allScheduleRows.slice(0,6);

// Deadlines only earn home-screen space when they are actionable soon.
// Far-future deadlines stay in Calendar and naturally surface as they approach.
const actionableDeadlines=deadlineData.items.filter(it=>{
  const days=daysBetween(RUN_NOW,it.date);
  return days>=0 && days<=CFG.deadlineDisplayDays;
});
const shownDeadlines=actionableDeadlines.slice(0,CFG.deadlineMaxItems);

const [weatherName,weatherIcon]=currentWeatherInfo(W.code,W.isDay);

// MEDIUM v1.50: calendar first; one bounded header and four bounded content rows.
if(resolveFamily()==="medium"){
  const M=mediumMetrics();
  const runtime=globalThis.ORE_DASH_RUNTIME||{};
  const state=mediumState(eventsData,upcomingData,deadlineData,W,position,runtime);
  const mediumDeadline=actionableDeadlines[0]||null;
  const footerNeeded=!!mediumDeadline||!deadlineData.ok;
  const mediumRows=scheduleRows.slice(0,footerNeeded?3:4);
  const rowCount=Math.max(1,mediumRows.length);
  const bodyHeight=M.cardPad*2+M.heading+M.headingGap+rowCount*M.row+(footerNeeded?M.divider+M.row:0);
  const budget=M.top+M.header+M.gap+bodyHeight+M.bottom;
  if(budget>(M.compact?141:155))throw new Error("Medium layout budget exceeded");

  const mw=new ListWidget();mw.setPadding(M.top,10,M.bottom,10);mw.backgroundColor=C.bg;
  mw.url=calendarURL();
  const root=mw.addStack();root.layoutVertically();root.size=new Size(M.width,0);
  const header=fixedRow(root,M.width,M.header);header.topAlignContent();
  const leftWidth=M.width-M.forecastWidth-8;
  const left=header.addStack();left.layoutVertically();left.size=new Size(leftWidth,M.header);left.url=calendarURL();

  // Date and current conditions share the left side; the right side is forecast-only.
  const dateRow=fixedRow(left,leftWidth,32);
  const dateNumber=fixedRow(dateRow,39,32);
  singleText(dateNumber,RUN_NOW.getDate(),Font.boldSystemFont(26),C.text);dateRow.addSpacer(5);
  const dateMeta=dateRow.addStack();dateMeta.layoutVertically();dateMeta.size=new Size(leftWidth-44,26);
  singleText(dateMeta,(RUN_NOW.getMonth()+1)+"月 "+["日","月","火","水","木","金","土"][RUN_NOW.getDay()],Font.semiboldSystemFont(11),C.text);
  singleText(dateMeta,shorten((position.ok?"":"予備 ")+position.city,9),Font.mediumSystemFont(9),C.sub);
  dateRow.addSpacer();
  const current=fixedRow(left,leftWidth,14);
  if(M.compact&&state.label){
    singleText(current,state.label,Font.semiboldSystemFont(10),C.orange);
  }else if(W.ok){
    singleText(current,numberLabel(W.temp)+"°",Font.semiboldSystemFont(11),C.text);current.addSpacer(4);
    icon(current,weatherIcon,C.sub,11);current.addSpacer(4);
    singleText(current,"今日降水"+numberLabel(W.rain)+"%",Font.mediumSystemFont(9),C.sub);
  }else{
    singleText(current,"天気を取得できません",Font.mediumSystemFont(10),C.orange);
  }
  current.addSpacer();header.addSpacer(8);

  const forecasts=header.addStack();forecasts.size=new Size(M.forecastWidth,M.header);forecasts.topAlignContent();
  forecastGrid(W).forEach((day,i)=>{
    const cell=forecasts.addStack();cell.layoutVertically();cell.size=new Size(46,M.header);
    // Stack text alignment requires spacers, identically on all three lines.
    centeredRow(cell,46,13,row=>singleText(row,forecastDayLabel(day.date),Font.semiboldSystemFont(10),C.sub));
    cell.addSpacer(2);
    centeredRow(cell,46,14,row=>icon(row,weatherInfo(day.code)[1],C.blue,14));
    cell.addSpacer(2);
    centeredRow(cell,46,14,row=>{
      singleText(row,numberLabel(day.max),Font.semiboldSystemFont(10),C.red);
      singleText(row,"/",Font.mediumSystemFont(9),C.gray);
      singleText(row,numberLabel(day.min),Font.semiboldSystemFont(10),C.blue);
    });
    if(i<2)forecasts.addSpacer(4);
  });
  root.addSpacer(M.gap);

  const card=root.addStack();card.layoutVertically();card.size=new Size(M.width,bodyHeight);
  card.backgroundColor=C.card;card.cornerRadius=12;card.setPadding(M.cardPad,8,M.cardPad,8);card.url=calendarURL();
  const contentWidth=M.width-16;
  if(!M.compact){
    const head=fixedRow(card,contentWidth,M.heading);
    singleText(head,"予定",Font.boldSystemFont(11),C.text);head.addSpacer();
    if(state.label)singleText(head,state.label,Font.semiboldSystemFont(9),C.orange);
    else if(!config.runsInWidget)singleText(head,"v"+VERSION.replace("-github",""),Font.mediumSystemFont(8),C.sub);
    card.addSpacer(M.headingGap);
  }

  // Shared columns apply to both schedule and deadline: when | time/type | content.
  function agendaRow(dayLabel,timeLabel,titleText,dayColor,timeColor,item){
    const row=fixedRow(card,contentWidth,M.row);row.url=calendarURL();
    const d=fixedRow(row,M.dayWidth,M.row);singleText(d,dayLabel,Font.semiboldSystemFont(11),dayColor);
    row.addSpacer(M.columnGap);
    const tm=fixedRow(row,M.timeWidth,M.row);singleText(tm,timeLabel,Font.semiboldSystemFont(11),timeColor);
    row.addSpacer(M.columnGap);
    const ib=fixedRow(row,M.iconWidth,M.row);
    if(item){
      if(item.combat)singleText(ib,combatEmoji(item),Font.systemFont(10),C.sub);
      else icon(ib,futureIconName(item),C.sub,10);
    }else ib.addSpacer();
    row.addSpacer(M.columnGap);
    const titleWidth=contentWidth-M.dayWidth-M.timeWidth-M.iconWidth-M.columnGap*3;
    const textBox=fixedRow(row,titleWidth,M.row);
    singleText(textBox,titleText,item&&(item.combat||item.soccer)?Font.semiboldSystemFont(11):Font.mediumSystemFont(11),C.text);
  }

  if(!mediumRows.length){
    const empty=fixedRow(card,contentWidth,M.row);
    const failed=!eventsData.ok||!upcomingData.ok;
    singleText(empty,failed?"予定を取得できません":"直近の予定なし",Font.mediumSystemFont(11),failed?C.orange:C.sub);
  }else{
    mediumRows.forEach((item,i)=>{
      const repeated=i>0&&sameCalendarDay(mediumRows[i-1].date,item.date);
      const dateLabel=repeated?"":(item.today?"今日":timelineDay(item.date));
      agendaRow(dateLabel,fmtTime(item.date,item.allDay),compactUpcomingTitle(item),item.today?C.blue:C.text,item.today?C.blue:C.sub,item);
    });
  }
  if(footerNeeded){
    card.addSpacer(1);
    const separator=card.addStack();separator.size=new Size(contentWidth,1);separator.backgroundColor=C.separator;
    card.addSpacer(1);
    if(!deadlineData.ok){
      agendaRow("--","期限","取得できません",C.orange,C.orange,null);
    }else{
      // Tomorrow replaces the absolute date; no duplicate countdown at the right edge.
      const urgency=deadlineColor(mediumDeadline.date);
      agendaRow(timelineDay(mediumDeadline.date),"期限",mediumDeadline.title,urgency,urgency,null);
    }
  }
  mw.addSpacer();
  mw.refreshAfterDate=nextRefresh();
  console.log("[dashboard] "+VERSION+" medium; budget="+budget+"pt; loader="+(runtime.codeSource||"unknown")+"; "+state.issues.join(","));
  if(config.runsInWidget)Script.setWidget(mw);else await mw.presentMedium();
  return;
}

const w=new ListWidget();
w.setPadding(5,14,12,14);
w.backgroundColor=C.bg;
w.url=calendarURL();

// HEADER
const header=w.addStack();header.centerAlignContent();
const left=header.addStack();left.layoutVertically();
let t=left.addText(position.city);t.font=Font.boldSystemFont(19);t.textColor=C.text;
t=left.addText(todayText());t.font=Font.mediumSystemFont(11);t.textColor=C.sub;
header.addSpacer();
if(W.ok){
  const weatherBox=header.addStack();weatherBox.layoutVertically();
  const weatherTop=weatherBox.addStack();weatherTop.centerAlignContent();
  t=weatherTop.addText(W.temp+"°");t.font=Font.boldSystemFont(31);t.textColor=C.text;weatherTop.addSpacer(7);
  t=weatherTop.addText(weatherName);t.font=Font.semiboldSystemFont(12);t.textColor=C.sub;weatherTop.addSpacer(7);
  icon(weatherTop,weatherIcon,C.blue,24);
  weatherBox.addSpacer(1);
  const weatherMeta=weatherBox.addStack();weatherMeta.centerAlignContent();
  t=weatherMeta.addText("↑"+numberLabel(W.max)+"°  ↓"+numberLabel(W.min)+"°  今日降水"+numberLabel(W.rain)+"%");t.font=Font.mediumSystemFont(10);t.textColor=C.sub;
  weatherBox.addSpacer(1);
  const liveMeta=weatherBox.addStack();liveMeta.centerAlignContent();
  const dataHealthy=position.ok&&eventsData.ok&&deadlineData.ok&&upcomingData.ok;
  t=liveMeta.addText("●");t.font=Font.systemFont(8);t.textColor=dataHealthy?C.green:C.orange;liveMeta.addSpacer(3);
  const cachedCode=(globalThis.ORE_DASH_RUNTIME||{}).codeSource==="lastGood";
  const stateLabel=cachedCode?"前回コード ":!position.ok?"予備地点 ":(!dataHealthy?"一部取得失敗 ":"更新 ");
  t=liveMeta.addText(stateLabel);t.font=Font.systemFont(8);t.textColor=dataHealthy?C.gray:C.orange;
  const liveRel=liveMeta.addDate(fetchedAt);liveRel.applyRelativeStyle();liveRel.font=Font.systemFont(8);liveRel.textColor=C.gray;
}else{t=header.addText("天気取得失敗");t.font=Font.semiboldSystemFont(10);t.textColor=C.red;}
w.addSpacer(2);

// ROW1 unified schedule timeline
const scheduleCard=mkCard(w);
scheduleCard.size=new Size(329,0);
scheduleCard.setPadding(9,12,9,12);

const sh=scheduleCard.addStack();sh.centerAlignContent();
let sht=sh.addText("予定");
sht.font=Font.boldSystemFont(13);
sht.textColor=C.text;
sh.addSpacer();

const schedulePartial=!eventsData.ok || !upcomingData.ok;
const scheduleStatus=schedulePartial
  ?"一部取得失敗"
  :(!scheduleRows.length?"予定なし":"");

if(scheduleStatus){
  let st=sh.addText(scheduleStatus);
  st.font=Font.systemFont(8);
  st.textColor=schedulePartial?C.orange:C.gray;
}

scheduleCard.addSpacer(6);

if(!scheduleRows.length){
  let empty=scheduleCard.addText(schedulePartial?"予定を取得できません":"予定はありません");
  empty.font=Font.mediumSystemFont(10);
  empty.textColor=schedulePartial?C.orange:C.sub;
}else{
  scheduleRows.forEach((it,i)=>{
    const line=scheduleCard.addStack();line.centerAlignContent();
    const prev=i>0?scheduleRows[i-1]:null;
    const repeatDay=prev&&sameCalendarDay(prev.date,it.date);

    // Same-day rows are visually grouped: show the date only on the first row.
    const dayBox=line.addStack();
    dayBox.size=new Size(38,0);
    let day=dayBox.addText(repeatDay?"":(it.today?"今日":fmtDate(it.date)));
    day.font=Font.boldSystemFont(11);
    day.textColor=it.today?C.blue:C.text;

    line.addSpacer(4);

    const timeBox=line.addStack();
    timeBox.size=new Size(42,0);
    let time=timeBox.addText(fmtTime(it.date,it.allDay));
    time.font=Font.semiboldSystemFont(10);
    time.textColor=it.today?C.blue:C.sub;

    line.addSpacer(4);

    // Fixed icon column keeps every title aligned.
    const iconBox=line.addStack();
    iconBox.size=new Size(18,0);
    iconBox.centerAlignContent();
    if(it.combat){
      let em=iconBox.addText(combatEmoji(it));
      em.font=Font.systemFont(11);
    }else{
      icon(iconBox,futureIconName(it),futureIconColor(it),10);
    }

    line.addSpacer(5);

    let title=line.addText(compactUpcomingTitle(it));
    title.font=(it.combat||it.soccer)?Font.semiboldSystemFont(12):Font.mediumSystemFont(12);
    title.textColor=C.text;
    title.lineLimit=1;

    if(i<scheduleRows.length-1){
      const next=scheduleRows[i+1];
      const endOfDayGroup=next&&!sameCalendarDay(it.date,next.date);
      scheduleCard.addSpacer(endOfDayGroup?7:4);
    }
  });

}
w.addSpacer(6);

// ROW2 important deadlines
const deadlineCard=mkCard(w);
deadlineCard.size=new Size(329,0);
deadlineCard.setPadding(10,12,10,12);

const dh=deadlineCard.addStack();dh.centerAlignContent();
let dht=dh.addText("重要期限");
dht.font=Font.boldSystemFont(13);
dht.textColor=C.text;
deadlineCard.addSpacer(7);

if(!deadlineData.ok){
  t=deadlineCard.addText("取得失敗");
  t.font=Font.mediumSystemFont(11);t.textColor=C.red;
}else if(!actionableDeadlines.length){
  t=deadlineCard.addText("30日以内の重要期限なし");
  t.font=Font.mediumSystemFont(11);t.textColor=C.sub;
}else{
  shownDeadlines.forEach((it,i)=>{
    const urgency=deadlineColor(it.date);

    const meta=deadlineCard.addStack();meta.centerAlignContent();

    let dot=meta.addText("●");
    dot.font=Font.systemFont(9);
    dot.textColor=urgency;
    meta.addSpacer(6);

    let date=meta.addText(fmtDate(it.date));
    date.font=Font.boldSystemFont(11);
    date.textColor=C.text;

    meta.addSpacer();

    let rel=meta.addText(relativeDay(it.date));
    rel.font=Font.boldSystemFont(10);
    rel.textColor=urgency;

    deadlineCard.addSpacer(2);

    let title=deadlineCard.addText(it.title);
    title.font=Font.mediumSystemFont(11);
    title.textColor=C.text;
    title.lineLimit=2;

    if(i<shownDeadlines.length-1) deadlineCard.addSpacer(9);
  });
}
w.addSpacer(2);

// Anchor content to top; remaining vertical space goes below the cards.
w.addSpacer();

// freshness/version moved into header to preserve bottom space
w.refreshAfterDate=nextRefresh();
if(config.runsInWidget) Script.setWidget(w); else await w.presentLarge();
