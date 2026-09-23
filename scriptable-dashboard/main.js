// 俺専用ダッシュボード v1.26-github
// Remote main for Scriptable loader.
// IMPORTANT: Script.complete() は loader 側で呼ぶ。

const VERSION = "1.26-github";

const USER = globalThis.ORE_DASH_CONFIG || {};

const CFG = Object.assign({
  fallbackCity:"現在地",
  fallbackLat:35.6812,
  fallbackLon:139.7671,
  maxEvents:4,
  deadlineLookAheadDays:180,
  deadlineMaxItems:3,
  anniversaryMonth:null,
  anniversaryDay:null,
  refreshMinutes:15
}, USER.cfg || {});

const DEADLINE_KEYWORDS = ["締切","〆切","期限","払込期限","納入期限","提出期限","申込期限","申請期限","回答期限","最終日","必着"];

const C = {
  text:new Color("#0F172A"), sub:new Color("#64748B"),
  blue:new Color("#2563EB"), green:new Color("#16A34A"),
  orange:new Color("#EA580C"), red:new Color("#DC2626"),
  purple:new Color("#7C3AED"), gray:new Color("#94A3B8"),
  card:new Color("#FFFFFF",0.82), weakCard:new Color("#FFFFFF",0.64)
};

function icon(stack,name,color,size=12){const sf=SFSymbol.named(name);sf.applyFont(Font.systemFont(size));const i=stack.addImage(sf.image);i.imageSize=new Size(size,size);i.tintColor=color;return i;}
function normalize(v){return v?String(v).replace(/\s+/g," ").trim():"";}
function shorten(v,n){v=normalize(v);return v.length<=n?v:v.slice(0,n-1)+"…";}
function any(text,keys){text=normalize(text);return keys.some(k=>text.includes(k));}
function fmtTime(d,allDay=false){if(allDay)return "終日";const f=new DateFormatter();f.dateFormat="HH:mm";return f.string(d);}
function fmtDate(d){const f=new DateFormatter();f.locale="ja_JP";f.dateFormat="M/d";return f.string(d);}
function todayText(){const f=new DateFormatter();f.locale="ja_JP";f.dateFormat="M月d日 EEE";return f.string(new Date());}
function dayStart(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function daysBetween(a,b){return Math.round((dayStart(b)-dayStart(a))/86400000);}
function relativeDay(d){const n=daysBetween(new Date(),d);if(n<0)return Math.abs(n)+"日超過";if(n===0)return "今日";if(n===1)return "明日";return "あと"+n+"日";}
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
  try{
    const u="https://api.open-meteo.com/v1/forecast?latitude="+pos.lat+"&longitude="+pos.lon+"&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1";
    const r=new Request(u);r.timeoutInterval=10;const j=await r.loadJSON();
    return {ok:true,temp:Math.round(j.current.temperature_2m),code:j.current.weather_code,max:Math.round(j.daily.temperature_2m_max[0]),min:Math.round(j.daily.temperature_2m_min[0]),rain:Math.round(j.daily.precipitation_probability_max[0])};
  }catch(_){return {ok:false,temp:null,code:-1,max:null,min:null,rain:null};}
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
    const now=new Date();
    const list=await CalendarEvent.today();
    const seen=new Set();

    const items=list
      .filter(e=>!isHolidayCalendarTitle(calName(e)))
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
      })
      .slice(0,CFG.maxEvents);

    return {ok:true,items};
  }catch(_){return {ok:false,items:[]};}
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
    const now=new Date();
    const endSearch=addDays(now,CFG.deadlineLookAheadDays);
    const es=await CalendarEvent.between(dayStart(now),endSearch);
    out.ok=true;

    const seen=new Set();
    for(const e of es){
      const calendarTitle=calName(e);
      if(isHolidayCalendarTitle(calendarTitle)) continue;

      const title=normalize(e.title);
      if(!title) continue;

      const notes=normalize(e.notes);
      const combined=title+" "+notes;
      if(!isDeadlineText(combined)) continue;

      const date=new Date(e.startDate);
      const cleaned=cleanDeadlineTitle(title,date);
      const key=cleaned.toLowerCase()+"|"+dayStart(date).getTime();
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
      .sort((a,b)=>a.date-b.date)
      .slice(0,CFG.deadlineMaxItems);

  }catch(_){}

  return out;
}


function isHolidayCalendarTitle(title){
  const t=normalize(title).toLowerCase();
  return t.includes("祝日") || t.includes("holiday");
}

