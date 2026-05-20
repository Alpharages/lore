import { Suspense } from "react";
import { PatternsPageClient } from "./patterns-page-client";

const PatternsPage = () => {
  return (
    <Suspense
      fallback={<div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>}
    >
      <PatternsPageClient />
    </Suspense>
  );
};

export default PatternsPage;
