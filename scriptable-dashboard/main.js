// 俺専用ダッシュボード v1.79-github
// Remote main for Scriptable loader.
// IMPORTANT: Script.complete() は loader 側で呼ぶ。

const VERSION = "1.79-github";

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

// Bounds the await, not the native GPS operation. Late completion never rewrites a widget.
// Timer uses milliseconds: https://docs.scriptable.app/timer/
function boundedCall(start,milliseconds){
  return new Promise(resolve=>{
    let settled=false,timer=null;
    const finish=result=>{
      if(settled)return;settled=true;
      try{if(timer)timer.invalidate();}catch(_){}
      resolve(result);
    };
    try{
      if(typeof Timer==="undefined"||typeof Timer.schedule!=="function"){
        finish({ok:false,reason:"timer-unavailable"});return;
      }
      timer=Timer.schedule(milliseconds,false,()=>finish({ok:false,reason:"timeout"}));
      Promise.resolve().then(start).then(value=>finish({ok:true,value}),()=>finish({ok:false,reason:"failed"}));
    }catch(_){finish({ok:false,reason:"failed"});}
  });
}
async function getPosition(){
  const fallback=reason=>({ok:false,cityOK:false,city:normalize(CFG.fallbackCity)||"予備地点",
    lat:coordinateOrNull(CFG.fallbackLat,-90,90),lon:coordinateOrNull(CFG.fallbackLon,-180,180),reason});
  const result=await boundedCall(()=>{
    Location.setAccuracyToThreeKilometers();return Location.current();
  },4000);
  if(!result.ok)return fallback(result.reason);
  const loc=result.value||{},lat=coordinateOrNull(loc.latitude,-90,90),lon=coordinateOrNull(loc.longitude,-180,180);
  if(lat===null||lon===null)return fallback("invalid-coordinates");
  const geocode=await boundedCall(()=>Location.reverseGeocode(lat,lon,"ja_JP"),2000);
  const place=geocode.ok&&Array.isArray(geocode.value)?geocode.value[0]:null;
  const city=place&&((typeof place.locality==="string"?normalize(place.locality):"")||(typeof place.subLocality==="string"?normalize(place.subLocality):""));
  return {ok:true,cityOK:!!city,city:city||"現在地・地名不明",lat,lon,reason:city?"":"geocode-unavailable"};
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
function dailyRainLabel(weather){
  const rain=precipitationProbabilityOrNull(weather.rain);
  return rain===null?"今日降水不明":"今日降水"+Math.round(rain)+"%";
}
function scheduleFailureText(events,future){
  if(!events.ok&&!future.ok)return "予定を取得できません";
  if(!events.ok)return "今日の予定を取得できません";
  if(!future.ok)return "明日以降の予定を取得できません";
  return "";
}
function renderReceipt(){
  // Loader v1.4 only saves code after the widget or preview was actually produced.
  // Older installed loaders can keep running this main without modification.
  return {dashboard:"ore-dashboard",version:VERSION,rendered:true};
}
async function getWeather(pos){
  const missing={ok:false,partial:true,stale:false,timeUnverified:false,
    temp:null,code:-1,isDay:null,currentPrecip:null,currentRain:null,currentShowers:null,currentSnowfall:null,
    max:null,min:null,rain:null,daily:[],localDate:isoDay(RUN_NOW),sourceTime:"",apiLat:null,apiLon:null};
  try{
    if(coordinateOrNull(pos.lat,-90,90)===null||coordinateOrNull(pos.lon,-180,180)===null)return missing;
    const u="https://api.open-meteo.com/v1/forecast?latitude="+pos.lat+"&longitude="+pos.lon+"&current=temperature_2m,weather_code,is_day,precipitation,rain,showers,snowfall&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7&cell_selection=nearest";
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
    const daily=(Array.isArray(d.time)?d.time:[]).map((date,i)=>{
      const code=weatherCodeOrNull(read("weather_code",i));
      const max=temperatureOrNull(read("temperature_2m_max",i));
      const min=temperatureOrNull(read("temperature_2m_min",i));
      const rain=precipitationProbabilityOrNull(read("precipitation_probability_max",i));
      const coherent=max!==null&&min!==null&&max>=min;
      return {date,code,max:coherent?Math.round(max):null,min:coherent?Math.round(min):null,
        rain:rain===null?null:Math.round(rain)};
    }).filter(day=>parseISODate(day.date));
    const tempRaw=temperatureOrNull(j.current.temperature_2m);
    const temp=tempRaw===null?null:Math.round(tempRaw),code=weatherCodeOrNull(j.current.weather_code);
    const isDay=j.current.is_day===0?false:j.current.is_day===1?true:null;
    const currentPrecip=precipitationAmountOrNull(j.current.precipitation);
    const currentRain=precipitationAmountOrNull(j.current.rain);
    const currentShowers=precipitationAmountOrNull(j.current.showers);
    const currentSnowfall=precipitationAmountOrNull(j.current.snowfall);
    const first=daily.find(day=>day.date===localDate)||{};
    const base=parseISODate(localDate);
    const required=[0,1,2,3].map(n=>daily.find(day=>day.date===isoDay(addDays(base,n))));
    const partial=stale||timeUnverified||required.some(day=>!day||[day.code,day.max,day.min,day.rain].some(x=>x===null));
    return {ok:temp!==null&&code!==null,partial,stale,timeUnverified,temp,code:code===null?-1:code,isDay,
      currentPrecip,currentRain,currentShowers,currentSnowfall,
      max:first.max??null,min:first.min??null,rain:first.rain??null,daily,localDate,
      validAt,receivedAt,sourceTime:String(j.current.time||""),sourceLocalDate:String(j.current.time||"").slice(0,10),
      apiLat:coordinateOrNull(j.latitude,-90,90),apiLon:coordinateOrNull(j.longitude,-180,180)};
  }catch(_){return missing;}
}

function weatherInfo(code){
  if(code===0)return ["快晴","sun.max.fill"];
  if(code===1)return ["晴れ","cloud.sun.fill"];
  if(code===2)return ["一部曇り","cloud.sun.fill"];
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
    // Use the same calendar-day snapshot as the header and upcoming query.
    // A slow location request can cross midnight before this read starts.
    const list=await CalendarEvent.between(dayStart(now),addDays(dayStart(now),1));
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
      new RegExp("(^|[^0-9])"+m+"\\/"+d+"(?![0-9])\\s*"),
      new RegExp("(^|[^0-9])"+m+"月"+d+"日\\s*")
    ];
    for(const p of patterns) v=v.replace(p,"$1");
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
        allDay:e.isAllDay===true,
        hasTime:e.isAllDay===false,
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
  if(e.isAllDay===true)return true;
  if(e.isAllDay===false)return false;

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
        endDate:new Date(e.endDate),
        allDay:isAllDayLikeEvent(e),
        source:"予定",
        kind:"予定",
        color:C.blue,
        combat:isCombatEvent(title,calendarTitle),
        soccer:isSoccerEvent(title,calendarTitle,e.notes)
      });
    }
  }catch(_){calendarOK=false;}

  if(ann && ann.date>=dayStart(now) && ann.date<end){
    out.push({
      title:"結婚記念日",
      date:ann.date,
      allDay:true,
      today:sameCalendarDay(ann.date,now),
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

// Both sizes preserve status/class/year and unknown suffixes before native ellipsis.
function eventDisplayTitle(item){
  let title=stripLeadingSportEmoji(item.title).replace(/[\uFE0E\uFE0F\uFFFD]/g,"").trim();
  if(item.soccer||item.combat)title=safeSoccerTitle(title);
  if(item.combat)title=title.replace(/\bK[- ]?1\s+WORLD\s+(?:GRAND\s+PRIX|GP)\b/gi,"K-1 WGP");
  return title;
}
function compactUpcomingTitle(item){return eventDisplayTitle(item);}

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
function boundedNumberOrNull(value,min,max){
  const n=numberOrNull(value);
  return n!==null&&n>=min&&n<=max?n:null;
}
const WMO_WEATHER_CODES=new Set([0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
function weatherCodeOrNull(value){
  const n=numberOrNull(value);
  return n!==null&&Number.isInteger(n)&&WMO_WEATHER_CODES.has(n)?n:null;
}
function temperatureOrNull(value){return boundedNumberOrNull(value,-100,70);}
function precipitationProbabilityOrNull(value){return boundedNumberOrNull(value,0,100);}
function precipitationAmountOrNull(value){return boundedNumberOrNull(value,0,1000);}
function coordinateOrNull(value,min,max){return boundedNumberOrNull(value,min,max);}
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
function currentWeatherInfo(weather){
  const parsedCode=weatherCodeOrNull(weather&&weather.code);
  const code=parsedCode===null?-1:parsedCode;
  // Preserve the provider's weather code, including thunderstorm and freezing-rain states.
  // Precipitation/snowfall are interval totals, not a second instantaneous observation.
  // Keep those values for diagnostics; never use them or daily probability to overwrite the code.
  // Reference: https://open-meteo.com/en/docs (weather_code vs precipitation time aggregation).

  const info=weatherInfo(code);
  if([0,1,2].includes(code)&&weather&&weather.isDay!==true&&weather.isDay!==false)
    return [info[0],"circle.dotted",code,"day-night-unknown"];
  if(weather&&weather.isDay===false&&code===0)return [info[0],"moon.stars.fill",code,"weather-code"];
  if(weather&&weather.isDay===false&&[1,2].includes(code))return [info[0],"cloud.moon.fill",code,"weather-code"];
  return [info[0],info[1],code,"weather-code"];
}
function deadlineHasTime(item){return !!item&&item.hasTime===true;}
function deadlineTimeElapsed(item,now=STATUS_NOW){return deadlineHasTime(item)&&+item.date<=+now;}
function deadlineCountdown(item,now=STATUS_NOW){
  const days=daysBetween(now,item.date);
  if(!deadlineHasTime(item))return days===0?"今日締切":days===1?"明日締切":relativeDay(item.date);
  const time=fmtTime(item.date);
  if(deadlineTimeElapsed(item,now))return time+"締切経過";
  return (days===0?"今日":days===1?"明日":"あと"+days+"日 ")+time+"締切";
}
function mediumDeadlineTitle(item){
  if(!deadlineHasTime(item))return item.title;
  return (deadlineTimeElapsed(item)?"【締切経過】":"【締切】")+item.title;
}
function agendaPresentation(item,previous=null,now=STATUS_NOW){
  const start=item.date,end=item.endDate,hasEnd=end instanceof Date&&Number.isFinite(+end)&&+end>+start;
  let title=eventDisplayTitle(item);
  const ongoing=hasEnd&&!item.allDay&&+start<=+now&&+end>+now;
  const carryAllDay=hasEnd&&item.allDay&&+start<+dayStart(now)&&+end>+now;
  if(ongoing){
    const fromEarlierDay=+start<+dayStart(now);
    const endLabel=sameCalendarDay(end,now)?"終了":""+fmtDate(end)+"終了";
    title=endLabel+"｜"+(fromEarlierDay?fmtDate(start)+"開始｜":"")+title;
    return {day:fromEarlierDay?"継続中":"進行中",time:fmtTime(end),title};
  }
  if(carryAllDay){
    // All-day end is exclusive. Show the stored span, without inventing a clock time.
    title=fmtDate(start)+"～"+fmtDate(new Date(+end-1))+"｜"+title;
    return {day:"継続中",time:"終日",title};
  }
  const previousOngoing=previous&&previous.endDate instanceof Date&&+previous.date<=+now&&+previous.endDate>+now&&
    (!previous.allDay||+previous.date<+dayStart(now));
  const repeated=previous&&!previousOngoing&&sameCalendarDay(previous.date,start);
  return {day:repeated?"":timelineDay(start,now),time:fmtTime(start,item.allDay),title};
}
function weatherTint(code,isDay=true){
  if([0,1,2].includes(code))return isDay===false?C.purple:isDay===true?C.orange:C.gray;
  if([3,45,48].includes(code))return C.gray;
  if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return C.blue;
  if([71,73,75,77,85,86].includes(code))return Color.dynamic(new Color("#32ADE6"),new Color("#64D2FF"));
  if([95,96,99].includes(code))return C.purple;
  return C.gray;
}
function mediumWeatherStamp(weather){
  if(!weather.ok||weather.stale||weather.timeUnverified)return "";
  return "天気 "+(weatherAsOfLabel(weather)||"時刻不明")+
    (weather.isDay===null?"・昼夜不明":"");
}

function weatherAsOfLabel(weather){
  const m=/T(\d{2}:\d{2})/.exec(String(weather&&weather.sourceTime||""));
  return m?m[1]+"推定":"";
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
  const now=new Date();
  // refreshAfterDate is a request to iOS, not a guaranteed execution time.
  if(!sameCalendarDay(RUN_NOW,now))return now;
  const minutes=numberOrNull(CFG.refreshMinutes);
  const boundaries=[...actionableDeadlines.filter(deadlineHasTime).map(item=>+item.date),
    ...scheduleRows.filter(item=>!item.allDay).flatMap(item=>[+item.date,+item.endDate])]
    .filter(time=>Number.isFinite(time)&&time>+now);
  return new Date(Math.min(now.getTime()+Math.max(1,minutes===null?15:minutes)*60000,
    addDays(dayStart(now),1).getTime(),...boundaries));
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
  else if(position.cityOK===false)issues.push("地名未取得");
  if(!weather.ok)issues.push("天気未取得");
  else if(weather.stale)issues.push("天気データ古い");
  else if(weather.timeUnverified)issues.push("天気時刻不明");
  else if(weather.partial)issues.push("予報一部未取得");
  if(weather.ok&&weather.isDay===null)issues.push("昼夜不明");
  if(runtime.codeSource==="lastGood")issues.push("前回コード");
  return {issues,label:issues.length>1?"一部未取得":(issues[0]||"")};
}

const fetchedAt=new Date(RUN_NOW);
// Calendar reads do not depend on GPS/geocoding and start immediately.
const eventsPromise=getEvents(),deadlinePromise=getImportantDeadlines();
const ann=anniversary(),upcomingPromise=getUpcomingNext(ann);
const positionPromise=getPosition(),weatherPromise=positionPromise.then(pos=>getWeather(pos));
const [position,W,eventsData,deadlineData,upcomingData]=await Promise.all([
  positionPromise,weatherPromise,eventsPromise,deadlinePromise,upcomingPromise
]);
const upcoming7=upcomingData.items;
// Keep the calendar-day snapshot across midnight, but do not miss a same-day
// deadline or ending boundary crossed while native requests were outstanding.
const renderedAt=new Date();
const STATUS_NOW=sameCalendarDay(RUN_NOW,renderedAt)?renderedAt:RUN_NOW;

const todaySchedule=eventsData.items.filter(e=>isAllDayLikeEvent(e)||+new Date(e.endDate)>+STATUS_NOW).map(e=>{
  const calendarTitle=calName(e);
  return {
    title:normalize(e.title),
    date:new Date(e.startDate),
    endDate:new Date(e.endDate),
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
  ...upcoming7.filter(it=>it.today),
  ...todaySchedule,
  ...upcoming7.filter(it=>!it.today)
].filter((item,index,items)=>items.findIndex(other=>
  normalize(other.title).toLowerCase()===normalize(item.title).toLowerCase()&&
  other.date.getTime()===item.date.getTime()&&other.allDay===item.allDay)===index);

// Home screen policy: show the next six things, not the size of the backlog.
const scheduleRows=allScheduleRows.slice(0,6);

// Deadlines only earn home-screen space when they are actionable soon.
// Far-future deadlines stay in Calendar and naturally surface as they approach.
const actionableDeadlines=deadlineData.items.filter(it=>{
  const days=daysBetween(RUN_NOW,it.date);
  return days>=0 && days<=CFG.deadlineDisplayDays;
});
const shownDeadlines=actionableDeadlines.slice(0,CFG.deadlineMaxItems);

const [weatherName,weatherIcon,weatherDisplayCode,weatherDisplayReason]=currentWeatherInfo(W);

// MEDIUM v1.79: preserve geometry while exposing data time and event state.
if(resolveFamily()==="medium"){
  const M=mediumMetrics();
  const runtime=globalThis.ORE_DASH_RUNTIME||{};
  const state=mediumState(eventsData,upcomingData,deadlineData,W,position,runtime);
  const mediumWeatherUsable=W.ok&&!W.stale&&!W.timeUnverified;
  const mediumForecastDays=forecastGrid(W);
  const mediumForecastUsable=mediumWeatherUsable&&!W.partial&&mediumForecastDays.every(day=>
    day&&day.code!==null&&day.max!==null&&day.min!==null);
  const codeSourceWarning=runtime.codeSource==="lastGood"?"前回コード":runtime.codeSource==="network"?"":"取得元不明";
  const dataIssues=state.issues.filter(issue=>issue!=="前回コード");
  const dataLabel=dataIssues.length>1?"一部未取得":(dataIssues[0]||"");
  const mediumDeadline=actionableDeadlines[0]||null;
  const footerNeeded=!!mediumDeadline||!deadlineData.ok;
  const scheduleWarning=scheduleFailureText(eventsData,upcomingData);
  // A failed Calendar read uses one existing row, rather than growing the widget
  // or hiding the failure behind a last-good-code badge.
  const mediumRows=scheduleRows.slice(0,(footerNeeded?4:5)-(scheduleWarning?1:0));
  const rowCount=Math.max(1,mediumRows.length+(scheduleWarning?1:0));
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
  if(M.compact&&codeSourceWarning){
    singleText(current,codeSourceWarning,Font.semiboldSystemFont(10),C.orange);
  }else if(M.compact&&dataLabel){
    singleText(current,dataLabel,Font.semiboldSystemFont(10),C.orange);
  }else if(mediumWeatherUsable){
    singleText(current,numberLabel(W.temp)+"°",Font.semiboldSystemFont(11),C.text);current.addSpacer(4);
    icon(current,weatherIcon,weatherTint(weatherDisplayCode,W.isDay),11);current.addSpacer(4);
    // Compact mode prioritizes the model timestamp over daily rain probability.
    singleText(current,M.compact?mediumWeatherStamp(W):dailyRainLabel(W),Font.mediumSystemFont(M.compact?8:9),W.rain===null?C.orange:C.sub);
  }else{
    singleText(current,weatherFailureText(W),Font.mediumSystemFont(10),C.orange);
  }
  current.addSpacer();header.addSpacer(8);

  const forecasts=header.addStack();forecasts.size=new Size(M.forecastWidth,M.header);forecasts.topAlignContent();
  if(mediumForecastUsable){
    mediumForecastDays.forEach((day,i)=>{
      const cell=forecasts.addStack();cell.layoutVertically();cell.size=new Size(46,M.header);
      // Stack text alignment requires spacers, identically on all three lines.
      centeredRow(cell,46,12,row=>singleText(row,forecastDayLabel(day.date),Font.semiboldSystemFont(10),C.sub));
      cell.addSpacer(1);
      centeredRow(cell,46,14,row=>icon(row,weatherInfo(day.code)[1],weatherTint(day.code),14));
      cell.addSpacer(1);
      centeredRow(cell,46,12,row=>{
        singleText(row,numberLabel(day.max),Font.semiboldSystemFont(10),C.red);
        singleText(row,"/",Font.mediumSystemFont(9),C.gray);
        singleText(row,numberLabel(day.min),Font.semiboldSystemFont(10),C.blue);
      });
      if(i<2)forecasts.addSpacer(4);
    });
  }else{
    // Forecast space remains useful when no trustworthy forecast is available.
    // This also keeps weather errors visible in compact mode with a code warning.
    const forecastStatus=forecasts.addStack();forecastStatus.layoutVertically();
    forecastStatus.size=new Size(M.forecastWidth,M.header);
    forecastStatus.addSpacer();
    const warning=forecastStatus.addText(mediumWeatherUsable?"予報一部未取得":weatherFailureText(W));
    warning.font=Font.mediumSystemFont(10);warning.textColor=C.orange;
    warning.lineLimit=2;warning.minimumScaleFactor=1;
    forecastStatus.addSpacer();
  }
  root.addSpacer(M.gap);

  const card=root.addStack();card.layoutVertically();card.size=new Size(M.width,bodyHeight);
  card.backgroundColor=C.card;card.cornerRadius=12;card.setPadding(M.cardPad,8,M.cardPad,8);card.url=calendarURL();
  const contentWidth=M.width-16;
  if(!M.compact){
    const head=fixedRow(card,contentWidth,M.heading);
    singleText(head,"予定",Font.boldSystemFont(11),C.text);head.addSpacer();
    if(codeSourceWarning)singleText(head,codeSourceWarning,Font.semiboldSystemFont(9),C.orange);
    else if(dataLabel)singleText(head,dataLabel,Font.semiboldSystemFont(9),C.orange);
    else if(!config.runsInWidget)singleText(head,"v"+VERSION.replace("-github",""),Font.mediumSystemFont(8),C.sub);
    head.addSpacer(4);
    if(mediumWeatherUsable){
      singleText(head,mediumWeatherStamp(W),Font.mediumSystemFont(8),C.sub);
    }else{
      singleText(head,"表示 ",Font.mediumSystemFont(8),C.sub);
      const age=head.addDate(fetchedAt);age.applyRelativeStyle();
      age.font=Font.mediumSystemFont(8);age.textColor=C.sub;age.lineLimit=1;age.minimumScaleFactor=1;
    }
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

  if(scheduleWarning){
    const failed=fixedRow(card,contentWidth,M.row);
    singleText(failed,scheduleWarning,Font.mediumSystemFont(11),C.orange);failed.addSpacer();
  }
  if(!mediumRows.length&&!scheduleWarning){
    const empty=fixedRow(card,contentWidth,M.row);
    const failed=!eventsData.ok||!upcomingData.ok;
    singleText(empty,failed?"予定を取得できません":"直近の予定なし",Font.mediumSystemFont(11),failed?C.orange:C.sub);empty.addSpacer();
  }else{
    mediumRows.forEach((item,i)=>{
      const display=agendaPresentation(item,i>0?mediumRows[i-1]:null);
      agendaRow(display.day,display.time,display.title,item.today?C.blue:C.text,item.today?C.blue:C.sub,item);
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
      agendaRow(timelineDay(mediumDeadline.date),deadlineHasTime(mediumDeadline)?fmtTime(mediumDeadline.date):"期限",mediumDeadlineTitle(mediumDeadline),urgency,urgency,null);
    }
  }
  mw.addSpacer();
  mw.refreshAfterDate=nextRefresh();
  console.log("[dashboard] "+VERSION+" medium; budget="+budget+"pt; loader="+(runtime.codeSource||"unknown")+"; "+state.issues.join(","));
  if(config.runsInWidget)Script.setWidget(mw);else await mw.presentMedium();
  return renderReceipt();
}

// LARGE v1.79: retain v1.78 geometry; share truthful event/weather labels with Medium.
// Keep full time columns, left-aligned deadline text and bounded sparse-state spacing.
const L={width:329,dayWidth:38,timeWidth:44,iconWidth:12,columnGap:3,header:54,row:15,deadlineMeta:14,deadlineTitleMax:28,deadlineGap:4,agendaHeading:16,cardPad:6,gap:4,weekHeight:68};
const runtime=globalThis.ORE_DASH_RUNTIME||{};
const largeState=mediumState(eventsData,upcomingData,deadlineData,W,position,runtime);
const largeDeadlines=actionableDeadlines.slice(0,2);
const largeWeatherUsable=W.ok&&!W.stale&&!W.timeUnverified;
// Use breathing room when fewer deadlines exist; the two-long-deadline budget stays bounded.
const sparseAgenda=largeDeadlines.length<2;
const agendaRowHeight=largeDeadlines.length===0?23:largeDeadlines.length===1?21:L.row;
const agendaSectionGap=sparseAgenda?4:0;
const largeCardGap=sparseAgenda?6:L.gap;
// Design budget, not a measurement of native iOS font shaping or the live widget frame.
const largeAgendaMax=L.cardPad*2+2*(L.deadlineMeta+1+L.deadlineTitleMax)+L.deadlineGap+L.agendaHeading+6*L.row;
const largeBudget=16+L.header+2*L.gap+largeAgendaMax+L.weekHeight;
// A conservative bound for the selected state, including two lines per deadline.
// It is not a native text measurement. Keep the two-long-deadline maximum unchanged.
const deadlineHeightBound=largeDeadlines.length
  ?largeDeadlines.length*(L.deadlineMeta+1+L.deadlineTitleMax)+(largeDeadlines.length-1)*L.deadlineGap:28;
const agendaHeightBound=L.cardPad*2+deadlineHeightBound+agendaSectionGap+L.agendaHeading+Math.max(1,scheduleRows.length)*agendaRowHeight;
const largeCurrentBudget=16+L.header+2*largeCardGap+agendaHeightBound+L.weekHeight;
function largeTextCell(parent,width,height){
  const cell=fixedRow(parent,width,height);
  cell.layoutHorizontally();cell.setPadding(0,0,0,0);cell.spacing=0;
  return cell;
}
function largeWeatherTint(code,isDay=true){return weatherTint(code,isDay);}
function largeDeadlineDate(date){return fmtDate(date)+"（"+["日","月","火","水","木","金","土"][date.getDay()]+"）";}
function largeDeadlineCountdown(item){return deadlineCountdown(item);}
function largeAgendaTitle(item){return eventDisplayTitle(item);}
const w=new ListWidget();w.setPadding(8,14,8,14);w.backgroundColor=C.bg;w.url=calendarURL();
// HEADER: whole date in natural order, with the weather as the right-side headline.
const header=fixedRow(w,L.width,L.header);header.topAlignContent();
const identityWidth=134,headerGap=12,weatherWidth=L.width-identityWidth-headerGap;
const identity=header.addStack();identity.layoutVertically();identity.size=new Size(identityWidth,L.header);
const dateLine=fixedRow(identity,identityWidth,24);
let t=singleText(dateLine,(RUN_NOW.getMonth()+1)+"月"+RUN_NOW.getDate()+"日",Font.semiboldSystemFont(20),C.text);
t.minimumScaleFactor=0.95;dateLine.addSpacer();
const placeLine=fixedRow(identity,identityWidth,17);
singleText(placeLine,["日","月","火","水","木","金","土"][RUN_NOW.getDay()]+"曜日",Font.semiboldSystemFont(14),C.text);
placeLine.addSpacer(7);
const cityBox=fixedRow(placeLine,identityWidth-49,17);
t=singleText(cityBox,(position.ok?"":"予備 ")+position.city,Font.mediumSystemFont(9),C.sub);t.minimumScaleFactor=0.85;cityBox.addSpacer();
if(largeWeatherUsable){
  const asOfLine=fixedRow(identity,identityWidth,13),asOf=weatherAsOfLabel(W);
  singleText(asOfLine,asOf?"天気 "+asOf+(W.isDay===null?"・昼夜不明":""):"天気 時刻不明",Font.mediumSystemFont(9),asOf?C.sub:C.orange);asOfLine.addSpacer();
}
header.addSpacer(headerGap);
const weatherPane=header.addStack();weatherPane.layoutVertically();weatherPane.size=new Size(weatherWidth,L.header);
if(largeWeatherUsable){
  const conditionLine=fixedRow(weatherPane,weatherWidth,27);conditionLine.addSpacer();
  t=singleText(conditionLine,weatherName,Font.boldSystemFont(20),C.text);t.minimumScaleFactor=0.9;
  conditionLine.addSpacer(7);icon(conditionLine,weatherIcon,largeWeatherTint(weatherDisplayCode,W.isDay),25);
  const temperatureLine=fixedRow(weatherPane,weatherWidth,27);temperatureLine.addSpacer();
  singleText(temperatureLine,numberLabel(W.temp)+"°",Font.semiboldSystemFont(22),C.text);temperatureLine.addSpacer(8);
  t=singleText(temperatureLine,"↑"+numberLabel(W.max)+"°  ↓"+numberLabel(W.min)+"°",Font.mediumSystemFont(11),C.sub);t.minimumScaleFactor=0.9;
}else{
  const errorLine=fixedRow(weatherPane,weatherWidth,27);errorLine.addSpacer();
  t=singleText(errorLine,weatherFailureText(W),Font.semiboldSystemFont(10),C.orange);t.minimumScaleFactor=0.9;
}
w.addSpacer(largeCardGap);
// AGENDA: only the common parent has a background; sub-sections are transparent.
const agendaCard=mkCard(w);agendaCard.size=new Size(L.width,0);agendaCard.setPadding(L.cardPad,12,L.cardPad,12);agendaCard.url=calendarURL();
const contentWidth=L.width-24;
const deadlineCard=agendaCard.addStack();deadlineCard.layoutVertically();deadlineCard.size=new Size(contentWidth,0);
if(deadlineData.ok&&largeDeadlines.length){
  largeDeadlines.forEach((item,index)=>{
    const urgency=deadlineColor(item.date),meta=fixedRow(deadlineCard,contentWidth,L.deadlineMeta);
    singleText(meta,largeDeadlineDate(item.date),Font.semiboldSystemFont(11),urgency);
    if(index===0){
      meta.addSpacer(6);singleText(meta,"重要期限",Font.mediumSystemFont(9),C.sub);
      if(actionableDeadlines.length>largeDeadlines.length){meta.addSpacer(4);singleText(meta,"直近2件",Font.mediumSystemFont(8),C.sub);}
    }
    meta.addSpacer();singleText(meta,largeDeadlineCountdown(item),Font.semiboldSystemFont(10),urgency);
    deadlineCard.addSpacer(1);
    const titleBox=largeTextCell(deadlineCard,contentWidth,0);
    t=titleBox.addText(item.title);t.font=Font.mediumSystemFont(11);t.textColor=C.text;t.lineLimit=2;t.minimumScaleFactor=1;
    // WidgetText.leftAlignText() does not position text inside a Stack.
    // A trailing flexible spacer pins this one/two-line label to the leading edge.
    titleBox.addSpacer();
    if(index<largeDeadlines.length-1)deadlineCard.addSpacer(L.deadlineGap);
  });
}else{
  const dh=fixedRow(deadlineCard,contentWidth,14);singleText(dh,"重要期限",Font.mediumSystemFont(11),C.sub);dh.addSpacer();
  singleText(deadlineCard,deadlineData.ok?"30日以内の重要期限なし":"取得失敗",Font.mediumSystemFont(10),deadlineData.ok?C.sub:C.orange);
}
if(agendaSectionGap)agendaCard.addSpacer(agendaSectionGap);
const scheduleCard=agendaCard.addStack();scheduleCard.layoutVertically();scheduleCard.size=new Size(contentWidth,0);
const sh=fixedRow(scheduleCard,contentWidth,L.agendaHeading);
singleText(sh,"予定",Font.semiboldSystemFont(11),C.sub);sh.addSpacer(7);
const sectionRule=sh.addStack();sectionRule.size=new Size(28,1);sectionRule.backgroundColor=C.separator;sh.addSpacer();
const schedulePartial=!eventsData.ok||!upcomingData.ok;
const codeSourceWarning=runtime.codeSource==="lastGood"?"前回コード":runtime.codeSource==="network"?"":"取得元不明";
if(codeSourceWarning){singleText(sh,codeSourceWarning,Font.semiboldSystemFont(9),C.orange);if(schedulePartial)sh.addSpacer(6);}
if(schedulePartial)singleText(sh,"一部取得失敗",Font.mediumSystemFont(8),C.orange);
if(!scheduleRows.length){
  const empty=fixedRow(scheduleCard,contentWidth,agendaRowHeight);
  singleText(empty,schedulePartial?"予定を取得できません":"直近の予定なし",Font.mediumSystemFont(11),schedulePartial?C.orange:C.sub);
}else{
  scheduleRows.forEach((item,index)=>{
    const line=largeTextCell(scheduleCard,contentWidth,agendaRowHeight);line.url=calendarURL();
    const display=agendaPresentation(item,index>0?scheduleRows[index-1]:null),dayBox=largeTextCell(line,L.dayWidth,agendaRowHeight);
    singleText(dayBox,display.day,Font.semiboldSystemFont(10),item.today?C.blue:C.text);
    dayBox.addSpacer();line.addSpacer(L.columnGap);
    const timeBox=largeTextCell(line,L.timeWidth,agendaRowHeight);
    // Reserve 44pt for the complete HH:mm. Equal-width digits avoid time-dependent fit.
    const timeFont=item.allDay?Font.mediumSystemFont(10):Font.mediumMonospacedSystemFont(10);
    singleText(timeBox,display.time,timeFont,item.today?C.blue:C.sub);
    timeBox.addSpacer();line.addSpacer(L.columnGap);
    const iconBox=largeTextCell(line,L.iconWidth,agendaRowHeight);
    if(item.combat)combatIcon(iconBox,item,10);else icon(iconBox,futureIconName(item),C.sub,10);
    line.addSpacer(L.columnGap);
    const titleWidth=contentWidth-L.dayWidth-L.timeWidth-L.iconWidth-L.columnGap*3,titleBox=largeTextCell(line,titleWidth,agendaRowHeight);
    // Emphasis follows timing, not sport/category. Native ellipsis is the last fallback.
    singleText(titleBox,display.title,item.today?Font.semiboldSystemFont(12):Font.mediumSystemFont(12),C.text);titleBox.addSpacer();
  });
}
w.addSpacer(largeCardGap);
// FORECAST: independent six-day context; slightly larger, consistently aligned numbers.
if(largeWeatherUsable){
  const weatherBase=parseISODate(W.localDate)||dayStart(RUN_NOW);
  const weekDays=[0,1,2,3,4,5].map(offset=>{
    const date=isoDay(addDays(weatherBase,offset));return (W.daily||[]).find(day=>day.date===date)||null;
  });
  const weekComplete=weekDays.every(day=>day&&[day.code,day.max,day.min].every(x=>x!==null));
  const weekCard=mkCard(w);weekCard.size=new Size(L.width,0);weekCard.setPadding(5,12,5,12);
  const wh=fixedRow(weekCard,contentWidth,14);singleText(wh,"週間天気",Font.semiboldSystemFont(11),C.sub);wh.addSpacer();
  const rainKnown=numberOrNull(W.rain)!==null&&W.rain>=0&&W.rain<=100;
  singleText(wh,dailyRainLabel(W),Font.mediumSystemFont(9),rainKnown?C.sub:C.orange);
  if(!weekComplete){wh.addSpacer(6);singleText(wh,"一部未取得",Font.mediumSystemFont(8),C.orange);}
  weekCard.addSpacer(2);
  if(weekComplete){
    const grid=weekCard.addStack(),gap=3,cellWidth=(contentWidth-gap*5)/6;
    weekDays.forEach((day,index)=>{
      const cell=grid.addStack();cell.layoutVertically();cell.size=new Size(cellWidth,42);
      const date=parseISODate(day.date),label=index===0?"今日":date.getDate()+["日","月","火","水","木","金","土"][date.getDay()];
      centeredRow(cell,cellWidth,12,row=>singleText(row,label,Font.mediumSystemFont(9),index===0?C.red:C.sub));cell.addSpacer(1);
      centeredRow(cell,cellWidth,16,row=>icon(row,weatherInfo(day.code)[1],largeWeatherTint(day.code),15));cell.addSpacer(1);
      centeredRow(cell,cellWidth,12,row=>{
        singleText(row,numberLabel(day.max),Font.semiboldSystemFont(10),C.red);singleText(row,"/",Font.mediumSystemFont(9),C.sub);singleText(row,numberLabel(day.min),Font.semiboldSystemFont(10),C.blue);
      });
      if(index<weekDays.length-1)grid.addSpacer(gap);
    });
  }else singleText(weekCard,"週間予報を取得できません",Font.mediumSystemFont(10),C.orange);
}
w.addSpacer();w.refreshAfterDate=nextRefresh();
console.log("[weather] source=open-meteo-best-match cell=nearest city="+position.city+
  " requested="+Number(position.lat).toFixed(3)+","+Number(position.lon).toFixed(3)+
  " grid="+(numberOrNull(W.apiLat)===null?"?":Number(W.apiLat).toFixed(3))+","+(numberOrNull(W.apiLon)===null?"?":Number(W.apiLon).toFixed(3))+
  " valid="+String(W.sourceTime||"?")+" code="+W.code+" displayCode="+weatherDisplayCode+
  " reason="+weatherDisplayReason+" precip="+String(W.currentPrecip)+" rain="+String(W.currentRain)+
  " showers="+String(W.currentShowers)+" snow="+String(W.currentSnowfall));
console.log("[dashboard] "+VERSION+" large; budgetMax="+largeBudget+"pt; stateBudgetBound="+largeCurrentBudget+"pt; loader="+(runtime.codeSource||"unknown")+"; "+largeState.issues.join(","));
if(config.runsInWidget)Script.setWidget(w);else await w.presentLarge();
return renderReceipt();