// 俺専用ダッシュボード Loader v1.4
// 既存の ORE_DASH_CONFIG（個人設定）は端末内に残す。公開Repoへ転記しない。
globalThis.ORE_DASH_CONFIG = globalThis.ORE_DASH_CONFIG || {};

const REMOTE = "https://raw.githubusercontent.com/48wr9f4wgp-lab/personal-dashboard/main/scriptable-dashboard/main.js";
const fm = FileManager.local();
const dir = fm.joinPath(fm.documentsDirectory(), "ore-dashboard-loader");
const cachePath = fm.joinPath(dir, "main.lastgood.js");
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
function codeVersion(code){const m=/const VERSION\s*=\s*"([^"\n]+)"/.exec(code);return m?m[1]:"unknown";}
function supportsRuntimeState(code){
  const m=/^(\d+)\.(\d+)/.exec(codeVersion(code));
  return !!m && (+m[1]>1 || (+m[1]===1 && +m[2]>=50));
}
function supportsRenderReceipt(code){
  const m=/^(\d+)\.(\d+)/.exec(codeVersion(code));
  return !!m && (+m[1]>1 || (+m[1]===1 && +m[2]>=75));
}
async function runCode(code,source){
  // New downloads must explicitly confirm successful rendering. Parsing alone
  // accepts empty, comment-only and silently truncated JavaScript as valid code.
  if(typeof code!=="string"||!code.trim()||!supportsRuntimeState(code))throw new Error("Invalid dashboard code");
  if(source==="network"&&!supportsRenderReceipt(code))throw new Error("Dashboard update needs render receipt");
  globalThis.ORE_DASH_RUNTIME={loaderVersion:"1.4",codeSource:source,version:codeVersion(code)};
  const result=await new AsyncFunction(code)();
  if(source==="network"||supportsRenderReceipt(code)){
    if(!result||result.dashboard!=="ore-dashboard"||result.version!==codeVersion(code)||result.rendered!==true)
      throw new Error("Dashboard did not confirm rendering");
  }
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
  try{
    if(!fm.fileExists(dir))fm.createDirectory(dir,true);
    fm.writeString(cachePath,code);
  }catch(_){}
}catch(error){
  console.warn("Dashboard remote load failed: "+String(error));
  try{
    if(fm.fileExists(cachePath)){
      const cached=fm.readString(cachePath);
      if(supportsRuntimeState(cached)){
        // Existing v1.50–1.74 last-good caches predate receipts. They are usable
        // offline, but never accepted as a new download or promoted again here.
        await runCode(cached,"lastGood");
      }else{
        await showError("最新版を取得できません","保存版 v"+codeVersion(cached)+" は更新状態を表示できません。保存版は保持しています。タップして再実行してください。");
      }
    }else{
      await showError("初回取得に失敗","保存版はまだありません。通信を確認し、タップして再実行してください。");
    }
  }catch(_){
    await showError("ダッシュボード起動失敗","保存版の読み込みまたは実行に失敗しました。通信を確認し、タップして再実行してください。");
  }
}finally{
  Script.complete();
}
