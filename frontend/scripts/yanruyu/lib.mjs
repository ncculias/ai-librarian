// 顏如玉 Live2D 資產處理用的純函式與常數(不做檔案 I/O,由 CLI 腳本負責)。

export const EMOTIONS = ["normal", "happy", "angry", "sad", "think"];

// 廠商原始表情檔,路徑相對於廠商模型目錄(含 arm/face/mouth 資料夾)
export const VENDOR_EXPRESSION_FILES = {
  normal: { arm: "arm/(arm) normal.exp3.json", face: "face/(face) normal.exp3.json", mouth: "mouth/(mouth) normal.exp3.json" },
  happy: { arm: "arm/(arm) wave.exp3.json", face: "face/(face) happy.exp3.json", mouth: "mouth/(mouth) happy.exp3.json" },
  angry: { arm: "arm/(arm) waist.exp3.json", face: "face/(face) angry.exp3.json", mouth: "mouth/(mouth) angry.exp3.json" },
  sad: { arm: "arm/(arm) back.exp3.json", face: "face/(face) sad.exp3.json", mouth: "mouth/(mouth) sad.exp3.json" },
  think: { arm: "arm/(arm) think.exp3.json", face: "face/(face) think.exp3.json", mouth: "mouth/(mouth) think.exp3.json" },
};

// 引擎一次只能套用一個表情,所以把多個表情檔的參數依 Id 相加合成一個。
export function mergeExpressions(parts) {
  const sums = new Map();
  for (const part of parts) {
    for (const { Id, Value, Blend } of part.Parameters) {
      // 以相加合成只在 Blend 為 Add 時才成立(Multiply/Overwrite 語意不同)
      if (Blend !== "Add") {
        throw new Error(`mergeExpressions: 參數 ${Id} 的 Blend 為 ${JSON.stringify(Blend)},僅支援 "Add"`);
      }
      sums.set(Id, (sums.get(Id) ?? 0) + Value);
    }
  }
  const Parameters = [...sums.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((Id) => ({ Id, Value: Math.round(sums.get(Id) * 1e6) / 1e6, Blend: "Add" })); // 去除浮點誤差
  return { Type: "Live2D Expression", FadeInTime: 0, FadeOutTime: 0, Parameters };
}

// 去掉開頭的 "(類別) " 標籤、其餘空格改為 "_";"<名稱>.8192/" 貼圖資料夾改為 "textures/"
export function asciiName(vendorFile) {
  return vendorFile
    .replace(/^\([^)]*\) /, "")
    .replace(/ /g, "_")
    .replace(/^[^/]+\.8192\//, "textures/");
}

export function buildModel3() {
  // 淡出設 0 — 循環動作首尾幀相同,動作結束瞬間引擎重啟 idle 並從當前姿勢淡入,接點不可見;
  // 淡出 0.5 會先往預設姿勢滑再回來,造成每循環一次頓挫
  const fade = { FadeInTime: 0.5, FadeOutTime: 0 };
  return {
    Version: 3,
    FileReferences: {
      Moc: "yanruyu.moc3",
      Textures: ["textures/texture_00.png"],
      DisplayInfo: "yanruyu.cdi3.json",
      Expressions: EMOTIONS.map((Name) => ({ Name, File: `expressions/${Name}.exp3.json` })),
      Motions: {
        Idle: [{ File: "motions/normal.motion3.json", ...fade }],
        ...Object.fromEntries(
          EMOTIONS.map((e) => [e, [{ File: `motions/${e}.motion3.json`, ...fade }]]),
        ),
      },
    },
    Groups: [{ Target: "Parameter", Name: "LipSync", Ids: ["PARAM_MOUTH_OPEN"] }],
  };
}
