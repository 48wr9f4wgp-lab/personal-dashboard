// 俺専用ダッシュボード v1.48-github
// Remote main for Scriptable loader.
// IMPORTANT: Script.complete() は loader 側で呼ぶ。

const VERSION = "1.48-github";

const USER = globalThis.ORE_DASH_CONFIG || {};

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
  refreshMinutes:15
}, USER.cfg || {});

const DEADLINE_KEYWORDS = ["締切","〆切","期限","払込期限","納入期限","提出期限","申込期限","申請期限","回答期限","最終日","必着"];

const C = {
  bg:Color.dynamic(new Color("#F2F2F7"),new Color("#0B0B0D")),
  text:Color.dynamic(new Color("#1D1D1F"),new Color("#F5F5F7")),
  sub:Color.dynamic(new Color("#6E6E73"),new Color("#A1A1AA")),
  blue:Color.dynamic(new Color("#007AFF"),new Color("#0A84FF")),
  green:Color.dynamic(new Color("#34C759"),new Color("#30D158")),
  orange:Color.dynamic(new Color("#FF9500"),new Color("#FF9F0A")),
  red:Color.dynamic(new Color("#FF3B30"),new Color("#FF453A")),
  purple:Color.dynamic(new Color("#7C3AED"),new Color("#BF5AF2")),
  gray:Color.dynamic(new Color("#8E8E93"),new Color("#8E8E93")),
  separator:Color.dynamic(new Color("#D1D1D6",0.75),new Color("#38383A",0.9)),
  card:Color.dynamic(new Color("#FFFFFF",0.98),new Color("#1C1C1E",0.98)),
  weakCard:Color.dynamic(new Color("#FFFFFF",0.96),new Color("#1C1C1E",0.96))
};

function icon(stack,name,color,size=12){const sf=SFSymbol.named(name);sf.applyFont(Font.systemFont(size));const i=stack.addImage(sf.image);i.imageSize=new Size(size,size);i.tintColor=color;return i;}
function normalize(v){return v?String(v).replace(/\s+/g," ").trim():"";}
function shorten(v,n){v=normalize(v);return v.length<=n?v:v.slice(0,n-1)+"…";}
function any(text,keys){text=normalize(text);return keys.some(k=>text.includes(k));}
function fmtTime(d,allDay=false){if(allDay)return "終日";const f=new DateFormatter();f.dateFormat="HH:mm";return f.string(d);}
function fmtDate(d){const f=new DateFormatter();f.locale="ja_JP";f.dateFormat="M/d";return f.string(d);}
function forecastDayLabel(iso){
  const p=String(iso||"").split("-").map(Number);
  if(p.length!==3 || p.some(Number.isNaN)) return "";
  const d=new Date(p[0],p[1]-1,p[2]);
  return p[2]+["日","月","火","水","木","金","土"][d.getDay()];
}
function todayText(){const f=new DateFormatter();f.locale="ja_JP";f.dateFormat="M月d日 EEE";return f.string(new Date());}
function dayStart(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function sameCalendarDay(a,b){return !!a&&!!b&&dayStart(a).getTime()===dayStart(b).getTime();}
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
    const u="https://api.open-meteo.com/v1/forecast?latitude="+pos.lat+"&longitude="+pos.lon+"&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4";
    const r=new Request(u);r.timeoutInterval=10;const j=await r.loadJSON();

    const daily=(j.daily.time||[]).map((date,i)=>({
      date,
      code:j.daily.weather_code[i],
      max:Math.round(j.daily.temperature_2m_max[i]),
      min:Math.round(j.daily.temperature_2m_min[i]),
      rain:Math.round(j.daily.precipitation_probability_max[i])
    }));

    return {
      ok:true,
      temp:Math.round(j.current.temperature_2m),
      code:j.current.weather_code,
      max:daily[0]?daily[0].max:null,
      min:daily[0]?daily[0].min:null,
      rain:daily[0]?daily[0].rain:null,
      daily
    };
  }catch(_){
    return {ok:false,temp:null,code:-1,max:null,min:null,rain:null,daily:[]};
  }
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

    const all=list
      .filter(e=>!isHolidayCalendarTitle(calName(e)))
      .filter(e=>!isInactiveTitle(e.title))
      .filter(e=>!isDeadlineText(normalize(e.title)))
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
    const now=new Date();
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
      if(!isDeadlineText(title)) continue;

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
      .sort((a,b)=>a.date-b.date);

  }catch(_){}

  return out;
}


