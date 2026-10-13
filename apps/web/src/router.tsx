import { createBrowserRouter, Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Misc";
import { AttributeSetsPage } from "@/features/attributeSets/AttributeSetsPage";
import { LogsPage } from "@/features/logs/LogsPage";
import { OverviewPage } from "@/features/overview/OverviewPage";
import { ProductEditorPage } from "@/features/products/ProductEditorPage";
import { ProductsPage } from "@/features/products/ProductsPage";

const NotFound = () => (
  <>
    <PageHeader crumbs={[{ label: "Not found" }]} />
    <EmptyState title="This page doesn't exist" description="The link may be old or mistyped." action={<Link to="/"><Button>Go to overview</Button></Link>} />
  </>
);

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <OverviewPage /> },
      { path: "/products", element: <ProductsPage /> },
      { path: "/products/new", element: <ProductEditorPage key="new" /> },
      { path: "/products/:id", element: <ProductEditorPage /> },
      { path: "/attribute-sets", element: <AttributeSetsPage /> },
      { path: "/logs", element: <LogsPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
