// 俺専用ダッシュボード v1.57-github
// Remote main for Scriptable loader.
// IMPORTANT: Script.complete() は loader 側で呼ぶ。

const VERSION = "1.57-github";

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

// The age threshold is a display safety policy, not a forecast-accuracy claim.
const WEATHER_MAX_AGE_MS=90*60*1000;
const WEATHER_FUTURE_TOLERANCE_MS=15*60*1000;
function weatherTimestamp(value,offsetSeconds){
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?$/.exec(String(value||""));
  if(!m||!parseISODate(m[1]+"-"+m[2]+"-"+m[3])||+m[4]>23||+m[5]>59||+(m[6]||0)>59)return null;
  let offset=numberOrNull(offsetSeconds);
  if(m[7]){
    if(m[7]==="Z")offset=0;
    else{
      const tz=/^([+-])(\d{2}):?(\d{2})$/.exec(m[7]);
      if(+tz[2]>14||+tz[3]>59||(+tz[2]===14&&+tz[3]!==0))return null;
      offset=(tz[1]==="-"?-1:1)*(+tz[2]*3600 + +tz[3]*60);
    }
  }
  if(offset===null||!Number.isInteger(offset)||Math.abs(offset)>14*3600)return null;
  const ms=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0))-offset*1000;
  return Number.isFinite(ms)?new Date(ms):null;
}
function weatherFailureText(weather){
  if(weather.stale)return "天気データ古い";
  if(weather.timeUnverified)return "天気時刻不明";
  return "天気を取得できません";
}
async function getWeather(pos){
  const missing={ok:false,partial:true,stale:false,timeUnverified:false,
    temp:null,code:-1,isDay:null,max:null,min:null,rain:null,daily:[],localDate:isoDay(RUN_NOW)};
  try{
    const u="https://api.open-meteo.com/v1/forecast?latitude="+pos.lat+"&longitude="+pos.lon+"&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4";
    const r=new Request(u);r.timeoutInterval=10;const j=await r.loadJSON();
    if(!j||j.error||!j.current)return missing;
    const receivedAt=new Date();
    const rawOffset=numberOrNull(j.utc_offset_seconds);
    const offset=rawOffset!==null&&Number.isInteger(rawOffset)&&Math.abs(rawOffset)<=14*3600?rawOffset:null;
    const localDate=offset===null?isoDay(receivedAt):new Date(receivedAt.getTime()+offset*1000).toISOString().slice(0,10);
    const validAt=weatherTimestamp(j.current.time,offset);
    const ageMs=validAt?receivedAt.getTime()-validAt.getTime():null;
    const stale=ageMs!==null&&ageMs>WEATHER_MAX_AGE_MS;
    const timeUnverified=validAt===null||offset===null||(ageMs!==null&&ageMs < -WEATHER_FUTURE_TOLERANCE_MS);
    const d=j.daily||{};
    const read=(key,i)=>Array.isArray(d[key])?d[key][i]:null;
    const daily=(Array.isArray(d.time)?d.time:[]).map((date,i)=>({
      date,code:numberOrNull(read("weather_code",i)),max:roundedOrNull(read("temperature_2m_max",i)),
      min:roundedOrNull(read("temperature_2m_min",i)),rain:roundedOrNull(read("precipitation_probability_max",i))
    })).filter(day=>parseISODate(day.date));
    const temp=roundedOrNull(j.current.temperature_2m),code=numberOrNull(j.current.weather_code);
    const isDay=j.current.is_day===0?false:j.current.is_day===1?true:null;
    const first=daily.find(day=>day.date===localDate)||{};
    const base=parseISODate(localDate);
    const required=[0,1,2,3].map(n=>daily.find(day=>day.date===isoDay(addDays(base,n))));
    const partial=stale||timeUnverified||isDay===null||required.some(day=>!day||[day.code,day.max,day.min,day.rain].some(x=>x===null));
    return {ok:temp!==null&&code!==null,partial,stale,timeUnverified,temp,code:code===null?-1:code,isDay,
      max:first.max??null,min:first.min??null,rain:first.rain??null,daily,localDate,
      validAt,receivedAt,sourceLocalDate:String(j.current.time||"").slice(0,10)};
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
  if(/[【\[(（]\s*(?:完了|中止|取消|キャンセル|cancelled|canceled)\s*[】\])）]/iu.test(t))return true;
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
    // Only remove known source labels. Match status and class identifiers remain visible.
    v=safeSoccerTitle(v);
  }

  return shorten(v,28);
}

