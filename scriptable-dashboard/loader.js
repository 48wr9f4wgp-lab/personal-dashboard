// 俺専用ダッシュボード Loader v1.3
// 既存の ORE_DASH_CONFIG（個人設定）は端末内に残す。公開Repoへ転記しない。
globalThis.ORE_DASH_CONFIG = globalThis.ORE_DASH_CONFIG || {};

const REMOTE = "https://raw.githubusercontent.com/48wr9f4wgp-lab/personal-dashboard/main/scriptable-dashboard/main.js";
const fm = FileManager.local();
const dir = fm.joinPath(fm.documentsDirectory(), "ore-dashboard-loader");
const cachePath = fm.joinPath(dir, "main.lastgood.js");
if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
function codeVersion(code){const m=/const VERSION\s*=\s*"([^"\n]+)"/.exec(code);return m?m[1]:"unknown";}
function supportsRuntimeState(code){
  const m=/^(\d+)\.(\d+)/.exec(codeVersion(code));
  return !!m && (+m[1]>1 || (+m[1]===1 && +m[2]>=50));
}
async function runCode(code,source){
  globalThis.ORE_DASH_RUNTIME={loaderVersion:"1.3",codeSource:source,version:codeVersion(code)};
  await new AsyncFunction(code)();
}
async function showError(title,detail){
  const w=new ListWidget();w.setPadding(14,14,14,14);
  w.backgroundColor=Color.dynamic(new Color("#F2F2F7"),new Color("#0B0B0D"));
  let t=w.addText(title);t.font=Font.boldSystemFont(13);
  t.textColor=Color.dynamic(new Color("#C62828"),new Color("#FF453A"));
  w.addSpacer(5);t=w.addText(detail);t.font=Font.mediumSystemFont(11);t.lineLimit=4;
  t.textColor=Color.dynamic(new Color("#6E6E73"),new Color("#A1A1AA"));
  w.url=URLScheme.forRunningScript();
  if(config.runsInWidget)Script.setWidget(w);
  else{
    const q=typeof args!=="undefined"?args.queryParameters||{}:{};
    const family=q.family||(globalThis.ORE_DASH_CONFIG.cfg||{}).previewFamily||"medium";
    if(family==="large")await w.presentLarge();else await w.presentMedium();
  }
}
try{
  const req=new Request(REMOTE+"?ts="+Date.now());req.timeoutInterval=12;
  const code=await req.loadString();new AsyncFunction(code);
  await runCode(code,"network");
  // Saving the cache must not roll back an already successful render.
  try{fm.writeString(cachePath,code);}catch(_){}
}catch(error){
  console.warn("Dashboard remote load failed: "+String(error));
  if(fm.fileExists(cachePath)){
    const cached=fm.readString(cachePath);
    if(supportsRuntimeState(cached)){
      try{await runCode(cached,"lastGood");}
      catch(_){await showError("ダッシュボード起動失敗","通信または実行に失敗しました。タップして再実行してください。");}
    }else{
      // Older renderers cannot disclose fallback state. Do not show them as if current.
      await showError("最新版を取得できません","保存版 v"+codeVersion(cached)+" は更新状態を表示できません。保存版は保持しています。タップして再実行してください。");
    }
  }else{
    await showError("初回取得に失敗","保存版はまだありません。通信を確認し、タップして再実行してください。");
  }
}
Script.complete();
