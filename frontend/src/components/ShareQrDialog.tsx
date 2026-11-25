import { useEffect, useRef, useState } from "react";
import { Copy, Check, QrCode as QrCodeIcon, X } from "lucide-react";

import { toString } from "qrcode";

interface Props {
  onClose: () => void;
  url: string;
  /** Optionales Label fuer aria-label des Dialogs. */
  title?: string;
}

type CopyState = "idle" | "success" | "error";

/**
 * Modal mit einem client-seitig erzeugten QR-Code (SVG) fuer eine teilbare URL.
 * Focus-Falle, Escape zum Schliessen, Fokus-Rueckgabe an den Ausloeser.
 */
export function ShareQrDialog({ onClose, url, title = "QR-Code teilen" }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const [svg, setSvg] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  // QR-Code erzeugen, sobald der Dialog geoeffnet ist (Komponente mountet erst dann).
  useEffect(() => {
    let cancelled = false;

    toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" })
      .then((result) => {
        if (!cancelled) setSvg(result);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setQrError(`QR-Code konnte nicht erzeugt werden: ${message}`);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Fokus merken und in den Dialog holen; bei Schliessen zurueckgeben.
  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      previousFocusRef.current?.focus?.();
    };
  }, []);

  // Escape schliesst; Tab bleibt im Dialog.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleCopy(): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopyState("success");
      } else {
        throw new Error("clipboard unavailable");
      }
    } catch {
      try {
        inputRef.current?.focus();
        inputRef.current?.select();
        const ok = document.execCommand("copy");
        setCopyState(ok ? "success" : "error");
      } catch {
        setCopyState("error");
      }
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  }

  return (
    <div
      className="share-qr-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="share-qr-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="share-qr-dialog__head">
          <h2 className="share-qr-dialog__title">
            <QrCodeIcon aria-hidden="true" size={18} />
            {title}
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--sm share-qr-dialog__close"
            onClick={onClose}
            aria-label="Dialog schliessen"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </header>

        <div className="share-qr-dialog__body">
          {qrError ? (
            <p className="notice notice--danger" role="alert">
              {qrError}
            </p>
          ) : svg ? (
            <div
              className="share-qr-dialog__code"
              // SVG kommt aus der lokalen qrcode-Bibliothek und ist vertrauenswuerdig.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <p className="share-qr-dialog__loading">QR-Code wird erzeugt…</p>
          )}

          <label className="share-qr-dialog__url-label" htmlFor="share-qr-url">
            Link
          </label>
          <input
            id="share-qr-url"
            ref={inputRef}
            type="text"
            readOnly
            value={url}
            className="input share-qr-dialog__url"
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Zu teilender Link"
          />

          <div className="share-qr-dialog__actions">
            <button type="button" className="btn btn--primary" onClick={handleCopy}>
              <Copy aria-hidden="true" size={16} />
              {copyState === "success"
                ? "Kopiert"
                : copyState === "error"
                  ? "Kopieren fehlgeschlagen"
                  : "Link kopieren"}
            </button>
            {copyState === "success" ? (
              <span className="share-qr-dialog__status" role="status">
                <Check aria-hidden="true" size={14} /> In die Zwischenablage kopiert
              </span>
            ) : null}
            {copyState === "error" ? (
              <span className="share-qr-dialog__status share-qr-dialog__status--error" role="alert">
                Bitte den Link manuell markieren und kopieren.
              </span>
            ) : null}
          </div>

          <p className="share-qr-dialog__hint">
            Der QR-Code nutzt <code>window.location.origin</code>. Andere Geräte können den Link nur öffnen,
            wenn diese Instanz über eine Netzwerk-IP oder HTTPS erreichbar ist.
          </p>
        </div>
      </div>
    </div>
  );
}