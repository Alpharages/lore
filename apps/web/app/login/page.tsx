"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login } from "@/lib/api";

const LoginPage = () => {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = e.currentTarget;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    try {
      await login(password);
      router.push("/lessons");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg === "Network error" ? "Network error. Please try again." : "Incorrect password.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="bg-card border border-border rounded-lg p-8 shadow-md">
          <div className="mb-6 text-center">
            <span className="text-2xl font-bold tracking-tight text-primary">Lore</span>
            <h1 className="mt-2 text-lg font-medium text-foreground">Welcome back</h1>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              name="password"
              placeholder="Password"
              autoFocus
              required
              aria-label="Password"
            />
            {error && (
              <p className="text-sm text-red-500" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
