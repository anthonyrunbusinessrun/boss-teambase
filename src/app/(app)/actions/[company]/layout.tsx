import { notFound } from "next/navigation";
import { ActionsWorkspace } from "@/components/actions/ActionsWorkspace";
import { COMPANIES, isCompanyId } from "@/config/companies";

/** Only the three companies exist as addresses; anything else is a genuine 404. */
export const dynamicParams = false;
export const generateStaticParams = () => COMPANIES.map((c) => ({ company: c.id }));

/** Everything for one company — its folder, board and sprints. The layout stays mounted when you switch between Board and Sprints. */
export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ company: string }> }) {
  const { company } = await params;
  if (!isCompanyId(company)) notFound();
  return <ActionsWorkspace company={company}>{children}</ActionsWorkspace>;
}
