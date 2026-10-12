import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProductForm } from "@/components/products/ProductForm";
import { PageHeader } from "@/components/ui/states";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ barcode?: string }> }) {
  const { barcode } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/products" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to products
      </Link>
      <PageHeader
        title="Add product"
        description={barcode ? `Registering scanned barcode ${barcode}` : "Create a product and optionally record its opening stock."}
      />
      <ProductForm mode="create" defaultBarcode={barcode?.slice(0, 128)} />
    </div>
  );
}
