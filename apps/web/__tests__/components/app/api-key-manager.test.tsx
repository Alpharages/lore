import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ApiKeyManager } from "@/components/app/api-key-manager";

const mockFetchProjectKey = vi.fn();
const mockRevokeApiKey = vi.fn();
const mockRegenerateApiKey = vi.fn();
const mockToast = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchProjectKey: (...args: unknown[]) => mockFetchProjectKey(...args),
  revokeApiKey: (...args: unknown[]) => mockRevokeApiKey(...args),
  regenerateApiKey: (...args: unknown[]) => mockRegenerateApiKey(...args),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const writeText = vi.fn();
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: { writeText },
});

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderManager = (
  props: { slug?: string; keyId?: string | null; projectName?: string } = {}
) => {
  const queryClient = createQueryClient();
  const keyId = "keyId" in props ? props.keyId! : "key-001";
  render(
    <QueryClientProvider client={queryClient}>
      <ApiKeyManager
        slug={props.slug ?? "lore"}
        keyId={keyId}
        projectName={props.projectName ?? "Lore Platform"}
      />
    </QueryClientProvider>
  );
  return { queryClient };
};

const openSheet = (projectName = "Lore Platform") => {
  fireEvent.click(screen.getByRole("button", { name: `Manage API keys for ${projectName}` }));
};

