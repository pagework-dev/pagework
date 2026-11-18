import { FOUNTAIN_EXTENSIONS } from "./import.ts";

/**
 * Reading and writing files on the writer's computer. Chrome and Edge have
 * the File System Access API, so Save writes back to the file that was
 * opened. Other browsers open with a file chooser and save by downloading.
 */

// Not yet in TypeScript's DOM library.
interface FilePickerType {
  description: string;
  accept: Record<string, string[]>;
}
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerType[];
}
interface OpenFilePickerOptions {
  types?: FilePickerType[];
  multiple?: false;
}
interface WritableFile {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}
export interface FileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableFile>;
}
interface FileSystemAccess {
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileHandle[]>;
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileHandle>;
}

function access(): FileSystemAccess | null {
  const w = window as unknown as Partial<FileSystemAccess>;
  return typeof w.showOpenFilePicker === "function" &&
    typeof w.showSaveFilePicker === "function"
    ? (w as FileSystemAccess)
    : null;
}

export function canWriteFiles(): boolean {
  return access() !== null;
}

/** The writer closed a file chooser without choosing: not an error. */
export function isCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export interface OpenedFile {
  name: string;
  text: string;
  handle: FileHandle | null;
}

function chooseWithInput(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
    });
    input.addEventListener("cancel", () => {
      resolve(null);
    });
    input.click();
  });
}

/** Asks for a script file. Null when the writer cancels. */
export async function chooseScript(
  description: string,
): Promise<OpenedFile | null> {
  const fs = access();
  if (fs !== null) {
    try {
      const [handle] = await fs.showOpenFilePicker({
        types: [{ description, accept: { "text/plain": FOUNTAIN_EXTENSIONS } }],
      });
      if (handle === undefined) return null;
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (error) {
      if (isCancel(error)) return null;
      throw error;
    }
  }
  const file = await chooseWithInput(FOUNTAIN_EXTENSIONS.join(","));
  return file === null
    ? null
    : { name: file.name, text: await file.text(), handle: null };
}

export async function writeToHandle(
  handle: FileHandle,
  data: Blob | string,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

/** Asks where to save. Null when cancelled or when the browser can't ask. */
export async function chooseSaveLocation(
  suggestedName: string,
  type: FilePickerType,
): Promise<FileHandle | null | "cancelled"> {
  const fs = access();
  if (fs === null) return null;
  try {
    return await fs.showSaveFilePicker({ suggestedName, types: [type] });
  } catch (error) {
    if (isCancel(error)) return "cancelled";
    throw error;
  }
}

/** Saves through the browser's downloads, where writing files isn't possible. */
export function download(name: string, data: Blob): void {
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}
