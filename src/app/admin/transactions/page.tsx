import { TransactionsClient } from "./TransactionsClient";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <TransactionsClient initialQuery={(q ?? "").slice(0, 100)} />;
}
