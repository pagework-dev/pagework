import type { Role } from "./account.svelte.ts";
import { api, request } from "./api.ts";

export interface ScriptView {
  id: string;
  title: string;
  templateId: string;
  projectId: string | null;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectView {
  id: string;
  name: string;
  createdAt: string;
}

export function listScripts(): Promise<{ scripts: ScriptView[]; role: Role }> {
  return api("GET", "/scripts");
}

export function listProjects(): Promise<{ projects: ProjectView[] }> {
  return api("GET", "/projects");
}

export function createScript(fields: {
  templateId: string;
  projectId: string | null;
  title?: string;
}): Promise<ScriptView> {
  return api("POST", "/scripts", fields);
}

export function getScript(
  id: string,
): Promise<ScriptView & { version: number; role: Role }> {
  return api("GET", `/scripts/${id}`);
}

export function updateScript(
  id: string,
  changes: { title?: string; templateId?: string; projectId?: string | null },
): Promise<ScriptView> {
  return api("PATCH", `/scripts/${id}`, changes);
}

export function deleteScript(id: string): Promise<unknown> {
  return api("DELETE", `/scripts/${id}`);
}

export async function scriptState(id: string): Promise<Uint8Array> {
  const res = await request("GET", `/scripts/${id}/state`);
  return new Uint8Array(await res.arrayBuffer());
}

export function createProject(name: string): Promise<ProjectView> {
  return api("POST", "/projects", { name });
}

export function renameProject(id: string, name: string): Promise<ProjectView> {
  return api("PATCH", `/projects/${id}`, { name });
}

export function deleteProject(id: string): Promise<unknown> {
  return api("DELETE", `/projects/${id}`);
}

/** Roles that may change scripts (the server checks; this only hides controls). */
export function canWrite(role: Role): boolean {
  return role === "owner" || role === "admin" || role === "writer";
}
