// 角色顯示與版面設定的純函式模組(角色全身/半身、左右/上下排版)。
// 純函式、不碰 DOM、不依賴 React。

export type CharacterView = "full" | "half";
export type LayoutMode = "side" | "stacked";

export const DEFAULT_CHARACTER_VIEW: CharacterView = "full";
export const DEFAULT_LAYOUT_MODE: LayoutMode = "side";
// 半身模式下,畫面高度佔整個角色高度的比例(上 60% 身體)。
export const HALF_BODY_FRACTION = 0.6;

// 非法或缺值一律回預設;只接受字面值完全相等的字串。
export function parseCharacterView(v: unknown): CharacterView {
  return v === "half" || v === "full" ? v : DEFAULT_CHARACTER_VIEW;
}

export function parseLayoutMode(v: unknown): LayoutMode {
  return v === "stacked" || v === "side" ? v : DEFAULT_LAYOUT_MODE;
}

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type Placement = { scale: number; x: number; y: number };

// x/y 是 model.position(anchor/pivot 皆為 0,與 Live2DPanel 現行用法相同)。
export function computePlacement(
  b: Bounds,
  w: number,
  h: number,
  view: CharacterView,
): Placement {
  const cw = b.maxX - b.minX;
  const ch = b.maxY - b.minY;
  const cx = (b.minX + b.maxX) / 2;

  const scale =
    view === "half"
      ? Math.min((w * 0.9) / cw, (h * 0.95) / (ch * HALF_BODY_FRACTION))
      : Math.min((w * 0.9) / cw, (h * 0.95) / ch);
  const sc = Number.isFinite(scale) && scale > 0 ? scale : 0.5;

  const x = w / 2 - cx * sc;
  const y = view === "half" ? h * 0.02 - b.minY * sc : h * 0.98 - b.maxY * sc;
  return { scale: sc, x, y };
}
