// Shipa — the configuration editor of one environment.
//
// This module owns the editor of the non-secret draft of one environment, the
// selector of the environment being edited and the two confirmations an
// administrator gives explicitly.
//
// The draft model itself — the types and the write payload builder — lives in
// `@/lib/shipaAdminDraft`, re-exported by the transport module.
//
// Nothing here is a secret, and nothing here can book a shipment.

import type { ReactNode } from "react";
import { MapPin, Package, Wand2 } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ShipaDimensionsText } from "@/lib/shipaAdmin";
import {
  type DispatchMode,
  KUWAIT_COUNTRY_CODE,
  SHIPA_MAX_PICKUP_INSTRUCTIONS_LENGTH,
  SHIPA_SERVICE_CODES,
  type ShipaEnvironment,
  type ShipaPublicSettings,
  type ShipaPublicSettingsPatch,
} from "@/lib/shipaSettings";

// ---------------------------------------------------------------------------
// The environment picker
// ---------------------------------------------------------------------------

export interface ShipaEnvironmentPickerProps {
  readonly environment: ShipaEnvironment;
  readonly busy: boolean;
  readonly onChange: (environment: ShipaEnvironment) => void;
}

/**
 * The environment whose draft is being edited.
 *
 * It is a separate control from the active environment, and changing it clears
 * any typed key.
 */
