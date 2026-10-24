/* 可選模型清單（聊天問答、書籍介紹兩頁共用） */

// 2026-10 現役型號：只留 GPT-5.4 世代（gpt-5.1、gpt-4o-mini 官方已標為淘汰，2026-10-24 移除；
// 舊設定若存著它們，normalizeModel 會落回預設）
export const availableModels: readonly string[] = [
  "openai:gpt-5.4-mini",
  "openai:gpt-5.4",
  "openai:gpt-5.4-nano",
];

export const defaultModel = "openai:gpt-5.4-mini";

/* 讀到的值若不在現役清單（舊版存下來的型號如 gpt-4o，或非字串），落回預設 */
export function normalizeModel(v: unknown): string {
  return typeof v === "string" && availableModels.includes(v) ? v : defaultModel;
}
