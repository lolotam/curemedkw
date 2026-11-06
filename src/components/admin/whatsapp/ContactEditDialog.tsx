import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateWhatsAppContact, type ContactPatch } from "@/hooks/useWhatsAppInbox";
import { useI18n } from "@/lib/i18n";
import type { WhatsAppContact } from "@/lib/whatsappInbox";
import { normalizeContactPhone } from "@/lib/whatsappInboxView";

const FAILURE_KEYS: Record<string, string> = {
  phone_in_use: "admin.whatsapp.contact.phoneInUse",
  phone_locked: "admin.whatsapp.contact.phoneLocked",
  invalid_phone: "admin.whatsapp.contact.invalidPhone",
};

const PROFILE_FIELDS = ["display_name", "business_name", "email", "notes"] as const;
type ProfileField = typeof PROFILE_FIELDS[number];

/** Only the fields that changed, so an untouched field is never rewritten from a stale copy. */
function changedFields(contact: WhatsAppContact, form: Record<ProfileField, string>, phone: string): ContactPatch {
  const patch: ContactPatch = {};
  for (const field of PROFILE_FIELDS) {
    const value = field === "notes" ? form[field] : form[field].trim();
    if (value !== contact[field]) patch[field] = value;
  }
  if (phone) patch.phone = phone;
  return patch;
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

/**
 * Edits a contact. Name, business name, email and notes are always editable. A number can only be
 * added to a contact that has none (an @lid contact); the server refuses one that another chat or
 * contact already uses, so chats are never merged or moved from here.
 */
export function ContactEditDialog({ contact, onClose }: { contact: WhatsAppContact; onClose: () => void }) {
  const { t } = useI18n();
  const update = useUpdateWhatsAppContact();
  const [form, setForm] = useState<Record<ProfileField, string>>(() => ({
    display_name: contact.display_name, business_name: contact.business_name, email: contact.email, notes: contact.notes,
  }));
  const [phoneInput, setPhoneInput] = useState("");
  const canAttachPhone = !contact.normalized_phone && !!contact.remote_jid;
  const phone = canAttachPhone ? normalizeContactPhone(phoneInput) : "";
  const patch = changedFields(contact, form, phone);
  const set = (field: ProfileField) => (event: { target: { value: string } }) => setForm({ ...form, [field]: event.target.value });

  function save() {
    update.mutate({ contactId: contact.id, patch }, {
      onSuccess: () => { toast.success(t("admin.whatsapp.contact.saved")); onClose(); },
      onError: failure => toast.error(t(FAILURE_KEYS[failure.message] ?? "admin.whatsapp.contact.saveFailed")),
    });
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.whatsapp.contact.editTitle")}</DialogTitle>
          <DialogDescription dir="ltr">{contact.normalized_phone ? `+${contact.normalized_phone}` : t("admin.whatsapp.contact.noNumber")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field id="contact-name" label={t("admin.whatsapp.contact.name")}>
            <Input id="contact-name" value={form.display_name} onChange={set("display_name")} maxLength={200} dir="auto" />
          </Field>
          <Field id="contact-business" label={t("admin.whatsapp.contact.business")}>
            <Input id="contact-business" value={form.business_name} onChange={set("business_name")} maxLength={200} dir="auto" />
          </Field>
          <Field id="contact-email" label={t("admin.whatsapp.contact.email")}>
            <Input id="contact-email" type="email" value={form.email} onChange={set("email")} maxLength={320} dir="ltr" />
          </Field>
          <Field id="contact-notes" label={t("admin.whatsapp.contact.notes")}>
            <Textarea id="contact-notes" value={form.notes} onChange={set("notes")} maxLength={4000} rows={3} dir="auto" />
          </Field>
          {canAttachPhone && (
            <Field id="contact-phone" label={t("admin.whatsapp.contact.phone")}>
              <Input id="contact-phone" value={phoneInput} onChange={event => setPhoneInput(event.target.value)} inputMode="tel"
                placeholder="96550000000" dir="ltr" aria-describedby="contact-phone-hint" />
              <p id="contact-phone-hint" className="text-xs text-muted-foreground">{t("admin.whatsapp.contact.phoneHint")}</p>
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("admin.whatsapp.cancel")}</Button>
          <Button onClick={save} disabled={Object.keys(patch).length === 0 || update.isPending}>{t("admin.whatsapp.contact.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