export function ShipaEnvironmentPicker({
  environment,
  busy,
  onChange,
}: ShipaEnvironmentPickerProps) {
  return (
    <fieldset className="space-y-2" disabled={busy}>
      <legend className="text-sm font-semibold">Editing environment</legend>
      <p className="text-xs text-muted-foreground">
        The environment whose draft you are editing. Both drafts are kept separately, and changing
        this clears any typed key.
      </p>
      <div className="flex flex-wrap gap-2">
        {(["sandbox", "live"] as const).map((option) => (
          <Button
            key={option}
            type="button"
            variant={environment === option ? "default" : "outline"}
            size="sm"
            aria-pressed={environment === option}
            onClick={() => onChange(option)}
          >
            {option === "live" ? "Live" : "Sandbox"}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// The confirmations
// ---------------------------------------------------------------------------

export interface ShipaConfirmationDialogsProps {
  readonly liveOpen: boolean;
  readonly liveMode: DispatchMode;
  readonly onLiveOpenChange: (open: boolean) => void;
  readonly onConfirmLive: () => void;
  readonly reloadOpen: boolean;
  readonly onReloadOpenChange: (open: boolean) => void;
  readonly onConfirmReload: () => void;
}

/**
 * The two confirmations an administrator gives explicitly.
 *
 * The live confirmation names the mode, the environment and the consequences
 * before anything is saved. The reload confirmation discards the unsaved edits
 * only when it is accepted.
 */
export function ShipaConfirmationDialogs({
  liveOpen,
  liveMode,
  onLiveOpenChange,
  onConfirmLive,
  reloadOpen,
  onReloadOpenChange,
  onConfirmReload,
}: ShipaConfirmationDialogsProps) {
  return (
    <>
      <AlertDialog open={liveOpen} onOpenChange={onLiveOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable the live environment?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  Mode: {liveMode === "automatic_after_payment"
                    ? "Automatic after verified payment"
                    : "Manual after packing"}
                  . Environment: Live.
                </p>
                <p className="mt-2">
                  Queued work keeps the environment it was queued for. Shipments that already
                  started are not cancelled. Switching to automatic does not book orders that were
                  already paid.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmLive}>
              Save the live configuration
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reloadOpen} onOpenChange={onReloadOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard the unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Reloading replaces the edits on this page with the configuration the server currently
              stores. Any typed API key is discarded as well.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my edits</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmReload}>Discard and reload</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// The per-environment fields
// ---------------------------------------------------------------------------

export interface ShipaEnvironmentFieldsProps {
  /** The environment this editor shows. */
  readonly environment: ShipaEnvironment;
  /** The saved or drafted non-secret values of that environment. */
  readonly value: ShipaPublicSettings;
  /** The raw weight text, so a partial entry is never rewritten. */
  readonly weightText: string;
  /** The raw dimension text, so a partial entry is never rewritten. */
  readonly dimensionsText: ShipaDimensionsText;
  /** Local validation messages that block a save. */
  readonly errors?: readonly string[];
  /** True while a save is running. */
  readonly disabled?: boolean;
  /** Applies a patch to this environment. */
  readonly onPatch: (patch: ShipaPublicSettingsPatch) => void;
  /** Reports the new raw weight text. */
  readonly onWeightText: (text: string) => void;
  /** Reports the new raw dimension text. */
  readonly onDimensionsText: (text: ShipaDimensionsText) => void;
  /** Fills the non-secret CureMed pickup details. */
  readonly onApplyCuremedPickup: () => void;
}

export function ShipaEnvironmentFields({
  environment,
  value,
  weightText,
  dimensionsText,
  errors,
  disabled,
  onPatch,
  onWeightText,
  onDimensionsText,
  onApplyCuremedPickup,
}: ShipaEnvironmentFieldsProps) {
  const address = value.origin.address;
  const patchAddress = (patch: Partial<typeof address>) => onPatch({ origin: { address: patch } });

  const renderTextField = ({ id, label, current, onChange, hint }: {
    id: string;
    label: string;
    current: string;
    onChange: (next: string) => void;
    hint?: string;
  }) => (
    <Field id={id} label={label} hint={hint}>
      <Input
        id={id}
        value={current}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
      />
    </Field>
  );

  return (
    <div className="space-y-6">
      {errors && errors.length > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <ul className="list-disc space-y-1 pl-4">
            {errors.map((message) => <li key={message}>{message}</li>)}
          </ul>
        </div>
      )}

      <fieldset className="space-y-4" disabled={disabled}>
        <legend className="text-sm font-semibold">Shipa application</legend>
        {renderTextField({
          id: `shipa-app-id-${environment}`,
          label: "App ID (optional)",
          current: value.appId ?? "",
          onChange: (next) => onPatch({ appId: next }),
          hint: "The non-secret application identifier of this environment.",
        })}
      </fieldset>

      <fieldset className="space-y-4" disabled={disabled}>
        <legend className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="h-4 w-4" /> Pickup origin
        </legend>

        <div className="grid gap-4 md:grid-cols-2">
          {renderTextField({
            id: `shipa-contact-name-${environment}`,
            label: "Contact name",
            current: value.origin.contactName,
            onChange: (next) => onPatch({ origin: { contactName: next } }),
          })}
          {renderTextField({
            id: `shipa-contact-phone-${environment}`,
            label: "Contact phone",
            current: value.origin.contactPhone,
            onChange: (next) => onPatch({ origin: { contactPhone: next } }),
          })}
          <Field
            id={`shipa-country-${environment}`}
            label="Country"
            hint="Kuwait is fixed for this release; the country is not editable."
          >
            <Input id={`shipa-country-${environment}`} value="Kuwait (KW)" disabled readOnly />
          </Field>
          {renderTextField({
            id: `shipa-governorate-${environment}`,
            label: "Governorate",
            current: address.governorate,
            onChange: (next) => patchAddress({ governorate: next }),
          })}
          {renderTextField({
            id: `shipa-area-${environment}`,
            label: "Area",
            current: address.area,
            onChange: (next) => patchAddress({ area: next }),
          })}
          {renderTextField({
            id: `shipa-block-${environment}`,
            label: "Block (optional)",
            current: address.block,
            onChange: (next) => patchAddress({ block: next }),
          })}
          {renderTextField({
            id: `shipa-street-${environment}`,
            label: "Street",
            current: address.street,
            onChange: (next) => patchAddress({ street: next }),
          })}
          {renderTextField({
            id: `shipa-building-${environment}`,
            label: "Building",
            current: address.building,
            onChange: (next) => patchAddress({ building: next }),
          })}
        </div>

        <Field
          id={`shipa-address-line-${environment}`}
          label="Address line"
          hint="Governorate and area are always required. With no address line, the street and the building identify the pickup point."
        >
          <Textarea
            id={`shipa-address-line-${environment}`}
            value={address.addressLine}
            onChange={(event) => patchAddress({ addressLine: event.target.value })}
            rows={2}
            placeholder="A freeform pickup address, or leave it empty and fill in street and building."
          />
        </Field>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onApplyCuremedPickup}
          className="w-fit"
        >
          <Wand2 className="mr-2 h-4 w-4" /> Use CureMed pickup details
        </Button>
      </fieldset>

      <fieldset className="space-y-4" disabled={disabled}>
        <legend className="text-sm font-semibold">Delivery service</legend>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`shipa-service-${environment}`}>Service</Label>
            <Select
              value={value.serviceCode ?? "none"}
              onValueChange={(next) =>
                onPatch({
                  serviceCode: next === "none"
                    ? null
                    : (next as (typeof SHIPA_SERVICE_CODES)[number]),
                })}
            >
              <SelectTrigger id={`shipa-service-${environment}`}>
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {SHIPA_SERVICE_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline">Merchant availability: UNCONFIRMED</Badge>
            <p className="text-xs text-muted-foreground">
              The captured service vocabulary is not a merchant entitlement. The server still
              decides which service an order may use.
            </p>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor={`shipa-auto-confirm-${environment}`}>
                Skip receiver confirmation
              </Label>
              <Switch
                id={`shipa-auto-confirm-${environment}`}
                checked={value.autoConfirm}
                onCheckedChange={(checked) => onPatch({ autoConfirm: checked })}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              On: Shipa skips the receiver-confirmation SMS. Off (the default): the documented
              receiver-confirmation SMS is kept.
            </p>
          </div>
        </div>

        <Field
          id={`shipa-instructions-${environment}`}
          label="Pickup instructions"
          hint={`${value.pickupInstructions.length} of ${SHIPA_MAX_PICKUP_INSTRUCTIONS_LENGTH} characters.`}
        >
          <Textarea
            id={`shipa-instructions-${environment}`}
            value={value.pickupInstructions}
            onChange={(event) => onPatch({ pickupInstructions: event.target.value })}
            rows={3}
            maxLength={SHIPA_MAX_PICKUP_INSTRUCTIONS_LENGTH}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4" disabled={disabled}>
        <legend className="flex items-center gap-2 text-sm font-semibold">
          <Package className="h-4 w-4" /> Parcel defaults
        </legend>

        <div className="grid gap-4 md:grid-cols-2">
          <Field
            id={`shipa-parcel-count-${environment}`}
            label="Parcels per order"
            hint="One parcel per order is fixed for this release."
          >
            <Input id={`shipa-parcel-count-${environment}`} value="1" disabled readOnly />
          </Field>
          {renderTextField({
            id: `shipa-parcel-weight-${environment}`,
            label: "Weight (kg)",
            current: weightText,
            onChange: onWeightText,
            hint: "Explicit weight in kilograms. An empty field means no weight is configured.",
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {renderTextField({
            id: `shipa-length-${environment}`,
            label: "Length (cm)",
            current: dimensionsText.lengthCm,
            onChange: (next) => onDimensionsText({ ...dimensionsText, lengthCm: next }),
          })}
          {renderTextField({
            id: `shipa-width-${environment}`,
            label: "Width (cm)",
            current: dimensionsText.widthCm,
            onChange: (next) => onDimensionsText({ ...dimensionsText, widthCm: next }),
          })}
          {renderTextField({
            id: `shipa-height-${environment}`,
            label: "Height (cm)",
            current: dimensionsText.heightCm,
            onChange: (next) => onDimensionsText({ ...dimensionsText, heightCm: next }),
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Dimensions are optional, but all three must be given together. A negative or a partial
          number is kept as typed and blocks the save until it is corrected.
        </p>
      </fieldset>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint !== undefined && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
