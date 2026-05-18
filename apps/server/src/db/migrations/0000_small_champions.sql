CREATE TABLE "lesson_propagations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_lesson_id" uuid NOT NULL,
	"target_project_id" uuid NOT NULL,
	"status" text DEFAULT 'suggested',
	"suggested_at" timestamp with time zone DEFAULT now(),
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "lesson_propagations_source_target_unique" UNIQUE("source_lesson_id","target_project_id"),
	CONSTRAINT "lesson_propagations_status_check" CHECK ("lesson_propagations"."status" IN ('suggested', 'accepted', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"repo_id" uuid,
	"stack_tags" text[] DEFAULT '{}',
	"category" text,
	"severity" text DEFAULT 'medium',
	"title" text NOT NULL,
	"problem" text NOT NULL,
	"root_cause" text,
	"fix" text NOT NULL,
	"prevention_rule" text NOT NULL,
	"occurrence_count" integer DEFAULT 1,
	"hit_by_users" text[] DEFAULT '{}',
	"captured_by_user" text,
	"first_seen_at" timestamp with time zone DEFAULT now(),
	"last_seen_at" timestamp with time zone DEFAULT now(),
	"session_id" uuid,
	"propagated_from" uuid,
	"embedding" vector(1536),
	"embedding_status" text DEFAULT 'pending',
	"external_task_id" text,
	"external_task_ref" text,
	"external_tracker_type" text,
	"provenance" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "lessons_severity_check" CHECK ("lessons"."severity" IN ('critical', 'high', 'medium', 'low')),
	CONSTRAINT "lessons_embedding_status_check" CHECK ("lessons"."embedding_status" IN ('pending', 'complete', 'failed')),
	CONSTRAINT "lessons_external_tracker_type_check" CHECK ("lessons"."external_tracker_type" IN ('clickup', 'jira', 'asana'))
);
--> statement-breakpoint
CREATE TABLE "patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"repo_id" uuid,
	"stack_tags" text[] DEFAULT '{}',
	"category" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"code_example" text,
	"usage_count" integer DEFAULT 1,
	"last_used_at" timestamp with time zone DEFAULT now(),
	"embedding" vector(1536),
	"external_task_id" text,
	"external_task_ref" text,
	"external_tracker_type" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "patterns_external_tracker_type_check" CHECK ("patterns"."external_tracker_type" IN ('clickup', 'jira', 'asana'))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"stack_tags" text[] DEFAULT '{}',
	"config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"stack_tags" text[] DEFAULT '{}',
	"boundaries" text[] DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "repositories_project_id_slug_unique" UNIQUE("project_id","slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"repo_id" uuid,
	"user_handle" text,
	"branch" text,
	"task_summary" text,
	"decisions" jsonb DEFAULT '[]'::jsonb,
	"lessons_consulted" uuid[] DEFAULT '{}',
	"lessons_applied" uuid[] DEFAULT '{}',
	"files_touched" text[] DEFAULT '{}',
	"external_task_id" text,
	"external_task_ref" text,
	"external_tracker_type" text,
	"bmad_skill" text,
	"bmad_workflow" text,
	"started_at" timestamp with time zone DEFAULT now(),
	"ended_at" timestamp with time zone,
	CONSTRAINT "sessions_external_tracker_type_check" CHECK ("sessions"."external_tracker_type" IN ('clickup', 'jira', 'asana'))
);
--> statement-breakpoint
ALTER TABLE "lesson_propagations" ADD CONSTRAINT "lesson_propagations_source_lesson_id_lessons_id_fk" FOREIGN KEY ("source_lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_propagations" ADD CONSTRAINT "lesson_propagations_target_project_id_projects_id_fk" FOREIGN KEY ("target_project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_propagated_from_lessons_id_fk" FOREIGN KEY ("propagated_from") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patterns" ADD CONSTRAINT "patterns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patterns" ADD CONSTRAINT "patterns_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;