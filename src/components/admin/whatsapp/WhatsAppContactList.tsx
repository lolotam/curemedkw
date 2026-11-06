import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useWhatsAppContacts } from "@/hooks/useWhatsAppInbox";
import { useI18n } from "@/lib/i18n";
import type { WhatsAppContact } from "@/lib/whatsappInbox";
import { ContactEditDialog } from "./ContactEditDialog";

/** Searchable contact list; choosing a contact opens its edit form. */
export function WhatsAppContactList() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<WhatsAppContact | null>(null);
  const contacts = useWhatsAppContacts(search);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder={t("admin.whatsapp.contact.search")}
            aria-label={t("admin.whatsapp.contact.search")} className="h-9 ps-8" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {contacts.isPending && <p className="p-4 text-sm text-muted-foreground">{t("common.loading")}</p>}
        {contacts.error && <p role="alert" className="p-4 text-sm text-destructive">{t("admin.whatsapp.contact.loadFailed")}</p>}
        {contacts.data?.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("admin.whatsapp.noMatches")}</p>}
        <ul>
          {contacts.data?.map(contact => (
            <li key={contact.id}>
              <button type="button" onClick={() => setEditing(contact)}
                className="flex w-full flex-col items-start border-b px-3 py-2.5 text-start transition-colors hover:bg-muted/60">
                <span className="truncate text-sm font-medium" dir="auto">
                  {contact.display_name.trim() || t("admin.whatsapp.unknownContact")}
                </span>
                {contact.business_name && <span className="truncate text-xs text-muted-foreground" dir="auto">{contact.business_name}</span>}
                <span className="text-xs text-muted-foreground" dir="ltr">
                  {contact.normalized_phone ? `+${contact.normalized_phone}` : t("admin.whatsapp.contact.noNumber")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {editing && <ContactEditDialog key={editing.id} contact={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
