import { redirect } from "next/navigation";

export default async function CompanyIndex({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  redirect(`/actions/${company}/board`);
}
