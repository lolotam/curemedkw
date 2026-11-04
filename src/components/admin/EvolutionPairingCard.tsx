// Curemed — the WhatsApp pairing card of the admin area.
//
// The card shows the state of the fixed Curemed Evolution instance and, on
// an explicit action, the pairing QR that the administrator scans with the
// WhatsApp application of the business phone.
//
// What it deliberately does not do
// -------------------------------
//   * It never connects on its own. The state may be read on mount and on
//     an explicit refresh; a QR is only ever requested by an explicit
//     click, never by a timer, a retry or a mount.
//   * It never keeps the QR anywhere. The QR lives in the memory of this
//     component and is dropped when the dialog closes, when the component
//     unmounts, when the session changes, when a request fails, when a new
//     request starts and when the local display time is over.
//   * It never writes to the console, to the query cache, to local storage,
//     to session storage or to analytics, and it never offers a download of
//     the QR.
//   * It never offers a logout, a reset or a delete of the session, and it
//     never claims that a message is authorized by a pairing.
//
// The card is a read and a pairing surface only. It never changes an
// integration setting and it never enables automation.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, QrCode, RefreshCw, Smartphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EVOLUTION_QR_DISPLAY_MS,
  evolutionPairingClient,
  evolutionPairingMessage,
  subscribeToPairingAuthChanges,
  type EvolutionConnection,
  type EvolutionConnectionState,
  type EvolutionPairingClient,
} from "@/lib/evolutionPairing";

export interface EvolutionPairingCardProps {
  /** The pairing client. The runtime client is the default. */
  readonly client?: EvolutionPairingClient;
  /** How long the QR is shown. The production default is one minute. */
  readonly qrLifetimeMs?: number;
}

type LoadState = "loading" | "ready" | "error";

const STATE_LABELS: Record<EvolutionConnectionState, string> = {
  connected: "Connected",
  disconnected: "Not connected",
  connecting: "Pairing in progress",
  unknown: "Status unknown",
};

const STATE_HINTS: Record<EvolutionConnectionState, string> = {
  connected:
    "The business phone is paired. A paired session is kept until the phone unlinks it.",
  disconnected:
    "No business phone is paired with this instance yet.",
  connecting: "The pairing was started. Finish the scan on the phone.",
  unknown:
    "The instance did not report a state this screen can name. Nothing is assumed.",
};

/**
 * The WhatsApp pairing card. It is read only with respect to every setting
 * of the page it lives on.
 */
