import { Suspense } from "react";
import { EvolutionPageClient } from "./evolution-page-client";

/**
 * This page keeps both its active tab and the open detail item in the query
 * string, so a reviewer can link a colleague straight to what they are looking
 * at. On a statically prerendered route that does not work: after a fresh load
 * that already carries a query string, `router.replace()` with only
 * search-param changes silently no-ops — the click handler runs but the URL
 * never moves, so tabs and item cards stop responding. Rendering the route
 * dynamically makes search-param navigation take effect.
 */
export const dynamic = "force-dynamic";

const EvolutionPage = () => {
  return (
    <Suspense
      fallback={<div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>}
    >
      <EvolutionPageClient />
    </Suspense>
  );
};

export default EvolutionPage;
