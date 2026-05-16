"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon } from "lucide-react";
import { fetchProjects } from "@/lib/api";
import { ApiKeyManager } from "@/components/app/api-key-manager";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Project } from "@/lib/api-types";

const MAX_VISIBLE_TAGS = 5;

const CURL_SNIPPET = `curl -X POST https://your-lore-api.com/api/projects/register \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <ADMIN_SECRET>" \\
  -d '{
    "name": "my-project",
    "slug": "my-project",
    "stackTags": ["typescript", "nextjs"]
  }'`;

const RelativeDate = ({ isoDate }: { isoDate: string }) => {
  const date = new Date(isoDate);
  const relative = formatDistanceToNow(date, { addSuffix: true });
  return (
    <span title={date.toISOString()} className="text-sm text-muted-foreground">
      {relative}
    </span>
  );
};

const TagCell = ({ tags }: { tags: string[] }) => {
  const visible = tags.slice(0, MAX_VISIBLE_TAGS);
  const overflow = tags.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((tag) => (
        <Badge key={tag} variant="outline" className="font-mono text-[10px]">
          {tag}
        </Badge>
      ))}
      {overflow > 0 && (
        <Badge variant="secondary" className="text-[10px]">
          +{overflow} more
        </Badge>
      )}
    </div>
  );
};

const SkeletonRow = () => (
  <TableRow>
    <TableCell>
      <Skeleton className="h-4 w-32" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-4 w-24" />
    </TableCell>
    <TableCell>
      <div className="flex gap-1">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
      </div>
    </TableCell>
    <TableCell>
      <Skeleton className="h-4 w-8" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-4 w-20" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-8 w-16" />
    </TableCell>
  </TableRow>
);

const sortByCreatedAtDesc = (projects: Project[]): Project[] =>
  [...projects].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

export const AdminProjectsTable = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const projects = data ? sortByCreatedAtDesc(data) : [];

  return (
    <section aria-labelledby="projects-heading">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="projects-heading" className="text-base font-medium text-foreground">
          Projects
        </h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PlusIcon className="mr-1 size-4" />
              Add Project
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Register a New Project</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Use the Lore API to register a new project and receive an API key.
            </p>
            <ScrollArea className="max-h-48 rounded-md border border-border bg-muted p-3">
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">
                <code>{CURL_SNIPPET}</code>
              </pre>
            </ScrollArea>
            <DialogFooter showCloseButton />
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Stack Tags</TableHead>
            <TableHead>Lesson Count</TableHead>
            <TableHead>Created Date</TableHead>
            <TableHead>Keys</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
          ) : projects.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                No projects registered yet.
              </TableCell>
            </TableRow>
          ) : (
            projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell className="font-medium">{project.name}</TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-muted-foreground">{project.slug}</span>
                </TableCell>
                <TableCell>
                  <TagCell tags={project.stackTags} />
                </TableCell>
                <TableCell>{project.lessonCount}</TableCell>
                <TableCell>
                  <RelativeDate isoDate={project.createdAt} />
                </TableCell>
                <TableCell>
                  <ApiKeyManager
                    slug={project.slug}
                    keyId={project.keyId}
                    projectName={project.name}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
};
