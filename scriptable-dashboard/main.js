// 俺専用ダッシュボード v1.22-github
// Remote main for Scriptable loader.
// IMPORTANT: Script.complete() は loader 側で呼ぶ。

const VERSION = "1.22-github";

const USER = globalThis.ORE_DASH_CONFIG || {};

const CFG = Object.assign({
  fallbackCity:"現在地",
  fallbackLat:35.6812,
  fallbackLon:139.7671,
  maxEvents:4,
  universityLookAheadDays:180,
  universityMaxItems:3,
  anniversaryMonth:null,
  anniversaryDay:null,
  refreshMinutes:15
}, USER.cfg || {});

const UNIVERSITY_KEYWORDS =
  (USER.universityKeywords && USER.universityKeywords.length)
    ? USER.universityKeywords
    : ["放送大学"];

const DEADLINE_KEYWORDS = ["締切","〆切","期限","払込期限","納入期限","提出期限","申込期限","申請期限","回答期限","最終日","必着"];
const START_KEYWORDS = ["開始","提出開始","受付開始","申込開始","申請開始","試験開始","公開開始"];
const END_KEYWORDS = ["終了","提出終了","受付終了","申込終了","申請終了"];
const PERIOD_KEYWORDS = ["期間","提出期間","受付期間","試験期間","申込期間"];
const SCHEDULE_KEYWORDS = ["試験日","単位認定試験","面接授業","試験"];

const C = {
  text:new Color("#0F172A"), sub:new Color("#64748B"),
  blue:new Color("#2563EB"), green:new Color("#16A34A"),
  orange:new Color("#EA580C"), red:new Color("#DC2626"),
  purple:new Color("#7C3AED"), gray:new Color("#94A3B8"),
  card:new Color("#FFFFFF",0.82), weakCard:new Color("#FFFFFF",0.64)
};

