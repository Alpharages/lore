import { Suspense } from "react";
import { LessonsPageClient } from "./lessons-page-client";

const LessonsPage = () => {
  return (
    <Suspense
      fallback={<div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>}
    >
      <LessonsPageClient />
    </Suspense>
  );
};

export default LessonsPage;
