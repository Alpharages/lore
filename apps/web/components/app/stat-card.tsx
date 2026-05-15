"use client";

import { Card } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: number;
  secondary?: string;
}

export const StatCard = ({ label, value, secondary }: StatCardProps) => (
  <Card className="p-6">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-2 text-4xl font-bold text-primary">{value.toLocaleString()}</p>
    {secondary && <p className="mt-1 text-sm text-muted-foreground">{secondary}</p>}
  </Card>
);
