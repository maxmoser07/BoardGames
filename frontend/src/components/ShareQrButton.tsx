import { useCallback, useRef, useState } from "react";
import { QrCode as QrCodeIcon } from "lucide-react";

import { ShareQrDialog } from "./ShareQrDialog";
import { catalogUrl, playUrlFor } from "../lib/shareUrl";

interface Props {
  /** Spielname fuer die Direktpartie-URL. Fehlt er, wird der Katalog verlinkt. */
  gameName?: string;
  /** Zusaetzliche CSS-Klasse fuer den Ausloeser. */
  className?: string;
  /** Beschriftung des Ausloesers. */
  label?: string;
}

/**
 * Wiederverwendbarer Ausloeser, der den QR-Dialog fuer eine teilbare URL oeffnet.
 * Fuer alle Rollen verfuegbar (keine Host/Admin-Beschaenkung).
 */
export function ShareQrButton({ gameName, className, label = "QR-Code" }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const handleClose = useCallback(() => setOpen(false), []);

  const url = gameName ? playUrlFor(gameName, window.location.origin) : catalogUrl(window.location.origin);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className ?? "btn btn--ghost btn--sm"}
        onClick={() => setOpen(true)}
        aria-label={`${label} erzeugen`}
      >
        <QrCodeIcon aria-hidden="true" size={15} />
        {label}
      </button>
      {open ? <ShareQrDialog onClose={handleClose} url={url} /> : null}
    </>
  );
}