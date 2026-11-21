import { parse } from "@pagework/fountain";
import { t } from "../i18n/index.ts";
import {
  draftToOffer,
  draftWriter,
  indexedDbDrafts,
  memoryDrafts,
  type Draft,
  type DraftStore,
} from "../files/drafts.ts";
import {
  fileBaseName,
  hasFountainExtension,
  importScript,
  scriptTitle,
} from "../files/import.ts";
import { makePdf, printPdf } from "../files/pdf.ts";
import {
  chooseSaveLocation,
  chooseScript,
  download,
  writeToHandle,
  type FileHandle,
} from "../files/system.ts";
import { currentText, editorView, loadText } from "./editor-view.ts";
import { chooseWithoutAccount } from "./host.svelte.ts";
import { session } from "./session.svelte.ts";
import { templateById } from "./templates.ts";

/** How the status bar describes where the script is kept. */
export type SaveState =
  /** Nothing written yet. */
  | "empty"
  | "saved"
  | "saving"
  /** Changes not in a file yet, but safe in this browser. */
  | "kept"
  /** Changes not in a file and not in this browser's storage. */
  | "unsaved";

export interface Notice {
  kind: "info" | "error" | "restore";
  message: string;
}

export interface Question {
  message: string;
  resolve: (answer: "save" | "discard" | "cancel") => void;
}

interface ScriptDocument {
  fileName: string | null;
  saveState: SaveState;
  /** Exporting or printing in progress. */
  busy: "pdf" | "print" | null;
  notice: Notice | null;
  /** A draft from an earlier visit, offered for restoring. */
  offer: Draft | null;
  question: Question | null;
  storageWorks: boolean;
}

export const doc = $state<ScriptDocument>({
  fileName: null,
  saveState: "empty",
  busy: null,
  notice: null,
  offer: null,
  question: null,
  storageWorks: true,
});

let handle: FileHandle | null = null;
let changed = false;
let draftId = newId();
let store: DraftStore = memoryDrafts();
let writer = draftWriter(store, onDraftWritten);

function newId(): string {
  return crypto.randomUUID();
}

function onDraftWritten(ok: boolean): void {
  if (doc.storageWorks !== ok) {
    doc.storageWorks = ok;
    if (!ok) doc.notice = { kind: "error", message: t("notice.noStorage") };
  }
  if (changed && doc.saveState !== "saving")
    doc.saveState = ok ? "kept" : "unsaved";
}

function draftNow(): Draft {
  return {
    id: draftId,
    text: currentText(),
    fileName: doc.fileName,
    templateId: session.templateId,
    unsaved: changed,
    updatedAt: Date.now(),
  };
}

/** Called by the editor on every change to the text. */
export function textChanged(): void {
  changed = true;
  if (doc.saveState !== "saving")
    doc.saveState = doc.storageWorks ? "kept" : "unsaved";
  writer.schedule(draftNow);
}

/** Opens the draft store and offers to restore unsaved work from last time. */
export async function startDocument(): Promise<void> {
  try {
    store = await indexedDbDrafts();
  } catch {
    doc.storageWorks = false;
    doc.notice = { kind: "error", message: t("notice.noStorage") };
    return;
  }
  writer = draftWriter(store, onDraftWritten);
  // Anything typed while storage was opening went to the stand-in store in
  // memory; write it to IndexedDB now, or a closed tab would lose it.
  if (changed) writer.schedule(draftNow);
  const offer = draftToOffer(await store.all().catch(() => []), draftId);
  if (offer !== null) doc.offer = offer;
  const flush = (): void => {
    void writer.flush();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", (event) => {
    // Only warn when the browser isn't keeping a copy.
    if (changed && !doc.storageWorks) event.preventDefault();
  });
}

function begin(
  text: string,
  fileName: string | null,
  fileHandle: FileHandle | null,
): void {
  void writer.flush();
  draftId = newId();
  handle = fileHandle;
  doc.fileName = fileName;
  loadText(text);
  changed = false;
  doc.saveState = fileName === null ? "empty" : "saved";
  doc.offer = null;
  editorView()?.focus();
}

export function restoreOffer(): void {
  const draft = doc.offer;
  if (draft === null) return;
  begin(draft.text, draft.fileName, null);
  draftId = draft.id;
  session.templateId = draft.templateId;
  changed = draft.unsaved;
  doc.saveState = changed ? "kept" : "saved";
  doc.notice = null;
}

export function dismissOffer(): void {
  doc.offer = null;
  editorView()?.focus();
}

function ask(message: string): Promise<"save" | "discard" | "cancel"> {
  return new Promise((resolve) => {
    doc.question = {
      message,
      resolve: (answer) => {
        doc.question = null;
        resolve(answer);
      },
    };
  });
}

/** Before replacing the script: offers to save changes that aren't in a file. */
async function readyToReplace(): Promise<boolean> {
  if (!changed || currentText().trim() === "") return true;
  const answer = await ask(t("question.saveFirst", { name: displayName() }));
  if (answer === "cancel") return false;
  if (answer === "save") return save();
  return true;
}

export function displayName(): string {
  return doc.fileName ?? t("document.untitled");
}