describe("ApiKeyManager", () => {
  beforeEach(() => {
    mockFetchProjectKey.mockReset();
    mockRevokeApiKey.mockReset();
    mockRegenerateApiKey.mockReset();
    mockToast.mockReset();
    writeText.mockReset();
  });

  describe("AC1 — Keys action + masked key display", () => {
    it("renders masked key in the Sheet when keyId is non-null", async () => {
      renderManager({ slug: "lore", keyId: "key-001" });
      openSheet();

      await waitFor(() => {
        expect(screen.getByText(/lore_lore_•{24}/)).toBeInTheDocument();
      });
    });

    it("renders 'No active key' in the Sheet when keyId is null", async () => {
      renderManager({ keyId: null });
      openSheet();

      await waitFor(() => {
        expect(screen.getByText("No active key")).toBeInTheDocument();
      });
    });

    it("disables Revoke when keyId is null and keeps Copy/Regenerate available", async () => {
      renderManager({ keyId: null, projectName: "Lore Platform" });
      openSheet();

      const revokeBtn = await screen.findByRole("button", {
        name: "Revoke API key for Lore Platform",
      });
      expect(revokeBtn).toBeDisabled();

      const copyBtn = screen.getByRole("button", {
        name: "Copy API key reference for Lore Platform",
      });
      const regenBtn = screen.getByRole("button", {
        name: "Regenerate API key for Lore Platform",
      });
      expect(copyBtn).toBeEnabled();
      expect(regenBtn).toBeEnabled();
    });
  });

  describe("AC2 — Copy calls fetchProjectKey and writes maskedKey to clipboard", () => {
    it("copies the server-returned maskedKey and toasts success", async () => {
      mockFetchProjectKey.mockResolvedValue({
        keyId: "key-001",
        maskedKey: "lore_lore_••••••••••••••••••••••••",
      });
      renderManager({ slug: "lore", keyId: "key-001" });
      openSheet();

      fireEvent.click(
        await screen.findByRole("button", { name: "Copy API key reference for Lore Platform" })
      );

      await waitFor(() => {
        expect(mockFetchProjectKey).toHaveBeenCalledWith("lore");
      });
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith("lore_lore_••••••••••••••••••••••••");
      });
      expect(mockToast).toHaveBeenCalledWith("Copied to clipboard.");
    });

    it("shows a 'No active key' toast when the server returns null maskedKey", async () => {
      mockFetchProjectKey.mockResolvedValue({ keyId: null, maskedKey: null });
      renderManager({ keyId: null });
      openSheet();

      fireEvent.click(
        await screen.findByRole("button", { name: "Copy API key reference for Lore Platform" })
      );

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith("No active key to copy.");
      });
      expect(writeText).not.toHaveBeenCalled();
    });

    it("toasts 'Action failed.' when fetchProjectKey throws", async () => {
      mockFetchProjectKey.mockRejectedValue(new Error("boom"));
      renderManager({ keyId: "key-001" });
      openSheet();

      fireEvent.click(
        await screen.findByRole("button", { name: "Copy API key reference for Lore Platform" })
      );

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith("Action failed. Please try again.");
      });
    });
  });

  describe("AC3 / AC6 — Regenerate flow", () => {
    it("opens a confirm Dialog, fires the mutation, and shows the new key", async () => {
      mockRegenerateApiKey.mockResolvedValue({
        key: "lore_lore_NEWKEY1234567890ABCDEFGH",
        keyId: "key-002",
      });
      const { queryClient } = renderManager({ slug: "lore", keyId: "key-001" });
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      openSheet();

      fireEvent.click(
        await screen.findByRole("button", { name: "Regenerate API key for Lore Platform" })
      );

      const confirmBtn = await screen.findByRole("button", {
        name: "Confirm regenerate API key for Lore Platform",
      });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockRegenerateApiKey).toHaveBeenCalledWith("lore");
      });
      await waitFor(() => {
        expect(screen.getByText("New API Key")).toBeInTheDocument();
      });
      expect(screen.getByText("lore_lore_NEWKEY1234567890ABCDEFGH")).toBeInTheDocument();
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects"] });
    });

    it("Copy and close copies the new key and clears it from state", async () => {
      mockRegenerateApiKey.mockResolvedValue({
        key: "lore_lore_NEWKEY1234567890ABCDEFGH",
        keyId: "key-002",
      });
      renderManager({ slug: "lore", keyId: "key-001" });
      openSheet();

      fireEvent.click(
        await screen.findByRole("button", { name: "Regenerate API key for Lore Platform" })
      );
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Confirm regenerate API key for Lore Platform",
        })
      );
      const copyAndCloseBtn = await screen.findByRole("button", { name: "Copy and close" });
      fireEvent.click(copyAndCloseBtn);

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith("lore_lore_NEWKEY1234567890ABCDEFGH");
      });
      expect(mockToast).toHaveBeenCalledWith("Copied to clipboard.");
      await waitFor(() => {
        expect(screen.queryByText("New API Key")).not.toBeInTheDocument();
      });
    });

    it("cancel on regenerate confirm does not fire the mutation", async () => {
      renderManager({ keyId: "key-001" });
      openSheet();
      fireEvent.click(
        await screen.findByRole("button", { name: "Regenerate API key for Lore Platform" })
      );

      const cancelBtn = await screen.findByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByText("Regenerate API key?")).not.toBeInTheDocument();
      });
      expect(mockRegenerateApiKey).not.toHaveBeenCalled();
    });

    it("toasts 'Action failed.' on regenerate error", async () => {
      mockRegenerateApiKey.mockRejectedValue(new Error("boom"));
      renderManager({ keyId: "key-001" });
      openSheet();

      fireEvent.click(
        await screen.findByRole("button", { name: "Regenerate API key for Lore Platform" })
      );
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Confirm regenerate API key for Lore Platform",
        })
      );

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith("Action failed. Please try again.");
      });
      expect(screen.queryByText("New API Key")).not.toBeInTheDocument();
    });
  });

  describe("AC4 / AC5 / AC7 — Revoke flow", () => {
    it("opens the destructive confirm Dialog with project name in the body", async () => {
      renderManager({ keyId: "key-001", projectName: "Lore Platform" });
      openSheet();

      fireEvent.click(
        await screen.findByRole("button", { name: "Revoke API key for Lore Platform" })
      );

      expect(await screen.findByText("Revoke API key?")).toBeInTheDocument();
      expect(
        screen.getByText(
          /This will immediately invalidate the key for Lore Platform. Agents using this key will lose access./
        )
      ).toBeInTheDocument();
    });

    it("Confirm fires DELETE, invalidates ['projects'], toasts success, closes Sheet", async () => {
      mockRevokeApiKey.mockResolvedValue(undefined);
      const { queryClient } = renderManager({
        slug: "lore",
        keyId: "key-001",
        projectName: "Lore Platform",
      });
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      openSheet();

      fireEvent.click(
        await screen.findByRole("button", { name: "Revoke API key for Lore Platform" })
      );
      const confirm = await screen.findByRole("button", {
        name: "Confirm revoke API key for Lore Platform",
      });
      fireEvent.click(confirm);

      await waitFor(() => {
        expect(mockRevokeApiKey).toHaveBeenCalledWith("lore", "key-001");
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects"] });
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith("API key revoked.");
      });
    });

    it("Cancel dismisses the confirm Dialog without firing the mutation", async () => {
      renderManager({ keyId: "key-001" });
      openSheet();

      fireEvent.click(
        await screen.findByRole("button", { name: "Revoke API key for Lore Platform" })
      );

      const dialog = await screen.findByRole("dialog");
      const cancelBtn = within(dialog).getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByText("Revoke API key?")).not.toBeInTheDocument();
      });
      expect(mockRevokeApiKey).not.toHaveBeenCalled();
    });

    it("toasts 'Action failed.' and closes Dialog on mutation error", async () => {
      mockRevokeApiKey.mockRejectedValue(new Error("boom"));
      renderManager({ keyId: "key-001" });
      openSheet();

      fireEvent.click(
        await screen.findByRole("button", { name: "Revoke API key for Lore Platform" })
      );
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Confirm revoke API key for Lore Platform",
        })
      );

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith("Action failed. Please try again.");
      });
      await waitFor(() => {
        expect(screen.queryByText("Revoke API key?")).not.toBeInTheDocument();
      });
    });
  });

  describe("AC9 — Accessibility", () => {
    it("provides aria-labels on all icon-only triggers", async () => {
      renderManager({ keyId: "key-001", projectName: "Lore Platform" });
      openSheet();

      expect(
        await screen.findByRole("button", { name: "Copy API key reference for Lore Platform" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Regenerate API key for Lore Platform" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Revoke API key for Lore Platform" })
      ).toBeInTheDocument();
    });

    it("Sheet exposes a description for screen readers (no Radix warning)", async () => {
      renderManager({ keyId: "key-001", projectName: "Lore Platform" });
      openSheet();

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveAttribute("aria-describedby");
      const descId = dialog.getAttribute("aria-describedby");
      expect(descId).toBeTruthy();
      expect(document.getElementById(descId!)).toBeInTheDocument();
    });
  });
});
