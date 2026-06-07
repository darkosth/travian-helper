"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SettingsFormProps = {
  mode: "create" | "edit";
  onSaved?: () => void;
  profile?: {
    id: string;
    serverUrl: string;
    username: string;
  } | null;
};

export function SettingsForm({ mode, onSaved, profile }: SettingsFormProps) {
  const router = useRouter();
  const [serverUrl, setServerUrl] = useState(profile?.serverUrl ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const response = await fetch("/api/settings/credentials", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profileId: profile?.id,
          serverUrl,
          username,
          password: password.length > 0 ? password : undefined,
        }),
      });

      const result = (await response.json()) as {
        ok: boolean;
        error?: string;
        errors?: Array<{ message?: string }>;
      };

      if (!response.ok || !result.ok) {
        setFeedback(
          result.error ?? result.errors?.[0]?.message ?? "Could not save credentials.",
        );
        return;
      }

      setPassword("");
      setFeedback(mode === "create" ? "Profile saved and activated." : "Profile updated.");
      onSaved?.();
      router.refresh();
    });
  };

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-sm font-medium text-stone-100">
          <Shield className="size-4 text-amber-300" />
          {mode === "create" ? "New connection profile" : "Edit connection profile"}
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="serverUrl">Server URL</Label>
        <Input
          id="serverUrl"
          value={serverUrl}
          onChange={(event) => setServerUrl(event.target.value)}
          placeholder="https://ts3.x1.europe.travian.com"
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Darkosth"
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">
          Password {mode === "edit" ? <span className="text-stone-500">(optional)</span> : null}
        </Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={mode === "edit" ? "Mantener actual" : "Password"}
          required={mode === "create"}
        />
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-sm text-stone-400">{feedback}</p>
        <Button disabled={isPending} size="lg" type="submit">
          <Save />
          {isPending ? "Saving..." : mode === "create" ? "Create profile" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
