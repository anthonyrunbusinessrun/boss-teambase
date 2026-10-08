import type { CompanyId } from "@/types/models";

export interface CompanyDef {
  id: CompanyId;
  /** Short code, also the ticket prefix (BOSS-12). */
  code: string;
  name: string;
  /** Accent used on its folder card (design tokens: red / blue / amber). */
  tone: "red" | "blue" | "amber";
}

/** The three top-level sections of Actions. Fixed on purpose: each owns a Board and a set of Sprints. */
export const COMPANIES: readonly CompanyDef[] = [
  { id: "boss", code: "BOSS", name: "Business Operating Systems Solutions", tone: "red" },
  { id: "rli", code: "RLI", name: "Rayland Inc.", tone: "blue" },
  { id: "ll", code: "LL", name: "Land Logistics", tone: "amber" },
];

export const DEFAULT_COMPANY: CompanyId = "boss";

export const isCompanyId = (v: unknown): v is CompanyId => COMPANIES.some((c) => c.id === v);
export const getCompany = (id: CompanyId): CompanyDef => COMPANIES.find((c) => c.id === id) ?? COMPANIES[0];