function isCombatEvent(title,calendarTitle=""){
  const t=(normalize(title)+" "+normalize(calendarTitle)).toLowerCase();
  const patterns=[
    /(^|\s|[^a-z0-9])ufc([^a-z0-9]|$)/,
    /rizin/,
    /(^|\s|[^a-z0-9])mma([^a-z0-9]|$)/,
    /(^|\s|[^a-z0-9])pfl([^a-z0-9]|$)/,
    /bellator/,
    /(^|\s|[^a-z0-9])one([^a-z0-9]|$)/,
    /k[- ]?1/,
    /knock\s*out/,
    /(^|\s|[^a-z0-9])rise([^a-z0-9]|$)/,
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
  const t=(normalize(title)+" "+normalize(calendarTitle)+" "+normalize(notes)).toLowerCase();

  if(t.includes("fotmob") || t.includes("fotmob.com")) return true;
  if(t.includes("⚽") || t.includes("サッカー") || t.includes("football") || t.includes("soccer")) return true;

  const known=[
    "manchester united","manchester city","liverpool","arsenal","chelsea","tottenham",
    "real madrid","atlético madrid","atletico madrid","barcelona","bayern","dortmund",
    "inter milan","ac milan","juventus","paris saint-germain","psg",
    "japan","日本代表"
  ];
  return known.some(k=>t.includes(k));
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

async function getUpcoming7(ann){
  const now=new Date();
  const start=addDays(dayStart(now),1);
  const end=addDays(start,7);
  const out=[];

  try{
    const es=await CalendarEvent.between(start,end);
    for(const e of es){
      const d=new Date(e.startDate);
      if(d<start || d>=end) continue;

      const calendarTitle=calName(e);
      if(isHolidayCalendarTitle(calendarTitle)) continue;

      const title=normalize(e.title);
      if(!title) continue;

      const combined=title+" "+normalize(e.notes);

      // 期限は「重要期限」カードへ一本化して二重表示しない。
      if(isDeadlineText(combined)) continue;

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
  }catch(_){}

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
  return out
    .sort((a,b)=>{
      const da=dayStart(a.date)-dayStart(b.date);
      if(da!==0) return da;
      const p=upcomingPriority(a)-upcomingPriority(b);
      if(p!==0) return p;
      return a.date-b.date;
    })
    .filter(x=>{
      const k=normalize(x.title).toLowerCase()+"|"+dayStart(x.date).getTime();
      if(seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

function upcomingDayLabel(d){
  const n=daysBetween(new Date(),d);
  if(n===1) return "明日";
  return fmtDate(d);
}

function futureIconName(it){
  if(it.source==="家族" || normalize(it.title).includes("誕生日")) return "gift.fill";
  if(it.soccer) return "soccerball";
  return "calendar";
}

function futureIconColor(it){
  if(it.source==="家族" || normalize(it.title).includes("誕生日")) return C.orange;
  return C.blue;
}

function anniversary(){
  if(!CFG.anniversaryMonth || !CFG.anniversaryDay) return null;
  const n=new Date();let t=new Date(n.getFullYear(),CFG.anniversaryMonth-1,CFG.anniversaryDay);
  if(dayStart(t)<dayStart(n))t=new Date(n.getFullYear()+1,CFG.anniversaryMonth-1,CFG.anniversaryDay);
  return {date:t,days:daysBetween(n,t)};
}

const fetchedAt=new Date();
const position=await getPosition();
const [W,eventsData,deadlineData]=await Promise.all([getWeather(position),getEvents(),getImportantDeadlines()]);
const ann=anniversary();
const upcoming7=await getUpcoming7(ann);
const nextCombat=upcoming7.find(x=>x.combat)||null;
const nextSoccer=upcoming7.find(x=>x.soccer)||null;

const featured=[];
if(nextCombat) featured.push(nextCombat);
if(nextSoccer && nextSoccer!==nextCombat) featured.push(nextSoccer);
featured.sort((a,b)=>a.date-b.date);

const featuredEvents=featured.slice(0,2);
const visibleUpcoming=upcoming7.filter(x=>!featuredEvents.includes(x)).slice(0,Math.max(0,5-featuredEvents.length));
const [weatherName,weatherIcon]=weatherInfo(W.code);

const w=new ListWidget();
w.setPadding(12,14,9,14);
const bg=new LinearGradient();bg.colors=[new Color("#D8ECFF"),new Color("#EEF7FF"),new Color("#FFFFFF")];bg.locations=[0,0.55,1];w.backgroundGradient=bg;

// HEADER
const header=w.addStack();header.centerAlignContent();
const left=header.addStack();left.layoutVertically();
let t=left.addText(position.city);t.font=Font.boldSystemFont(17);t.textColor=C.blue;
t=left.addText(todayText());t.font=Font.systemFont(10);t.textColor=C.sub;
header.addSpacer();
if(W.ok){
  const weatherBox=header.addStack();weatherBox.layoutVertically();
  const weatherTop=weatherBox.addStack();weatherTop.centerAlignContent();
  t=weatherTop.addText(W.temp+"°");t.font=Font.boldSystemFont(28);t.textColor=C.text;weatherTop.addSpacer(6);
  t=weatherTop.addText(weatherName);t.font=Font.semiboldSystemFont(11);t.textColor=C.sub;weatherTop.addSpacer(6);
  icon(weatherTop,weatherIcon,C.blue,22);
  weatherBox.addSpacer(1);
  const weatherMeta=weatherBox.addStack();weatherMeta.centerAlignContent();
  t=weatherMeta.addText("↑"+W.max+"°  ↓"+W.min+"°  降水"+W.rain+"%");t.font=Font.systemFont(9);t.textColor=C.sub;
  weatherBox.addSpacer(1);
  const liveMeta=weatherBox.addStack();liveMeta.centerAlignContent();
  t=liveMeta.addText("●");t.font=Font.systemFont(7);t.textColor=C.green;liveMeta.addSpacer(3);
  t=liveMeta.addText("更新 ");t.font=Font.systemFont(7);t.textColor=C.gray;
  const liveRel=liveMeta.addDate(fetchedAt);liveRel.applyRelativeStyle();liveRel.font=Font.systemFont(7);liveRel.textColor=C.gray;
}else{t=header.addText("天気取得失敗");t.font=Font.semiboldSystemFont(10);t.textColor=C.red;}
w.addSpacer(4);

// ROW1 full-width today
if(!eventsData.ok){
  const eventCard=mkCard(w);
  eventCard.size=new Size(329,52);
  eventCard.setPadding(9,12,9,12);
  const line=eventCard.addStack();line.centerAlignContent();
  icon(line,"calendar",C.blue,12);line.addSpacer(6);
  let tx=line.addText("今日の予定");tx.font=Font.boldSystemFont(12);tx.textColor=C.text;
  line.addSpacer();
  tx=line.addText("取得失敗");tx.font=Font.systemFont(10);tx.textColor=C.red;
}else if(!eventsData.items.length){
  const eventCard=mkCard(w);
  eventCard.size=new Size(329,48);
  eventCard.setPadding(9,12,9,12);
  const line=eventCard.addStack();line.centerAlignContent();
  icon(line,"calendar",C.blue,12);line.addSpacer(6);
  let tx=line.addText("今日の予定");tx.font=Font.boldSystemFont(12);tx.textColor=C.text;
  line.addSpacer();
  tx=line.addText("今日は予定なし");tx.font=Font.systemFont(10);tx.textColor=C.sub;
}else{
  const eventCard=mkCard(w);
  const eventHeight=Math.min(108,54+eventsData.items.length*18);
  eventCard.size=new Size(329,eventHeight);
  eventCard.setPadding(10,12,10,12);
  section(eventCard,"calendar","今日の予定",C.blue);
  eventCard.addSpacer(6);

  eventsData.items.forEach((e,i)=>{
    const l=eventCard.addStack();l.centerAlignContent();

    let x=l.addText(fmtTime(e.startDate,isAllDayLikeEvent(e)));
    x.font=Font.boldSystemFont(11);
    x.textColor=C.blue;
    l.addSpacer(7);

    x=l.addText(e.title);
    x.font=Font.systemFont(11);
    x.textColor=C.text;
    x.lineLimit=1;
    x.minimumScaleFactor=0.80;

    if(i<eventsData.items.length-1)eventCard.addSpacer(4);
  });
}
w.addSpacer(4);

// ROW2 important deadlines
const deadlineCard=mkCard(w);
deadlineCard.size=new Size(329,0);
deadlineCard.setPadding(10,12,10,12);
section(deadlineCard,"exclamationmark.triangle.fill","重要期限",C.red);
deadlineCard.addSpacer(6);

if(!deadlineData.ok){
  t=deadlineCard.addText("取得失敗");
  t.font=Font.systemFont(11);t.textColor=C.red;
}else if(!deadlineData.items.length){
  t=deadlineCard.addText("直近の重要期限なし");
  t.font=Font.systemFont(11);t.textColor=C.sub;
}else{
  deadlineData.items.forEach((it,i)=>{
    const l=deadlineCard.addStack();l.centerAlignContent();

    let dot=l.addText("●");dot.font=Font.systemFont(8);dot.textColor=C.red;
    l.addSpacer(5);

    let date=l.addText(fmtDate(it.date));date.font=Font.boldSystemFont(10);date.textColor=C.text;
    l.addSpacer(7);

    let title=l.addText(shorten(it.title,28));
    title.font=Font.systemFont(10);title.textColor=C.text;title.lineLimit=1;title.minimumScaleFactor=0.80;

    l.addSpacer();
    let rel=l.addText(relativeDay(it.date));rel.font=Font.boldSystemFont(9);rel.textColor=C.red;

    if(i<deadlineData.items.length-1)deadlineCard.addSpacer(5);
  });
}
w.addSpacer(4);

// ROW4 next 7 days
const futureCard=w.addStack();futureCard.layoutVertically();futureCard.size=new Size(329,0);
futureCard.backgroundColor=C.weakCard;futureCard.cornerRadius=12;
futureCard.setPadding(10,11,10,11);

let fh=futureCard.addStack();fh.centerAlignContent();
icon(fh,"calendar.badge.clock",C.blue,11);fh.addSpacer(5);
let fx=fh.addText("この先7日");fx.font=Font.boldSystemFont(12);fx.textColor=C.text;
fh.addSpacer();
fx=fh.addText(upcoming7.length?upcoming7.length+"件":"予定なし");
fx.font=Font.systemFont(8);fx.textColor=upcoming7.length?C.green:C.gray;
futureCard.addSpacer(5);

if(!upcoming7.length){
  fx=futureCard.addText("重要な予定はありません");
  fx.font=Font.systemFont(9);fx.textColor=C.sub;
}else{
  if(featuredEvents.length){
    const featuredBox=futureCard.addStack();featuredBox.layoutVertically();
    featuredBox.backgroundColor=new Color("#EEF2FF",0.78);
    featuredBox.cornerRadius=9;
    featuredBox.setPadding(6,7,6,7);

    const head=featuredBox.addStack();head.centerAlignContent();
    let pin=head.addText("📌");pin.font=Font.systemFont(10);
    head.addSpacer(5);
    let label=head.addText("注目イベント");label.font=Font.boldSystemFont(9);label.textColor=C.purple;

    featuredBox.addSpacer(3);

    featuredEvents.forEach((it,i)=>{
      const line=featuredBox.addStack();line.centerAlignContent();

      let emoji=line.addText(it.combat?"🥊":"⚽");
      emoji.font=Font.systemFont(10);
      line.addSpacer(5);

      let date=line.addText(upcomingDayLabel(it.date));
      date.font=Font.boldSystemFont(8);
      date.textColor=it.combat?C.red:C.blue;
      line.addSpacer(6);

      let title=line.addText(it.title);
      title.font=Font.semiboldSystemFont(9);
      title.textColor=C.text;
      title.lineLimit=1;
      title.minimumScaleFactor=0.78;

      if(!it.allDay){
        line.addSpacer(5);
        let tm=line.addText(fmtTime(it.date,false));
        tm.font=Font.semiboldSystemFont(8);
        tm.textColor=C.sub;
      }

      line.addSpacer(5);
      let rel=line.addText(relativeDay(it.date));
      rel.font=Font.boldSystemFont(8);
      rel.textColor=it.combat?C.red:C.blue;

      if(i<featuredEvents.length-1) featuredBox.addSpacer(4);
    });

    futureCard.addSpacer(6);
  }

  visibleUpcoming.forEach((it,i)=>{
    const line=futureCard.addStack();line.centerAlignContent();

    icon(line,futureIconName(it),futureIconColor(it),9);
    line.addSpacer(5);

    let d=line.addText(upcomingDayLabel(it.date));
    d.font=Font.boldSystemFont(9);
    d.textColor=it.color||C.blue;
    line.addSpacer(7);

    let title=line.addText(it.title);
    title.font=Font.systemFont(10);
    title.textColor=C.text;
    title.lineLimit=1;
    title.minimumScaleFactor=0.80;

    if(!it.allDay){
      line.addSpacer(6);
      let tm=line.addText(fmtTime(it.date,false));
      tm.font=Font.semiboldSystemFont(8);
      tm.textColor=C.sub;
    }

    if(i<visibleUpcoming.length-1) futureCard.addSpacer(7);
  });

}

// freshness/version moved into header to preserve bottom space
w.refreshAfterDate=new Date(Date.now()+CFG.refreshMinutes*60*1000);
if(config.runsInWidget) Script.setWidget(w); else await w.presentLarge();
