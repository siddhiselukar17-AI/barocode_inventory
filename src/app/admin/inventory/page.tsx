import { InventoryClient } from "./InventoryClient";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const initialStatus = status === "low" || status === "out" || status === "in" ? status : "all";
  return <InventoryClient initialStatus={initialStatus} />;
}
