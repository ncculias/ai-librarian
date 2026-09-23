import { useState } from "react";
import { createPortal } from "react-dom";
import {
  CircleUser,
  GraduationCap,
  Heart,
  Hand,
  Lightbulb,
  CircleCheck,
  TriangleAlert,
  Settings2,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { ElementType } from "react";
import {
  DEFAULT_SYSTEM_PROMPT,
  MODULE_META,
  assemblePersona,
  defaultPersonaModules,
  type ModuleKey,
  type PersonaModuleSet,
} from "../data/personaModules";

/* 結構依 docs/2026-09-22_模組化人設設定_spec_v2.md。
   效能設計（2026-09-22）：視窗內全部走「草稿狀態」，打字只重繪這個視窗，
   不再每鍵重繪整頁（聊天紀錄＋Live2D 陪跑是先前卡頓的主因）；
   按「儲存並套用」才一次寫回，「取消」＝草稿直接丟棄（順帶修正取消不會還原的問題）。 */

type PersonaOption = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
};

// 人設與模組的線條 icon（全站統一 SVG stroke 風格，不用 emoji）
const personaIcons: Record<string, ElementType> = {
  none: CircleUser,
  professional: GraduationCap,
  warm: Heart,
};
const moduleIcons: Record<string, ElementType> = {
  opening: Hand,
  answer: Lightbulb,
  closing: CircleCheck,
  error: TriangleAlert,
};

export type ConfigDraft = {
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  persona: string;
  personaModules: PersonaModuleSet;
};

type ConfigModalProps = {
  /** 開窗當下的現值：進來後即為草稿，關窗不儲存就丟棄 */
  initial: ConfigDraft;
  personaOptions: readonly PersonaOption[];
  onClose: () => void;
  onApply: (draft: ConfigDraft) => void;
};

function SectionTitle({ no, text }: { no: string; text: string }) {
  return (
    <div className="mb-2 mt-5 flex items-center gap-2 first:mt-0">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-strong)] text-xs font-bold text-white">
        {no}
      </span>
      <span className="text-sm font-semibold text-[var(--color-text-primary)]">
        {text}
      </span>
    </div>
  );
}

