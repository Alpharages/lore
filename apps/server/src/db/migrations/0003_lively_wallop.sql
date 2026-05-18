ALTER TABLE "lessons" DROP CONSTRAINT "lessons_propagated_from_lessons_id_fk";
--> statement-breakpoint
ALTER TABLE "lessons" ALTER COLUMN "embedding" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "patterns" ALTER COLUMN "embedding" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_propagated_from_fk" FOREIGN KEY ("propagated_from") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;