"use client";

import { ProgramsListPart } from './programs-list-part';

/** Halaman "Program" — daftar program; Level & Paket dikelola di halaman detail program. */
export function ProgramsManager({ canManage, basePath }: { canManage: boolean; basePath: string }) {
  return <ProgramsListPart canManage={canManage} basePath={basePath} />;
}