// Unknown suffixes are kept. Important tags go first so narrow rows do not hide them.
function safeSoccerTitle(value){
  const original=normalize(value), labels=[];
  const provider=/^(?:fotmob(?:\.com)?|フットモブ)$/i;
  const important=/^(?:中止|取消|キャンセル|延期|順延|中断|cancelled|canceled|postponed|suspended|U[-\s‐‑–]?\d{1,2}|女子|女子代表|男子|男子代表|women|men|women's|men's)$/i;
  const remember=label=>{
    if(!labels.some(x=>x.toLowerCase()===label.toLowerCase()))labels.push(label);
  };
  const cleaned=original.split(/[|｜]/).map(part=>{
    let text=normalize(part);
    if(provider.test(text))return "";
    if(important.test(text)){remember(text);return "";}
    text=text.replace(/[（(【\[]([^（）()【】\[\]]+)[）)】\]]/gu,(whole,inside)=>{
      const label=normalize(inside);
      if(provider.test(label))return "";
      if(important.test(label)){remember(label);return "";}
      return whole;
    });
    return normalize(text);
  }).filter(Boolean).join(" | ");
  return labels.map(label=>"【"+label+"】").join("")+(cleaned||(!labels.length?original:""));
}

// A fixed-size image avoids text-layout compression of a single emoji in a narrow cell.
// The image is rendered on-device with the system emoji font; it is not a downloaded asset.
const COMBAT_ICON_CACHE=new Map();
function combatIcon(parent,item,size=12){
  const emoji=combatEmoji(item);
  try{
    let image=COMBAT_ICON_CACHE.get(emoji);
    if(!image){
      const ctx=new DrawContext();ctx.size=new Size(32,32);
      ctx.opaque=false;ctx.respectScreenScale=true;
      ctx.setFont(Font.systemFont(24));ctx.setTextColor(new Color("#000000"));
      ctx.setTextAlignedCenter();ctx.drawTextInRect(emoji,new Rect(1,0,30,32));
      image=ctx.getImage();if(!image)throw new Error("Emoji image unavailable");
      COMBAT_ICON_CACHE.set(emoji,image);
    }
    const view=parent.addImage(image);view.imageSize=new Size(size,size);
    view.applyFittingContentMode();return view;
  }catch(_){
    // Retain a visible image marker when offscreen emoji drawing is unavailable.
    return icon(parent,emoji==="🥊"?"figure.boxing":"sportscourt",C.sub,size);
  }
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
    // Stale/undated responses are not presented as a fresh next-three-days forecast.
    const empty={date,code:null,max:null,min:null,rain:null};
    if(!weather.ok||weather.stale||weather.timeUnverified)return empty;
    return (weather.daily||[]).find(day=>day.date===date)||empty;
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
  return {width,compact,top:4,bottom:5,header:44,gap:2,cardPad:4,
    heading:compact?0:13,headingGap:compact?0:1,row:15,divider:3,
    forecastWidth:146,dayWidth:38,timeWidth:44,iconWidth:14,columnGap:3};
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
  else if(weather.stale)issues.push("天気データ古い");
  else if(weather.timeUnverified)issues.push("天気時刻不明");
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
  const mediumRows=scheduleRows.slice(0,footerNeeded?4:5);
  const rowCount=Math.max(1,mediumRows.length);
  const bodyHeight=M.cardPad*2+M.heading+M.headingGap+rowCount*M.row+(footerNeeded?M.divider+M.row:0);
  const budget=M.top+M.header+M.gap+bodyHeight+M.bottom;
  if(M.divider!==3)throw new Error("Medium divider geometry mismatch");
  if(budget>(M.compact?141:155))throw new Error("Medium layout budget exceeded");

  const mw=new ListWidget();mw.setPadding(M.top,10,M.bottom,10);mw.backgroundColor=C.bg;
  mw.url=calendarURL();
  const root=mw.addStack();root.layoutVertically();root.size=new Size(M.width,0);
  const header=fixedRow(root,M.width,M.header);header.topAlignContent();
  const leftWidth=M.width-M.forecastWidth-8;
  const left=header.addStack();left.layoutVertically();left.size=new Size(leftWidth,M.header);left.url=calendarURL();

  // Date and current conditions share the left side; the right side is forecast-only.
  const dateRow=fixedRow(left,leftWidth,30);
  const dateNumber=fixedRow(dateRow,39,30);
  singleText(dateNumber,RUN_NOW.getDate(),Font.boldSystemFont(26),C.text);dateRow.addSpacer(5);
  const dateMeta=dateRow.addStack();dateMeta.layoutVertically();dateMeta.size=new Size(leftWidth-44,26);
  singleText(dateMeta,(RUN_NOW.getMonth()+1)+"月 "+["日","月","火","水","木","金","土"][RUN_NOW.getDay()],Font.semiboldSystemFont(11),C.text);
  singleText(dateMeta,shorten((position.ok?"":"予備 ")+position.city,9),Font.mediumSystemFont(9),C.sub);
  dateRow.addSpacer();
  const current=fixedRow(left,leftWidth,14);
  if(M.compact&&state.label){
    singleText(current,state.label,Font.semiboldSystemFont(10),C.orange);
  }else if(W.ok&&!W.stale&&!W.timeUnverified){
    singleText(current,numberLabel(W.temp)+"°",Font.semiboldSystemFont(11),C.text);current.addSpacer(4);
    icon(current,weatherIcon,C.sub,11);current.addSpacer(4);
    singleText(current,"今日降水"+numberLabel(W.rain)+"%",Font.mediumSystemFont(9),C.sub);
  }else{
    singleText(current,weatherFailureText(W),Font.mediumSystemFont(10),C.orange);
  }
  current.addSpacer();header.addSpacer(8);

  const forecasts=header.addStack();forecasts.size=new Size(M.forecastWidth,M.header);forecasts.topAlignContent();
  forecastGrid(W).forEach((day,i)=>{
    const cell=forecasts.addStack();cell.layoutVertically();cell.size=new Size(46,M.header);
    // Stack text alignment requires spacers, identically on all three lines.
    centeredRow(cell,46,12,row=>singleText(row,forecastDayLabel(day.date),Font.semiboldSystemFont(10),C.sub));
    cell.addSpacer(1);
    centeredRow(cell,46,14,row=>icon(row,weatherInfo(day.code)[1],C.blue,14));
    cell.addSpacer(1);
    centeredRow(cell,46,12,row=>{
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
    head.addSpacer(4);
    singleText(head,"表示 ",Font.mediumSystemFont(8),C.sub);
    const age=head.addDate(fetchedAt);age.applyRelativeStyle();
    age.font=Font.mediumSystemFont(8);age.textColor=C.sub;age.lineLimit=1;age.minimumScaleFactor=1;
    card.addSpacer(M.headingGap);
  }

  // Shared columns apply to both schedule and deadline: when | time/type | content.
  function agendaRow(dayLabel,timeLabel,titleText,dayColor,timeColor,item){
    const row=fixedRow(card,contentWidth,M.row);row.url=calendarURL();

    const d=fixedRow(row,M.dayWidth,M.row);
    singleText(d,dayLabel,Font.semiboldSystemFont(11),dayColor);
    d.addSpacer();

    row.addSpacer(M.columnGap);

    const tm=fixedRow(row,M.timeWidth,M.row);
    singleText(tm,timeLabel,Font.semiboldSystemFont(11),timeColor);
    tm.addSpacer();

    row.addSpacer(M.columnGap);

    const ib=fixedRow(row,M.iconWidth,M.row);
    if(item){
      ib.addSpacer();
      if(item.combat)combatIcon(ib,item,12);
      else icon(ib,futureIconName(item),C.sub,10);
      ib.addSpacer();
    }else{
      ib.addSpacer();
    }

    row.addSpacer(M.columnGap);

    const titleWidth=contentWidth-M.dayWidth-M.timeWidth-M.iconWidth-M.columnGap*3;
    const textBox=fixedRow(row,titleWidth,M.row);
    singleText(textBox,titleText,item&&(item.combat||item.soccer)?Font.semiboldSystemFont(11):Font.mediumSystemFont(11),C.text);
    textBox.addSpacer();
  }

  if(!mediumRows.length){
    const empty=fixedRow(card,contentWidth,M.row);
    const failed=!eventsData.ok||!upcomingData.ok;
    singleText(empty,failed?"予定を取得できません":"直近の予定なし",Font.mediumSystemFont(11),failed?C.orange:C.sub);empty.addSpacer();
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

// LARGE v1.57: dedicated overview surface with readable weather and non-competing freshness.
// Same data/design language as Medium, but uses the extra area for broader context.
const L={width:329,dayWidth:38,timeWidth:44,iconWidth:14,columnGap:3};
const runtime=globalThis.ORE_DASH_RUNTIME||{};
const largeState=mediumState(eventsData,upcomingData,deadlineData,W,position,runtime);
const largeDeadlines=actionableDeadlines.slice(0,2);

const w=new ListWidget();
w.setPadding(5,14,10,14);
w.backgroundColor=C.bg;
w.url=calendarURL();

// OVERVIEW HEADER
const header=w.addStack();header.layoutVertically();header.size=new Size(L.width,0);

// Row 1: place/date on the left, current conditions on the right.
const headerTop=header.addStack();headerTop.centerAlignContent();
const place=headerTop.addStack();place.layoutVertically();

let t=place.addText((position.ok?"":"予備 ")+position.city);
t.font=Font.boldSystemFont(18);t.textColor=C.text;t.lineLimit=1;
t=place.addText(todayText());
t.font=Font.mediumSystemFont(10);t.textColor=C.sub;t.lineLimit=1;

headerTop.addSpacer();

if(W.ok&&!W.stale&&!W.timeUnverified){
  const current=headerTop.addStack();current.layoutVertically();

  const currentTop=current.addStack();currentTop.centerAlignContent();
  t=currentTop.addText(numberLabel(W.temp)+"°");
  t.font=Font.boldSystemFont(31);t.textColor=C.text;
  currentTop.addSpacer(6);

  t=currentTop.addText(weatherName);
  t.font=Font.semiboldSystemFont(12);t.textColor=C.sub;
  currentTop.addSpacer(6);
  icon(currentTop,weatherIcon,C.blue,22);

  current.addSpacer(1);

  const currentMeta=current.addStack();currentMeta.centerAlignContent();
  t=currentMeta.addText("↑"+numberLabel(W.max)+"°  ↓"+numberLabel(W.min)+"°  降水"+numberLabel(W.rain)+"%");
  t.font=Font.mediumSystemFont(10);t.textColor=C.sub;

  // Freshness belongs under the current conditions, not beside the three-day forecast.
  current.addSpacer(1);
  const currentHealth=current.addStack();currentHealth.centerAlignContent();
  currentHealth.addSpacer();
  const healthy=!largeState.label;
  t=currentHealth.addText("●");
  t.font=Font.systemFont(7);t.textColor=healthy?C.green:C.orange;
  currentHealth.addSpacer(3);
  if(largeState.label){
    t=currentHealth.addText(shorten(largeState.label,10));
    t.font=Font.systemFont(8);t.textColor=C.orange;t.lineLimit=1;
  }else{
    t=currentHealth.addText("表示 ");
    t.font=Font.systemFont(8);t.textColor=C.gray;
    const age=currentHealth.addDate(fetchedAt);age.applyRelativeStyle();
    age.font=Font.systemFont(8);age.textColor=C.gray;age.lineLimit=1;age.minimumScaleFactor=1;
  }
}else{
  t=headerTop.addText(weatherFailureText(W));
  t.font=Font.semiboldSystemFont(10);t.textColor=C.orange;
}

header.addSpacer(6);

// Row 2: each future day gets its own cell. Large uses its extra vertical room for legibility.
const forecastRow=header.addStack();forecastRow.size=new Size(L.width,48);
const forecastDays=forecastGrid(W);

forecastDays.forEach((day,i)=>{
  const cell=forecastRow.addStack();cell.layoutVertically();
  cell.size=new Size(96,48);

  const dayLine=cell.addStack();dayLine.centerAlignContent();
  dayLine.addSpacer();
  let label=dayLine.addText(forecastDayLabel(day.date));
  label.font=Font.semiboldSystemFont(10);label.textColor=C.sub;label.lineLimit=1;
  dayLine.addSpacer();

  cell.addSpacer(2);

  const wxLine=cell.addStack();wxLine.centerAlignContent();
  wxLine.addSpacer();
  icon(wxLine,weatherInfo(day.code)[1],C.blue,16);
  wxLine.addSpacer(7);
  let hi=wxLine.addText(numberLabel(day.max));
  hi.font=Font.boldSystemFont(11);hi.textColor=C.red;
  let slash=wxLine.addText("/");
  slash.font=Font.mediumSystemFont(10);slash.textColor=C.gray;
  let lo=wxLine.addText(numberLabel(day.min));
  lo.font=Font.boldSystemFont(11);lo.textColor=C.blue;
  wxLine.addSpacer();

  if(i<forecastDays.length-1)forecastRow.addSpacer(4);
});

forecastRow.addSpacer();

w.addSpacer(4);

// SCHEDULE: six-row overview, using the same when | time | icon | content grammar as Medium.
const scheduleCard=mkCard(w);
scheduleCard.size=new Size(L.width,0);
scheduleCard.setPadding(8,12,8,12);

const sh=scheduleCard.addStack();sh.centerAlignContent();
let sht=sh.addText("予定");
sht.font=Font.boldSystemFont(13);
sht.textColor=C.text;
sh.addSpacer();

const schedulePartial=!eventsData.ok||!upcomingData.ok;
if(schedulePartial){
  const st=sh.addText("一部取得失敗");
  st.font=Font.systemFont(8);st.textColor=C.orange;
}
scheduleCard.addSpacer(5);

if(!scheduleRows.length){
  const empty=scheduleCard.addText(schedulePartial?"予定を取得できません":"直近の予定なし");
  empty.font=Font.mediumSystemFont(11);
  empty.textColor=schedulePartial?C.orange:C.sub;
}else{
  scheduleRows.forEach((it,i)=>{
    const line=scheduleCard.addStack();line.centerAlignContent();
    const repeatDay=i>0&&sameCalendarDay(scheduleRows[i-1].date,it.date);

    const dayBox=line.addStack();dayBox.size=new Size(L.dayWidth,0);
    let day=dayBox.addText(repeatDay?"":(it.today?"今日":timelineDay(it.date)));
    day.font=Font.semiboldSystemFont(11);
    day.textColor=it.today?C.blue:C.text;
    day.lineLimit=1;

    line.addSpacer(L.columnGap);

    const timeBox=line.addStack();timeBox.size=new Size(L.timeWidth,0);
    let time=timeBox.addText(fmtTime(it.date,it.allDay));
    time.font=Font.semiboldSystemFont(10);
    time.textColor=it.today?C.blue:C.sub;
    time.lineLimit=1;

    line.addSpacer(L.columnGap);

    const iconBox=line.addStack();iconBox.size=new Size(L.iconWidth,0);iconBox.centerAlignContent();
    if(it.combat) combatIcon(iconBox,it,12);
    else icon(iconBox,futureIconName(it),C.sub,10);

    line.addSpacer(L.columnGap);

    let title=line.addText(compactUpcomingTitle(it));
    title.font=(it.combat||it.soccer)?Font.semiboldSystemFont(12):Font.mediumSystemFont(12);
    title.textColor=C.text;
    title.lineLimit=1;

    if(i<scheduleRows.length-1){
      const next=scheduleRows[i+1];
      scheduleCard.addSpacer(next&&!sameCalendarDay(it.date,next.date)?6:3);
    }
  });
}

w.addSpacer(6);

// DEADLINES: Large intentionally shows two. More belongs in Calendar, not on the home screen.
const deadlineCard=mkCard(w);
deadlineCard.size=new Size(L.width,0);
deadlineCard.setPadding(9,12,9,12);

const dh=deadlineCard.addStack();dh.centerAlignContent();
let dht=dh.addText("重要期限");
dht.font=Font.boldSystemFont(13);
dht.textColor=C.text;
dh.addSpacer();

if(deadlineData.ok&&actionableDeadlines.length>largeDeadlines.length){
  const more=dh.addText("直近2件");
  more.font=Font.systemFont(8);more.textColor=C.gray;
}
deadlineCard.addSpacer(6);

if(!deadlineData.ok){
  t=deadlineCard.addText("取得失敗");
  t.font=Font.mediumSystemFont(11);t.textColor=C.orange;
}else if(!largeDeadlines.length){
  t=deadlineCard.addText("30日以内の重要期限なし");
  t.font=Font.mediumSystemFont(11);t.textColor=C.sub;
}else{
  largeDeadlines.forEach((it,i)=>{
    const urgency=deadlineColor(it.date);

    const meta=deadlineCard.addStack();meta.centerAlignContent();

    let dot=meta.addText("●");
    dot.font=Font.systemFont(9);dot.textColor=urgency;
    meta.addSpacer(6);

    let date=meta.addText(timelineDay(it.date));
    date.font=Font.boldSystemFont(11);date.textColor=urgency;

    meta.addSpacer();

    let rel=meta.addText(relativeDay(it.date));
    rel.font=Font.boldSystemFont(10);rel.textColor=urgency;

    deadlineCard.addSpacer(2);

    let title=deadlineCard.addText(it.title);
    title.font=Font.mediumSystemFont(11);
    title.textColor=C.text;
    title.lineLimit=2;

    if(i<largeDeadlines.length-1) deadlineCard.addSpacer(8);
  });
}

w.addSpacer();
w.refreshAfterDate=nextRefresh();
console.log("[dashboard] "+VERSION+" large; loader="+(runtime.codeSource||"unknown")+"; "+largeState.issues.join(","));
if(config.runsInWidget) Script.setWidget(w); else await w.presentLarge();