export async function newScript(): Promise<void> {
  if (!(await readyToReplace())) return;
  begin("", null, null);
}

/** Back to the sign-in screen of the server the app came from. */
export async function signInInstead(): Promise<void> {
  if (!(await readyToReplace())) return;
  await writer.flush();
  chooseWithoutAccount(false);
  location.reload();
}

export async function openScript(): Promise<void> {
  if (!(await readyToReplace())) return;
  let opened;
  try {
    opened = await chooseScript(t("file.typeDescription"));
  } catch (error) {
    doc.notice = {
      kind: "error",
      message: t("notice.openFailed", { reason: reason(error) }),
    };
    return;
  }
  if (opened === null) return;
  if (!hasFountainExtension(opened.name)) {
    doc.notice = {
      kind: "error",
      message: t("notice.notFountain", { name: opened.name }),
    };
    return;
  }
  const imported = importScript(opened.text);
  begin(imported.text, opened.name, opened.handle);
  doc.notice =
    imported.removedMarkers > 0
      ? {
          kind: "info",
          message: t(
            imported.removedMarkers === 1
              ? "notice.markersRemoved.one"
              : "notice.markersRemoved.other",
            { count: imported.removedMarkers },
          ),
        }
      : null;
  // The text in the editor differs from the file once markers are removed.
  if (imported.removedMarkers > 0) textChanged();
}

function reason(error: unknown): string {
  return error instanceof Error && error.message !== ""
    ? error.message
    : t("notice.unknownReason");
}

const FOUNTAIN_TYPE = {
  description: "Fountain",
  accept: { "text/plain": [".fountain"] },
};

function scriptBlob(): Blob {
  return new Blob([currentText()], { type: "text/plain;charset=utf-8" });
}

function suggestedBase(): string {
  const title = scriptTitle(parse(currentText()));
  return fileBaseName(doc.fileName, title, t("document.untitled"));
}

async function writeScript(target: FileHandle): Promise<boolean> {
  doc.saveState = "saving";
  try {
    await writeToHandle(target, scriptBlob());
  } catch (error) {
    doc.saveState = doc.storageWorks ? "kept" : "unsaved";
    doc.notice = {
      kind: "error",
      message: t("notice.saveFailed", {
        name: target.name,
        reason: reason(error),
      }),
    };
    return false;
  }
  handle = target;
  doc.fileName = target.name;
  changed = false;
  doc.saveState = "saved";
  writer.schedule(draftNow());
  return true;
}

/** Saves to the file the script came from, or asks where. */
export async function save(): Promise<boolean> {
  if (handle !== null) return writeScript(handle);
  return saveAs();
}

export async function saveAs(): Promise<boolean> {
  const name = `${suggestedBase()}.fountain`;
  let target;
  try {
    target = await chooseSaveLocation(name, FOUNTAIN_TYPE);
  } catch (error) {
    doc.notice = {
      kind: "error",
      message: t("notice.saveFailed", { name, reason: reason(error) }),
    };
    return false;
  }
  if (target === "cancelled") return false;
  if (target !== null) return writeScript(target);
  // No file access in this browser: save through downloads.
  download(name, scriptBlob());
  doc.fileName = name;
  changed = false;
  doc.saveState = "saved";
  writer.schedule(draftNow());
  doc.notice = { kind: "info", message: t("notice.downloaded", { name }) };
  return true;
}

async function pdfOfScript(): Promise<Uint8Array | null> {
  const view = editorView();
  if (view === null) return null;
  const text = view.state.doc.toString();
  const elements = parse(text);
  try {
    const pdf = await makePdf(
      elements,
      templateById(session.templateId),
      scriptTitle(elements),
    );
    if (pdf.unencodable.length > 0)
      doc.notice = {
        kind: "info",
        message: t("notice.unencodable", {
          characters: pdf.unencodable.join(" "),
        }),
      };
    return pdf.bytes;
  } catch (error) {
    doc.notice = {
      kind: "error",
      message: t("notice.pdfFailed", { reason: reason(error) }),
    };
    return null;
  }
}

export async function exportPdf(): Promise<void> {
  if (doc.busy !== null) return;
  doc.busy = "pdf";
  try {
    const bytes = await pdfOfScript();
    if (bytes === null) return;
    const name = `${suggestedBase()}.pdf`;
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
    let target;
    try {
      target = await chooseSaveLocation(name, {
        description: "PDF",
        accept: { "application/pdf": [".pdf"] },
      });
    } catch (error) {
      doc.notice = {
        kind: "error",
        message: t("notice.saveFailed", { name, reason: reason(error) }),
      };
      return;
    }
    if (target === "cancelled") return;
    if (target === null) {
      download(name, blob);
      doc.notice = { kind: "info", message: t("notice.downloaded", { name }) };
    } else {
      await writeToHandle(target, blob);
      doc.notice = {
        kind: "info",
        message: t("notice.exported", { name: target.name }),
      };
    }
  } finally {
    doc.busy = null;
  }
}

export async function printScript(): Promise<void> {
  if (doc.busy !== null) return;
  doc.busy = "print";
  try {
    const bytes = await pdfOfScript();
    if (bytes !== null) printPdf(bytes);
  } finally {
    doc.busy = null;
  }
}
