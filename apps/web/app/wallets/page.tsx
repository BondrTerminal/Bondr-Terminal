import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type WalletsPageProps = {
  searchParams?: Promise<{ project?: string }>;
};

export default async function WalletsCompatibilityPage({ searchParams }: WalletsPageProps) {
  const params = await searchParams;
  const project = params?.project ? `&project=${encodeURIComponent(params.project)}` : '';
  redirect(`/portfolio?view=wallets${project}`);
}