export default function ConfigModal({
  initial,
  personaOptions,
  onClose,
  onApply,
}: ConfigModalProps) {
  // 草稿：深拷貝模組，避免編輯途中改到外部物件
  const [draft, setDraft] = useState<ConfigDraft>(() => ({
    ...initial,
    personaModules: JSON.parse(JSON.stringify(initial.personaModules)),
  }));
  const [previewMode, setPreviewMode] = useState<"single" | "compare">("single");

  const editablePersona =
    draft.persona === "professional" || draft.persona === "warm"
      ? draft.persona
      : null;

  const setModules = (next: PersonaModuleSet) =>
    setDraft((d) => ({ ...d, personaModules: next }));

  const updateModule = (key: ModuleKey, value: string) => {
    if (!editablePersona) return;
    setModules({
      ...draft.personaModules,
      [editablePersona]: { ...draft.personaModules[editablePersona], [key]: value },
    });
  };
  const resetModule = (key: ModuleKey) => {
    if (!editablePersona) return;
    updateModule(key, defaultPersonaModules()[editablePersona][key]);
  };
  const updateCustom = (idx: number, field: "name" | "content", value: string) => {
    if (!editablePersona) return;
    const list = draft.personaModules[editablePersona].custom.map((c, i) =>
      i === idx ? { ...c, [field]: value } : c
    );
    setModules({
      ...draft.personaModules,
      [editablePersona]: { ...draft.personaModules[editablePersona], custom: list },
    });
  };
  const addCustom = () => {
    if (!editablePersona) return;
    setModules({
      ...draft.personaModules,
      [editablePersona]: {
        ...draft.personaModules[editablePersona],
        custom: [
          ...draft.personaModules[editablePersona].custom,
          { name: "自訂模組", content: "" },
        ],
      },
    });
  };
  const removeCustom = (idx: number) => {
    if (!editablePersona) return;
    setModules({
      ...draft.personaModules,
      [editablePersona]: {
        ...draft.personaModules[editablePersona],
        custom: draft.personaModules[editablePersona].custom.filter((_, i) => i !== idx),
      },
    });
  };
  const resetPersona = () => {
    if (!editablePersona) return;
    setModules({
      ...draft.personaModules,
      [editablePersona]: defaultPersonaModules()[editablePersona],
    });
  };

  // 預覽由草稿即時組裝（只在本視窗內計算與重繪）
  const personaLabel =
    personaOptions.find((p) => p.id === draft.persona)?.label ?? "";
  const assembled = [
    draft.systemPrompt,
    editablePersona
      ? assemblePersona(personaLabel, draft.personaModules[editablePersona])
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // 用 portal 掛到 body：外層卡片的特效屬性會形成 stacking context，
  // 把 fixed 視窗困在卡片圖層裡（導覽列壓住它、背景元件穿透）。掛 body 才能真正浮在最上層
  return createPortal(
    <div className="theme-overlay fixed inset-0 z-[999] flex items-center justify-center bg-black/50 p-4">
      <div className="theme-modal max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl p-6 shadow-xl">
        <h3 className="text-lg font-bold text-[var(--color-text-primary)]">
          AI 館員設定
        </h3>
        <p className="mb-4 text-xs text-[var(--color-text-muted)]">
          只影響這台裝置；按「儲存並套用」才會生效，取消則不保留修改。
        </p>

        <SectionTitle no="1" text="共通系統提示詞" />
        <textarea
          value={draft.systemPrompt}
          onChange={(e) => setDraft((d) => ({ ...d, systemPrompt: e.target.value }))}
          rows={5}
          placeholder="所有人設共用的基本指令"
          className="theme-input w-full resize-none rounded-lg px-3 py-2 text-sm"
        />
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, systemPrompt: DEFAULT_SYSTEM_PROMPT }))}
            className="flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]"
          >
            <RotateCcw className="h-3 w-3" /> 還原預設
          </button>
        </div>

        <SectionTitle no="2" text="角色模組" />
        <div className="space-y-2">
          {personaOptions.map((p) => {
            const Icon = personaIcons[p.id];
            return (
              <label
                key={p.id}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${
                  draft.persona === p.id
                    ? "border-[var(--color-accent-strong)] bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-border)]"
                }`}
              >
                <input
                  type="radio"
                  name="persona"
                  value={p.id}
                  checked={draft.persona === p.id}
                  onChange={() => setDraft((d) => ({ ...d, persona: p.id }))}
                  className="mt-1"
                />
                {Icon && (
                  <Icon
                    className="mt-1 h-4 w-4 shrink-0 text-[var(--color-accent-text)]"
                    aria-hidden="true"
                  />
                )}
                <span>
                  <span className="block text-sm font-semibold text-[var(--color-text-primary)]">
                    {p.label}
                  </span>
                  <span className="block text-xs text-[var(--color-text-muted)]">
                    {p.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {/* 模組編輯：選了人設才顯示；每模組可展開編輯、單獨還原；自訂模組可增刪 */}
        {editablePersona && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-muted)]">
                編輯「{personaOptions.find((p) => p.id === editablePersona)?.label}」的模組內容
              </span>
              <button
                type="button"
                onClick={resetPersona}
                className="flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]"
              >
                <RotateCcw className="h-3 w-3" /> 全部還原預設
              </button>
            </div>
            {MODULE_META.map((meta) => {
              const MIcon = moduleIcons[meta.key];
              return (
                <details
                  key={meta.key}
                  className="group rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 py-2.5 transition hover:border-[var(--color-accent-strong)]"
                >
                  <summary className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-primary)]">
                    {MIcon && (
                      <MIcon className="h-4 w-4 shrink-0 text-[var(--color-accent-text)]" aria-hidden="true" />
                    )}
                    <span className="shrink-0 whitespace-nowrap font-semibold">{meta.label}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-text-muted)]">
                      {meta.hint}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--color-accent-text)] group-open:hidden">
                      點開編輯 ▾
                    </span>
                    <span className="hidden shrink-0 text-xs text-[var(--color-text-muted)] group-open:inline">
                      收合 ▴
                    </span>
                  </summary>
                  <textarea
                    value={draft.personaModules[editablePersona][meta.key]}
                    onChange={(e) => updateModule(meta.key, e.target.value)}
                    rows={5}
                    className="theme-input mt-2 w-full resize-none rounded-lg px-3 py-2 text-sm"
                  />
                  <div className="mt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => resetModule(meta.key)}
                      className="flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]"
                    >
                      <RotateCcw className="h-3 w-3" /> 還原此模組
                    </button>
                  </div>
                </details>
              );
            })}
            {draft.personaModules[editablePersona].custom.map((c, idx) => (
              <details
                key={`custom-${idx}`}
                className="group rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 py-2.5 transition hover:border-[var(--color-accent-strong)]"
              >
                <summary className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-primary)]">
                  <Settings2 className="h-4 w-4 shrink-0 text-[var(--color-accent-text)]" aria-hidden="true" />
                  <span className="shrink-0 whitespace-nowrap font-semibold">{c.name || "自訂模組"}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-text-muted)]">自訂</span>
                  <span className="shrink-0 text-xs text-[var(--color-accent-text)] group-open:hidden">
                    點開編輯 ▾
                  </span>
                  <span className="hidden shrink-0 text-xs text-[var(--color-text-muted)] group-open:inline">
                    收合 ▴
                  </span>
                </summary>
                <input
                  value={c.name}
                  onChange={(e) => updateCustom(idx, "name", e.target.value)}
                  placeholder="模組名稱"
                  className="theme-input mt-2 w-full rounded-lg px-3 py-2 text-sm"
                />
                <textarea
                  value={c.content}
                  onChange={(e) => updateCustom(idx, "content", e.target.value)}
                  rows={4}
                  placeholder="這個模組的指令內容"
                  className="theme-input mt-2 w-full resize-none rounded-lg px-3 py-2 text-sm"
                />
                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeCustom(idx)}
                    className="flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]"
                  >
                    <Trash2 className="h-3 w-3" /> 刪除
                  </button>
                </div>
              </details>
            ))}
            <button
              type="button"
              onClick={addCustom}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)]"
            >
              <Plus className="h-4 w-4" /> 新增模組
            </button>
          </div>
        )}

        <SectionTitle no="3" text="Prompt 組裝預覽" />
        <div className="mb-2 flex gap-2">
          {(
            [
              { id: "single", label: "單獨預覽" },
              { id: "compare", label: "比較預覽" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPreviewMode(t.id)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                previewMode === t.id
                  ? "border-[var(--color-accent-strong)] bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {previewMode === "single" ? (
          <>
            <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--color-border)] p-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
              {assembled || "（目前沒有任何系統指令）"}
            </pre>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              書籍介紹模式下，送出時會再附加該模式的欄位指令。
            </p>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {personaOptions
              .filter((p) => p.id !== "none")
              .map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-[var(--color-border)] p-3"
                >
                  <div className="mb-1 text-xs font-semibold text-[var(--color-text-primary)]">
                    {p.label}
                  </div>
                  <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--color-text-muted)]">
                    {assemblePersona(
                      p.label,
                      draft.personaModules[p.id as "professional" | "warm"]
                    )}
                  </pre>
                </div>
              ))}
          </div>
        )}

        {/* 進階參數收摺疊，主畫面聚焦研究相關設定 */}
        <details className="mt-4 rounded-lg border border-[var(--color-border)] px-3 py-2">
          <summary className="cursor-pointer text-sm text-[var(--color-text-secondary)]">
            進階參數
          </summary>
          <label className="mb-1 mt-3 block text-sm text-[var(--color-text-secondary)]">
            Temperature{" "}
            <span className="text-[var(--color-text-muted)]">
              (數值越高，回答越有創意)
            </span>
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={draft.temperature}
            onChange={(e) =>
              setDraft((d) => ({ ...d, temperature: Number(e.target.value) }))
            }
            className="theme-input mb-3 w-full rounded-lg px-3 py-2 text-sm"
          />
          <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
            Max Tokens{" "}
            <span className="text-[var(--color-text-muted)]">(限制回答長度)</span>
          </label>
          <input
            type="number"
            value={draft.maxTokens}
            onChange={(e) =>
              setDraft((d) => ({ ...d, maxTokens: Number(e.target.value) }))
            }
            className="theme-input mb-2 w-full rounded-lg px-3 py-2 text-sm"
          />
        </details>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="theme-button-secondary rounded-lg px-4 py-2 text-sm"
          >
            取消
          </button>
          <button
            onClick={() => onApply(draft)}
            className="theme-button-primary rounded-lg px-4 py-2 text-sm"
          >
            儲存並套用
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
