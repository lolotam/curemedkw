// Shipa — the credential panel of one environment.
//
// This panel is the only place a plaintext API key is typed. The application
// never persists it in browser storage. The field starts empty, never shows the stored key, and
// never offers a reveal: the server returns presence and rotation metadata
// only.
//
// A blank field preserves the stored key. Removing a key is a separate,
// explicitly confirmed action that applies to the selected environment only.

import { KeyRound, ShieldCheck, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ShipaCredentialMetadata, ShipaEnvironment } from "@/lib/shipaSettings";

export interface ShipaCredentialPanelProps {
  /** The environment this panel edits. */
  readonly environment: ShipaEnvironment;
  /** The read-only presence metadata the server returned. */
  readonly credential: ShipaCredentialMetadata;
  /** The transient key text. It is never persisted. */
  readonly apiKeyText: string;
  /** True while a request is running. */
  readonly busy?: boolean;
  /** True while the removal confirmation is open. */
  readonly removeConfirmOpen: boolean;
  /** Opens or closes the removal confirmation. */
  readonly onRemoveConfirmOpenChange: (open: boolean) => void;
  /** Reports the new transient key text. */
  readonly onApiKeyText: (text: string) => void;
  /** Saves the key. A blank field keeps the stored key. */
  readonly onSaveKey: () => void;
  /** Removes the key of this environment. */
  readonly onRemoveKey: () => void;
}

export function ShipaCredentialPanel({
  environment,
  credential,
  apiKeyText,
  busy,
  removeConfirmOpen,
  onRemoveConfirmOpenChange,
  onApiKeyText,
  onSaveKey,
  onRemoveKey,
}: ShipaCredentialPanelProps) {
  const environmentLabel = environment === "live" ? "Live" : "Sandbox";
  const hasStoredKey = credential.present;
  const keyFieldId = `shipa-api-key-${environment}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">API key — {environmentLabel}</h3>
        {hasStoredKey
          ? <Badge variant="secondary">Key stored</Badge>
          : <Badge variant="outline">No key stored</Badge>}
      </div>

      <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="inline font-medium text-foreground">Stored key:</dt>
          <dd className="inline">{hasStoredKey ? "present" : "not present"}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-foreground">Rotated:</dt>
          <dd className="inline">{credential.rotatedAt ?? "never"}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-foreground">Key version:</dt>
          <dd className="inline">{credential.keyVersion ?? "none"}</dd>
        </div>
      </dl>

      <div className="space-y-1.5">
        <Label htmlFor={keyFieldId}>New API key</Label>
        <Input
          id={keyFieldId}
          type="password"
          value={apiKeyText}
          onChange={(event) => onApiKeyText(event.target.value)}
          placeholder="Paste a new key"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">
          The stored key is never shown and cannot be retrieved. An empty field keeps the stored
          key; a new key replaces it. The key is cleared as soon as the request finishes, and it is
          never stored in the browser.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={onSaveKey} disabled={busy}>
          {apiKeyText.trim() === "" ? "Keep stored key" : "Save new key"}
        </Button>
        {hasStoredKey && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onRemoveConfirmOpenChange(true)}
            disabled={busy}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Remove key
          </Button>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Shipa Delivery V2 uses an API key only; there is no app secret to enter.
      </p>

      <AlertDialog open={removeConfirmOpen} onOpenChange={onRemoveConfirmOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the {environmentLabel} API key?</AlertDialogTitle>
            <AlertDialogDescription>
              The stored key of the {environmentLabel}{" "}
              environment is removed. Orders that were already dispatched with it are not cancelled,
              and the key cannot be restored from here — a new key must be entered again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the key</AlertDialogCancel>
            <AlertDialogAction onClick={onRemoveKey}>Remove the key</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