const TIDE = {
  station:"G9",
  stationName:"石廊崎",
  sourceLabel:"気象庁予測"
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

function htmlText(v){
  return String(v||"")
    .replace(/<script\b[\s\S]*?<\/script>/gi,"")
    .replace(/<style\b[\s\S]*?<\/style>/gi,"")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;|&#160;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/\s+/g," ")
    .trim();
}

function tideRowCells(html,dateKey){
  const rows=String(html||"").match(/<tr\b[\s\S]*?<\/tr>/gi)||[];
  const row=rows.find(r=>htmlText(r).includes(dateKey));
  if(!row) return null;
  const cells=[];
  const re=/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let m;
  while((m=re.exec(row))!==null) cells.push(htmlText(m[1]));
  return cells;
}

function tidePairs(cells,startIndex,endIndex){
  const out=[];
  for(let i=startIndex;i+1<=endIndex;i+=2){
    const time=(cells[i]||"").trim();
    const level=(cells[i+1]||"").trim();
    if(/^\d{1,2}:\d{2}$/.test(time) && /^-?\d+$/.test(level)){
      out.push({time,level:Number(level)});
    }
  }
  return out;
}

function tideDateKey(d){
  return d.getFullYear()+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+String(d.getDate()).padStart(2,"0");
}

function tideEventDate(base,time){
  const p=time.split(":").map(Number);
  return new Date(base.getFullYear(),base.getMonth(),base.getDate(),p[0],p[1],0,0);
}

async function getTide(){
  try{
    const now=new Date();
    const tomorrow=addDays(dayStart(now),1);

    const y1=now.getFullYear(),m1=String(now.getMonth()+1).padStart(2,"0"),d1=String(now.getDate()).padStart(2,"0");
    const y2=tomorrow.getFullYear(),m2=String(tomorrow.getMonth()+1).padStart(2,"0"),d2=String(tomorrow.getDate()).padStart(2,"0");

    const url=
      "https://www.data.jma.go.jp/kaiyou/db/tide/suisan/suisan.php"+
      "?LV=DL&S_HILO=on"+
      "&stn="+encodeURIComponent(TIDE.station)+
      "&ys="+y1+"&ms="+m1+"&ds="+d1+
      "&ye="+y2+"&me="+m2+"&de="+d2;

    const req=new Request(url);
    req.timeoutInterval=12;
    const html=await req.loadString();

    const days=[dayStart(now),tomorrow];
    const events=[];

    for(const base of days){
      const cells=tideRowCells(html,tideDateKey(base));
      if(!cells || cells.length<12) continue;

      const highs=tidePairs(cells,2,9);
      const lows=tidePairs(cells,10,17);

      for(const x of highs) events.push({kind:"満",time:x.time,level:x.level,date:tideEventDate(base,x.time)});
      for(const x of lows) events.push({kind:"干",time:x.time,level:x.level,date:tideEventDate(base,x.time)});
    }

    events.sort((a,b)=>a.date-b.date);
    if(!events.length) throw new Error("満干潮データなし");

    return {
      ok:true,
      station:TIDE.stationName,
      source:TIDE.sourceLabel,
      events,
      url
    };
  }catch(e){
    return {
      ok:false,
      station:TIDE.stationName,
      source:TIDE.sourceLabel,
      events:[],
      error:String(e)
    };
  }
}

function tideCompact(data){
  if(!data.ok) return "潮汐 取得失敗";

  const now=new Date();
  const upcoming=data.events.filter(x=>x.date>=now).slice(0,2);
  if(!upcoming.length) return "本日の潮変化終了";

  return upcoming.map((x,i)=>{
    const tomorrow=dayStart(x.date)>dayStart(now);
    const prefix=i===0?"次 ":"→ ";
    return prefix+(tomorrow?"明日 ":"")+x.kind+x.time;
  }).join(" ");
}

function tideHeader(data){
  if(!data.ok) return TIDE.stationName+" 潮汐取得失敗";
  const now=new Date();
  const upcoming=data.events.filter(x=>x.date>=now).slice(0,2);
  if(!upcoming.length) return TIDE.stationName+" 本日終了";
  const firstTomorrow=dayStart(upcoming[0].date)>dayStart(now);
  let out=TIDE.stationName+" "+(firstTomorrow?"明日 ":"")+"次 "+upcoming[0].kind+upcoming[0].time;
  if(upcoming[1]) out+=" → "+upcoming[1].kind+upcoming[1].time;
  return out;
}

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

function isUniversity(text,calendarTitle){return any(text,UNIVERSITY_KEYWORDS)||any(calendarTitle,UNIVERSITY_KEYWORDS);}

function mergeUniversityByDayKind(items){
  const groups=new Map();

  for(const it of items){
    const key=dayStart(it.date).getTime()+"|"+it.kind;
    if(!groups.has(key)){
      groups.set(key,{...it,count:1});
    }else{
      const g=groups.get(key);
      g.count+=1;
    }
  }

  return Array.from(groups.values()).map(g=>({
    title:g.count>1 ? g.count+"件の"+g.kind : g.title,
    date:g.date,
    kind:g.kind,
    color:g.color,
    count:g.count
  }));
}

async function getUniversityItems(){
  const out={reminderOK:false,calendarOK:false,items:[]};
  try{
    const rs=await Reminder.allIncomplete();out.reminderOK=true;
    for(const r of rs){
      if(!r.dueDate)continue;
      const title=normalize(r.title), notes=normalize(r.notes), combined=title+" "+notes;
      if(!isUniversity(combined,calName(r)))continue;
      let kind=null,color=C.blue;
      if(any(combined,START_KEYWORDS)){kind="開始";color=C.purple;}
      else if(any(combined,END_KEYWORDS)){kind="終了";color=C.orange;}
      else if(any(combined,DEADLINE_KEYWORDS)){kind="期限";color=C.red;}
      else if(any(combined,SCHEDULE_KEYWORDS)){kind="予定";color=C.blue;}
      if(kind)out.items.push({title,date:r.dueDate,kind,color});
    }
  }catch(_){}
  try{
    const now=new Date(), endSearch=addDays(now,CFG.universityLookAheadDays);
    const es=await CalendarEvent.between(now,endSearch);out.calendarOK=true;
    for(const e of es){
      const title=normalize(e.title), notes=normalize(e.notes), combined=title+" "+notes;
      if(!isUniversity(combined,calName(e)))continue;
      const start=new Date(e.startDate), end=realEventEnd(e), sd=dayStart(start), ed=dayStart(end);
      const periodLike=ed>sd||any(combined,PERIOD_KEYWORDS);
      if(periodLike){
        out.items.push({title,date:start,kind:"開始",color:C.purple});
        if(ed.getTime()!==sd.getTime())out.items.push({title,date:end,kind:"終了",color:C.orange});
        continue;
      }
      let kind=null,color=C.blue;
      if(any(combined,START_KEYWORDS)){kind="開始";color=C.purple;}
      else if(any(combined,END_KEYWORDS)){kind="終了";color=C.orange;}
      else if(any(combined,DEADLINE_KEYWORDS)){kind="期限";color=C.red;}
      else if(any(combined,SCHEDULE_KEYWORDS)){kind="予定";color=C.blue;}
      if(kind)out.items.push({title,date:start,kind,color});
    }
  }catch(_){}
  const seen=new Set();
  const exact=out.items
    .sort((a,b)=>a.date-b.date)
    .filter(x=>{
      const k=normalize(x.title).toLowerCase()+"|"+x.kind+"|"+dayStart(x.date).getTime();
      if(seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  out.items=mergeUniversityByDayKind(exact)
    .sort((a,b)=>a.date-b.date)
    .slice(0,CFG.universityMaxItems);

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

function isAllDayLikeEvent(e){
  if(e.isAllDay) return true;

  const start=new Date(e.startDate);
  const end=new Date(e.endDate);
  const midnight=start.getHours()===0 && start.getMinutes()===0;
  const duration=end-start;

  return midnight && duration>=23*60*60*1000 && duration<=25*60*60*1000;
}

function upcomingPriority(item){
  if(item.kind==="期限") return 0;
  if(item.source==="家族") return 1;
  if(item.source==="リマインダー") return 2;
  if(item.source==="放送大学") return 3;
  if(item.source==="予定") return 4;
  return 5;
}

async function getUpcoming7(universityItems,ann){
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
      if(isUniversity(combined,calendarTitle)) continue;

      out.push({
        title,
        date:d,
        allDay:isAllDayLikeEvent(e),
        source:"予定",
        kind:"予定",
        color:C.blue,
        combat:isCombatEvent(title,calendarTitle)
      });
    }
  }catch(_){}

  try{
    const rs=await Reminder.allIncomplete();
    for(const r of rs){
      if(!r.dueDate) continue;
      const d=new Date(r.dueDate);
      if(d<start || d>=end) continue;
      const title=normalize(r.title);
      if(!title) continue;
      const combined=title+" "+normalize(r.notes);
      if(isUniversity(combined,calName(r))) continue;
      out.push({
        title,
        date:d,
        allDay:!r.dueDateIncludesTime,
        source:"リマインダー",
        kind:"予定",
        color:C.green
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

  for(const it of universityItems||[]){
    if(it.date>=start && it.date<end){
      out.push({
        title:it.title,
        date:new Date(it.date),
        allDay:true,
        source:"放送大学",
        kind:it.kind,
        color:it.color
      });
    }
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

function cleanUniversityTitle(title,date){
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
  return normalize(v)||"放送大学予定";
}

function futureIconName(it){
  if(it.source==="家族" || normalize(it.title).includes("誕生日")) return "gift.fill";
  if(it.source==="放送大学") return "graduationcap.fill";
  if(it.source==="リマインダー") return "checkmark.circle.fill";
  const t=normalize(it.title).toLowerCase();
  if(t.includes("japan") || t.includes("uruguay") || t.includes("サッカー") || t.includes("football")) return "soccerball";
  return "calendar";
}

function futureIconColor(it){
  if(it.source==="家族" || normalize(it.title).includes("誕生日")) return C.orange;
  if(it.source==="放送大学") return C.purple;
  if(it.source==="リマインダー") return C.green;
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
const [W,eventsData,universityData,tideData]=await Promise.all([getWeather(position),getEvents(),getUniversityItems(),getTide()]);
const ann=anniversary();
const upcoming7=await getUpcoming7(universityData.items,ann);
const nextCombat=upcoming7.find(x=>x.combat)||null;
const visibleUpcoming=(nextCombat?upcoming7.filter(x=>x!==nextCombat).slice(0,4):upcoming7.slice(0,5));
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
  const tideMeta=weatherBox.addStack();tideMeta.centerAlignContent();
  icon(tideMeta,"fish.fill",tideData.ok?C.blue:C.gray,8);tideMeta.addSpacer(3);
  t=tideMeta.addText(tideHeader(tideData));t.font=Font.systemFont(8);t.textColor=tideData.ok?C.blue:C.gray;t.lineLimit=1;t.minimumScaleFactor=0.72;
  weatherBox.addSpacer(1);
  const liveMeta=weatherBox.addStack();liveMeta.centerAlignContent();
  t=liveMeta.addText("●");t.font=Font.systemFont(7);t.textColor=C.green;liveMeta.addSpacer(3);
  t=liveMeta.addText("更新 ");t.font=Font.systemFont(7);t.textColor=C.gray;
  const liveRel=liveMeta.addDate(fetchedAt);liveRel.applyRelativeStyle();liveRel.font=Font.systemFont(7);liveRel.textColor=C.gray;
  liveMeta.addSpacer(5);
  t=liveMeta.addText("v"+VERSION);t.font=Font.systemFont(7);t.textColor=C.gray;
}else{t=header.addText("天気取得失敗");t.font=Font.semiboldSystemFont(10);t.textColor=C.red;}
w.addSpacer(4);

// ROW1 full-width today
const eventCard=mkCard(w);
eventCard.setPadding(10,12,10,12);
section(eventCard,"calendar","今日の予定",C.blue);
eventCard.addSpacer(6);

if(!eventsData.ok){
  t=eventCard.addText("取得失敗");
  t.font=Font.systemFont(11);t.textColor=C.red;
}else if(!eventsData.items.length){
  t=eventCard.addText("今日は予定なし");
  t.font=Font.systemFont(11);t.textColor=C.sub;
}else{
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
    x.minimumScaleFactor=0.78;

    if(i<eventsData.items.length-1)eventCard.addSpacer(5);
  });
}
w.addSpacer(4);

// ROW2
const row2=w.addStack();row2.spacing=8;
const family=mkCard(row2);family.size=new Size(112,86);section(family,"person.2.fill","家族",C.orange);family.addSpacer(4);
t=family.addText("結婚記念日");t.font=Font.systemFont(10);t.textColor=C.sub;
if(ann){
  const annColor=ann.days<=3?C.red:(ann.days<=7?C.orange:C.text);
  const annSize=ann.days<=3?18:16;
  t=family.addText(ann.days===0?"今日 ♥":"あと"+ann.days+"日");t.font=Font.boldSystemFont(annSize);t.textColor=annColor;
  t=family.addText(fmtDate(ann.date));t.font=Font.systemFont(9);t.textColor=C.sub;
}else{
  t=family.addText("未設定");t.font=Font.boldSystemFont(13);t.textColor=C.sub;
}

const uni=mkCard(row2);uni.size=new Size(217,86);
const uh=section(uni,"graduationcap.fill","放送大学",C.purple);
uni.addSpacer(5);
if(!universityData.items.length){
  t=uni.addText((universityData.reminderOK||universityData.calendarOK)?"予定なし":"取得失敗");
  t.font=Font.systemFont(10);t.textColor=(universityData.reminderOK||universityData.calendarOK)?C.sub:C.red;
}else universityData.items.forEach((it,i)=>{
  const l=uni.addStack();l.centerAlignContent();
  let dot=l.addText("●");dot.font=Font.systemFont(8);dot.textColor=it.color;
  l.addSpacer(4);
  let date=l.addText(fmtDate(it.date));date.font=Font.boldSystemFont(9);date.textColor=C.text;
  l.addSpacer(5);
  let title=l.addText(shorten(cleanUniversityTitle(it.title,it.date),15));title.font=Font.systemFont(9);title.textColor=C.text;title.lineLimit=1;title.minimumScaleFactor=0.78;
  l.addSpacer();
  let rel=l.addText(relativeDay(it.date));rel.font=Font.boldSystemFont(8);rel.textColor=it.color;
  if(i<universityData.items.length-1)uni.addSpacer(4);
});
w.addSpacer(4);

// ROW4 next 7 days
const futureCard=w.addStack();futureCard.layoutVertically();
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
  if(nextCombat){
    const fight=futureCard.addStack();fight.layoutVertically();
    fight.backgroundColor=new Color("#FEE2E2",0.70);
    fight.cornerRadius=9;
    fight.setPadding(5,7,5,7);

    const top=fight.addStack();top.centerAlignContent();
    let em=top.addText("🥊");em.font=Font.systemFont(11);
    top.addSpacer(5);
    let lab=top.addText("次の格闘技");lab.font=Font.boldSystemFont(9);lab.textColor=C.red;
    top.addSpacer();
    let rel=top.addText(relativeDay(nextCombat.date));rel.font=Font.boldSystemFont(8);rel.textColor=C.red;

    fight.addSpacer(2);
    const detail=fight.addStack();detail.centerAlignContent();
    let dt=detail.addText(upcomingDayLabel(nextCombat.date));dt.font=Font.boldSystemFont(8);dt.textColor=C.red;
    detail.addSpacer(6);
    let ft=detail.addText(nextCombat.title);ft.font=Font.semiboldSystemFont(9);ft.textColor=C.text;ft.lineLimit=1;ft.minimumScaleFactor=0.78;
    if(!nextCombat.allDay){
      detail.addSpacer(5);
      let tm=detail.addText(fmtTime(nextCombat.date,false));tm.font=Font.semiboldSystemFont(8);tm.textColor=C.sub;
    }
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

    let title=line.addText(it.source==="放送大学" ? cleanUniversityTitle(it.title,it.date) : it.title);
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