export function EvolutionPairingCard({
  client = evolutionPairingClient,
  qrLifetimeMs = EVOLUTION_QR_DISPLAY_MS,
}: EvolutionPairingCardProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [connection, setConnection] = useState<EvolutionConnection | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrExpired, setQrExpired] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // The generation fences a late answer of an older request.
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  // The flag fences a second connect in the same frame.
  const connectPendingRef = useRef(false);
  const sessionIdentityRef = useRef<{ initialized: boolean; userId: string | null }>({ initialized: false, userId: null });

  const dropQr = useCallback(() => {
    setQrDataUrl(null);
    setQrExpired(false);
    setDialogOpen(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);


  const readStatus = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setLoadState("loading");
    setErrorMessage(null);
    dropQr();

    const result = await client.readStatus();
    if (!mountedRef.current || generation !== generationRef.current) return;
    if (result.ok === true) {
      setConnection({ state: result.connection.state, qrDataUrl: null });
      setLoadState("ready");
      return;
    }
    setConnection(null);
    setErrorMessage(result.message);
    setLoadState("error");
  }, [client, dropQr]);

  // A session change drops the pairing QR of the old session.
  // A same-user focus/refresh event is not an identity change.
  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToPairingAuthChanges((event, userId) => {
      const previous = sessionIdentityRef.current;
      const first = !previous.initialized;
      const changed = previous.initialized && previous.userId !== userId;
      sessionIdentityRef.current = { initialized: true, userId: event === "SIGNED_OUT" ? null : userId };
      if (first && event === "INITIAL_SESSION") return;
      if (event !== "SIGNED_OUT" && !changed && !first && userId !== null) return;

      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      const generation = ++generationRef.current;
      dropQr();
      setConnection(null);
      if (event === "SIGNED_OUT" || userId === null) {
        setErrorMessage(evolutionPairingMessage("unauthorized"));
        setLoadState("error");
        return;
      }
      setErrorMessage(null);
      setLoadState("loading");
      // Return from Supabase's auth callback before asking it for a token.
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        if (mountedRef.current && generation === generationRef.current) void readStatus();
      }, 0);
    });
    return () => {
      unsubscribe();
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    };
  }, [dropQr, readStatus]);

  // The state may be read on mount. It never connects.
  useEffect(() => {
    void readStatus();
  }, [readStatus]);

  const requestQr = useCallback(async () => {
    // A second click in the same frame must not start a second connect.
    if (connectPendingRef.current) return;
    connectPendingRef.current = true;

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setBusy(true);
    setErrorMessage(null);
    dropQr();

    try {
      const result = await client.requestConnect();
      if (!mountedRef.current || generation !== generationRef.current) return;
      if (result.ok === false) {
        setConnection(null);
        setErrorMessage(result.message);
        setLoadState("error");
        return;
      }
      setConnection({ state: result.connection.state, qrDataUrl: null });
      setLoadState("ready");
      if (result.connection.qrDataUrl) {
        setQrDataUrl(result.connection.qrDataUrl);
        setDialogOpen(true);
      }
    } finally {
      connectPendingRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }, [client, dropQr]);

  // The QR is shown for a bounded time only. The expiry is local: nothing
  // is claimed about the provider side.
  useEffect(() => {
    if (!qrDataUrl) return;
    const timer = window.setTimeout(() => {
      setQrDataUrl(null);
      setQrExpired(true);
      setDialogOpen(false);
    }, qrLifetimeMs);
    return () => window.clearTimeout(timer);
  }, [qrDataUrl, qrLifetimeMs]);

  const state: EvolutionConnectionState = connection?.state ?? "unknown";
  const isConnected = state === "connected";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-muted-foreground" />
          <p className="text-base font-medium">WhatsApp pairing</p>
        </div>
        <Badge variant={isConnected ? "default" : "secondary"}>
          {loadState === "loading" ? "Checking" : STATE_LABELS[state]}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Pair the business phone with the Curemed WhatsApp instance. Pairing a
        phone does not send messages by itself, and it does not change any
        setting of this page.
      </p>

      {loadState === "error" && errorMessage && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">{errorMessage}</p>
        </div>
      )}

      {loadState === "ready" && (
        <p className="text-xs text-muted-foreground">{STATE_HINTS[state]}</p>
      )}

      {qrExpired && (
        <p className="text-xs text-muted-foreground">
          The pairing code is no longer shown here. Refresh to request a new
          one.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => void readStatus()}
          disabled={busy}
        >
          <RefreshCw className="h-4 w-4" />
          <span className="ml-2">Refresh status</span>
        </Button>
        <Button
          type="button"
          onClick={() => void requestQr()}
          disabled={busy || isConnected}
        >
          {busy
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <QrCode className="h-4 w-4" />}
          <span className="ml-2">
            {isConnected ? "Paired" : "Show pairing code"}
          </span>
        </Button>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (open) return;
          generationRef.current += 1;
          dropQr();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pair the business phone</DialogTitle>
            <DialogDescription>
              Open WhatsApp on the business phone, choose Linked devices and
              then Link a device. Scan the code below with that phone. The
              code is shown for one minute only; ask for a new one when it is
              gone.
            </DialogDescription>
          </DialogHeader>
          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt="WhatsApp pairing QR code"
              className="mx-auto h-56 w-56 rounded-xl border border-border bg-white p-2"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