function isHolidayCalendarTitle(title){
  const t=normalize(title).toLowerCase();
  return t.includes("祝日") || t.includes("holiday");
}

function isInactiveTitle(title){
  const t=normalize(title);
  return /^(?:✅|☑️|【完了】|\[完了\]|完了[：:\s]|【中止】|【取消】|【キャンセル】|中止[：:\s]|取消[：:\s]|キャンセル[：:\s])/i.test(t);
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
  const now=new Date();
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
  const n=daysBetween(new Date(),date);
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
  const n=new Date();let t=new Date(n.getFullYear(),CFG.anniversaryMonth-1,CFG.anniversaryDay);
  if(dayStart(t)<dayStart(n))t=new Date(n.getFullYear()+1,CFG.anniversaryMonth-1,CFG.anniversaryDay);
  return {date:t,days:daysBetween(n,t)};
}

const fetchedAt=new Date();
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
  const days=daysBetween(new Date(),it.date);
  return days>=0 && days<=CFG.deadlineDisplayDays;
});
const shownDeadlines=actionableDeadlines.slice(0,CFG.deadlineMaxItems);

const [weatherName,weatherIcon]=weatherInfo(W.code);

// MEDIUM: Calendar replacement mode.
// Same data source, but only the few items worth seeing at a glance.
if(config.widgetFamily==="medium"){
  const mw=new ListWidget();
  mw.setPadding(6,10,6,10);
  mw.backgroundColor=C.bg;

  const mh=mw.addStack();
  mh.centerAlignContent();

  // Left: calendar-first identity.
  const now=new Date();
  const weekday=["日","月","火","水","木","金","土"][now.getDay()];

  const ml=mh.addStack();
  ml.centerAlignContent();

  let mt=ml.addText(String(now.getDate()));
  mt.font=Font.boldSystemFont(31);
  mt.textColor=C.text;

  ml.addSpacer(6);

  const md=ml.addStack();
  md.layoutVertically();

  mt=md.addText(weekday);
  mt.font=Font.boldSystemFont(13);
  mt.textColor=C.text;

  mt=md.addText((now.getMonth()+1)+"月");
  mt.font=Font.mediumSystemFont(8);
  mt.textColor=C.sub;

  mt=md.addText(position.city);
  mt.font=Font.mediumSystemFont(8);
  mt.textColor=C.sub;

  mh.addSpacer();

  if(W.ok){
    const mr=mh.addStack();
    mr.layoutVertically();

    // Current weather.
    const mwt=mr.addStack();
    mwt.centerAlignContent();

    mt=mwt.addText(W.temp+"°");
    mt.font=Font.boldSystemFont(22);
    mt.textColor=C.text;
    mwt.addSpacer(4);

    mt=mwt.addText(weatherName);
    mt.font=Font.semiboldSystemFont(9);
    mt.textColor=C.sub;
    mwt.addSpacer(4);

    icon(mwt,weatherIcon,C.blue,14);

    const mwm=mr.addStack();
    mwm.centerAlignContent();
    mt=mwm.addText("↑"+W.max+"° ↓"+W.min+"° 降水"+W.rain+"%");
    mt.font=Font.mediumSystemFont(7);
    mt.textColor=C.sub;

    // Next three days as three vertical cells, Weathernews-style.
    const future=(W.daily||[]).slice(1,4);
    if(future.length){
      mr.addSpacer(3);

      const fr=mr.addStack();
      fr.centerAlignContent();

      future.forEach((d,i)=>{
        const cell=fr.addStack();
        cell.layoutVertically();
        cell.centerAlignContent();
        cell.size=new Size(41,0);

        let x=cell.addText(forecastDayLabel(d.date));
        x.font=Font.semiboldSystemFont(7);
        x.textColor=C.sub;
        x.centerAlignText();

        cell.addSpacer(1);

        const [,fi]=weatherInfo(d.code);
        const iconRow=cell.addStack();
        iconRow.addSpacer();
        icon(iconRow,fi,C.blue,10);
        iconRow.addSpacer();

        cell.addSpacer(1);

        x=cell.addText(d.max+"°/"+d.min+"°");
        x.font=Font.mediumSystemFont(7);
        x.textColor=C.sub;
        x.centerAlignText();

        if(i<future.length-1) fr.addSpacer(3);
      });
    }
  }else{
    mt=mh.addText("天気取得失敗");
    mt.font=Font.semiboldSystemFont(9);
    mt.textColor=C.red;
  }

  mw.addSpacer(2);

  const mc=mw.addStack();
  mc.layoutVertically();
  mc.backgroundColor=C.card;
  mc.cornerRadius=14;
  mc.setPadding(5,9,5,9);

  const mch=mc.addStack();
  mch.centerAlignContent();
  mt=mch.addText("予定");
  mt.font=Font.boldSystemFont(12);
  mt.textColor=C.text;

  const mediumDeadline=actionableDeadlines.length?actionableDeadlines[0]:null;
  const mediumScheduleRows=scheduleRows.slice(0,mediumDeadline?3:4);

  if(!mediumScheduleRows.length){
    mch.addSpacer();
    mt=mch.addText("予定なし");
    mt.font=Font.systemFont(8);
    mt.textColor=C.gray;
  }

  mc.addSpacer(4);

  mediumScheduleRows.forEach((it,i)=>{
    const line=mc.addStack();
    line.centerAlignContent();

    const prev=i>0?mediumScheduleRows[i-1]:null;
    const repeatDay=prev&&sameCalendarDay(prev.date,it.date);

    const db=line.addStack();
    db.size=new Size(31,0);
    let x=db.addText(repeatDay?"":(it.today?"今日":fmtDate(it.date)));
    x.font=Font.boldSystemFont(10);
    x.textColor=it.today?C.blue:C.text;

    line.addSpacer(3);

    const tb=line.addStack();
    tb.size=new Size(36,0);
    x=tb.addText(fmtTime(it.date,it.allDay));
    x.font=Font.semiboldSystemFont(9);
    x.textColor=it.today?C.blue:C.sub;

    line.addSpacer(3);

    const ib=line.addStack();
    ib.size=new Size(14,0);
    ib.centerAlignContent();
    if(it.combat){
      x=ib.addText(combatEmoji(it));
      x.font=Font.systemFont(9);
    }else{
      icon(ib,futureIconName(it),futureIconColor(it),9);
    }

    line.addSpacer(4);

    x=line.addText(shorten(compactUpcomingTitle(it),23));
    x.font=(it.combat||it.soccer)?Font.semiboldSystemFont(10):Font.mediumSystemFont(10);
    x.textColor=C.text;
    x.lineLimit=1;

    if(i<mediumScheduleRows.length-1) mc.addSpacer(3);
  });

  if(mediumDeadline){
    mc.addSpacer(5);

    const sep=mc.addStack();
    sep.size=new Size(0,1);
    sep.backgroundColor=C.separator;

    mc.addSpacer(5);

    const dl=mc.addStack();
    dl.centerAlignContent();

    let x=dl.addText("期限");
    x.font=Font.boldSystemFont(9);
    x.textColor=C.red;
    dl.addSpacer(5);

    x=dl.addText(fmtDate(mediumDeadline.date));
    x.font=Font.boldSystemFont(10);
    x.textColor=C.text;
    dl.addSpacer(5);

    x=dl.addText(shorten(mediumDeadline.title,21));
    x.font=Font.mediumSystemFont(10);
    x.textColor=C.text;
    x.lineLimit=1;

    dl.addSpacer();

    x=dl.addText(relativeDay(mediumDeadline.date));
    x.font=Font.boldSystemFont(9);
    x.textColor=deadlineColor(mediumDeadline.date);
  }

  mw.refreshAfterDate=new Date(Date.now()+CFG.refreshMinutes*60*1000);

  if(config.runsInWidget) Script.setWidget(mw);
  else await mw.presentMedium();

  return;
}

const w=new ListWidget();
w.setPadding(5,14,12,14);
w.backgroundColor=C.bg;

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
  t=weatherMeta.addText("↑"+W.max+"°  ↓"+W.min+"°  今日降水"+W.rain+"%");t.font=Font.mediumSystemFont(10);t.textColor=C.sub;
  weatherBox.addSpacer(1);
  const liveMeta=weatherBox.addStack();liveMeta.centerAlignContent();
  const dataHealthy=position.ok&&eventsData.ok&&deadlineData.ok&&upcomingData.ok;
  t=liveMeta.addText("●");t.font=Font.systemFont(8);t.textColor=dataHealthy?C.green:C.orange;liveMeta.addSpacer(3);
  const stateLabel=!position.ok?"予備地点 ":(!dataHealthy?"一部取得失敗 ":"更新 ");
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
w.refreshAfterDate=new Date(Date.now()+CFG.refreshMinutes*60*1000);
if(config.runsInWidget) Script.setWidget(w); else await w.presentLarge();
