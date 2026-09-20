// 俺専用ダッシュボード Loader v1.2
// 公開GitHubには個人設定を置かない。
// Scriptable側のこのファイルで ORE_DASH_CONFIG を設定して使う。

globalThis.ORE_DASH_CONFIG = globalThis.ORE_DASH_CONFIG || {};

const REMOTE = "https://raw.githubusercontent.com/48wr9f4wgp-lab/personal-dashboard/main/scriptable-dashboard/main.js";
const fm = FileManager.local();
const dir = fm.joinPath(fm.documentsDirectory(), "ore-dashboard-loader");
const cachePath = fm.joinPath(dir, "main.lastgood.js");
if (!fm.fileExists(dir)) fm.createDirectory(dir, true);

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
async function runCode(code){ const fn=new AsyncFunction(code); await fn(); }

function errorWidget(title,detail){
  const w=new ListWidget();w.setPadding(16,16,16,16);
  const t=w.addText(title);t.font=Font.boldSystemFont(14);t.textColor=new Color("#DC2626");
  w.addSpacer(6);
  const d=w.addText(detail);d.font=Font.systemFont(10);d.textColor=new Color("#64748B");
  return w;
}

let remoteCode=null;
let remoteError=null;

try{
  const req=new Request(REMOTE+"?ts="+Date.now());
  req.timeoutInterval=12;
  remoteCode=await req.loadString();
  new AsyncFunction(remoteCode);
  await runCode(remoteCode);

  // キャッシュ保存失敗は表示成功を巻き戻さない
  try{ fm.writeString(cachePath,remoteCode); }catch(_){}

}catch(e){
  remoteError=e;

  if(fm.fileExists(cachePath)){
    try{
      await runCode(fm.readString(cachePath));
    }catch(cacheError){
      const w=errorWidget("ダッシュボード起動失敗","GitHub版と前回成功版の両方でエラー\n"+String(cacheError));
      if(config.runsInWidget) Script.setWidget(w); else await w.presentLarge();
    }
  }else{
    const w=errorWidget("初回取得に失敗","GitHubへ接続できません。通信状態を確認して再実行してください。\n"+String(remoteError));
    if(config.runsInWidget) Script.setWidget(w); else await w.presentLarge();
  }
}

Script.complete();
