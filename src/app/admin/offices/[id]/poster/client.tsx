"use client";

/**
 * Printable A4 QR poster for one office. The QR holds <site>/o/<posterKey>:
 * a visitor scans it with the phone camera after their work at the office,
 * which records the visit and shows their Exit QR (src/app/o/**).
 *
 * Printing: the sheet is also rendered straight under <body> (a portal) and
 * the print CSS hides everything else, so no menus or bars are printed.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { AlertTriangle, Loader2, Printer, RefreshCw } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal, EmptyState } from "@/components/ui/primitives";
import { BackButton } from "@/components/ui/back-button";
import { callGate } from "@/lib/gate-call";
import type { OfficeRow } from "@/server/actions/offices";

const noopSubscribe = () => () => {};

/** Words on the poster: both languages are printed, so no t() here */
const TEXT_EN = "Visitors: scan this with your phone camera after your work here, then show your Exit QR at the gate.";
const TEXT_TE =
  "విజిటర్స్: ఇక్కడ మీ పని పూర్తయ్యాక, మీ ఫోన్ కెమెరాతో ఈ QR స్కాన్ చేయండి. తర్వాత గేట్ వద్ద మీ ఎగ్జిట్ QR చూపించండి.";

const PRINT_CSS = `
.gp-print-poster { display: none; }
@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { background: #ffffff !important; margin: 0 !important; padding: 0 !important; }
  body > *:not(.gp-print-poster) { display: none !important; }
  .gp-print-poster { display: block !important; }
  .gp-print-poster .gp-sheet { width: 209mm; margin: 0 auto; break-inside: avoid; }
}
`;

/**
 * One A4 sheet. Every size is a share of the sheet's width (cqw), so the same
 * sheet works as the small preview on screen and full size on paper.
 */
function PosterSheet({ name, qrSrc }: { name: string; qrSrc: string | null }) {
  return (
    <div
      className="gp-sheet flex flex-col items-center bg-white text-center"
      style={{
        containerType: "inline-size",
        aspectRatio: "210 / 297",
        width: "100%",
        color: "#18181b",
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      <div style={{ height: "2.2cqw", width: "100%", background: "#ff634a" }} />
      <div className="flex w-full flex-1 flex-col items-center" style={{ padding: "6cqw 8cqw 6cqw" }}>
        <p style={{ fontSize: "2.6cqw", letterSpacing: "0.35em", fontWeight: 600, color: "#d63f27", textTransform: "uppercase" }}>
          Visitors · విజిటర్స్
        </p>
        <h1
          className="break-words"
          style={{ marginTop: "2.5cqw", fontSize: name.length > 22 ? "7cqw" : "9cqw", lineHeight: 1.1, fontWeight: 700, maxWidth: "100%" }}
        >
          {name}
        </h1>
        <div
          className="flex items-center justify-center"
          style={{
            marginTop: "5cqw",
            width: "64cqw",
            height: "64cqw",
            border: "0.5cqw solid #18181b",
            borderRadius: "3cqw",
            padding: "1.5cqw",
            background: "#ffffff",
          }}
        >
          {qrSrc ? (
            <img src={qrSrc} alt={`QR code for ${name}`} style={{ width: "100%", height: "100%" }} />
          ) : (
            <Loader2 className="animate-spin text-zinc-500" style={{ width: "8cqw", height: "8cqw" }} />
          )}
        </div>
        <div className="flex flex-1 flex-col justify-center" style={{ marginTop: "4cqw", gap: "3cqw" }}>
          <p style={{ fontSize: "3.6cqw", lineHeight: 1.35, fontWeight: 500 }}>{TEXT_EN}</p>
          <p style={{ fontSize: "3.6cqw", lineHeight: 1.5, fontWeight: 500 }}>{TEXT_TE}</p>
        </div>
        <p style={{ fontSize: "2cqw", color: "#6b6b73" }}>Gate Pass · Office QR</p>
      </div>
    </div>
  );
}

export function OfficePosterClient({ office }: { office: OfficeRow | null }) {
  const [posterKey, setPosterKey] = useState(office?.posterKey ?? "");
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [making, setMaking] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);
  const [newDone, setNewDone] = useState(false);
  // The portal target only exists in the browser
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  useEffect(() => {
    if (!posterKey) return;
    let cancelled = false;
    // Built here: the page's own address is the one visitors' phones can reach
    const url = `${window.location.origin}/o/${posterKey}`;
    QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((svg) => {
        if (cancelled) return;
        setQrSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        setQrError(false);
      })
      .catch(() => {
        if (!cancelled) setQrError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [posterKey]);

  async function makeNewQr() {
    if (!office) return;
    setMaking(true);
    setNewError(null);
    try {
      const res = await callGate("newOfficePoster", [office.id], 20_000);
      if ("error" in res) return setNewError(res.error);
      setQrSrc(null);
      setPosterKey(res.posterKey);
      setConfirmNew(false);
      setNewDone(true);
    } catch (err) {
      setNewError(err instanceof Error && err.message ? err.message : "Could not make a new QR. Please try again.");
    } finally {
      setMaking(false);
    }
  }

  if (!office) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <BackButton href="/admin/offices" label="Back to Offices" className="-ml-2" />
        <Card>
          <EmptyState
            icon={<AlertTriangle className="h-8 w-8" />}
            title="Could not load this office"
            description="Check the connection and open the poster again from Offices."
          />
        </Card>
      </div>
    );
  }

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="mx-auto max-w-5xl space-y-6 lg:space-y-8">
        <div className="space-y-3">
          <BackButton href="/admin/offices" label="Back to Offices" className="-ml-2" />
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-zinc-100 truncate">{office.name} poster</h1>
              <p className="mt-1 text-sm text-zinc-500">Print on A4 and put it up where visitors finish their work.</p>
            </div>
            <Button onClick={() => window.print()} disabled={!qrSrc} className="w-full sm:w-auto">
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        </div>

        {!office.active && (
          <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-500">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>This office is turned off, so its poster does not work. Turn it on in Offices first.</span>
          </div>
        )}
        {newDone && (
          <div role="status" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500">
            New QR made. The old poster no longer works: print this one and replace it.
          </div>
        )}
        {qrError && (
          <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            Could not draw the QR code. Reload the page and try again.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start">
          <div className="overflow-hidden rounded-2xl border border-zinc-800 shadow-card">
            <PosterSheet name={office.name} qrSrc={qrSrc} />
          </div>
          <Card>
            <CardContent className="space-y-4 p-5 sm:p-6 text-sm text-zinc-400">
              <p className="font-medium text-zinc-100">How it works</p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>Print this poster and put it up at {office.name}.</li>
                <li>After their work there, the visitor scans it with the phone they used at the gate.</li>
                <li>Their phone records the visit and shows an Exit QR. Security scans that at the gate to let them out.</li>
              </ol>
              <div className="border-t border-zinc-800/70 pt-4 space-y-2">
                <p className="text-xs text-zinc-500">
                  Poster copied or misused? Make a new QR: the old printed poster stops working.
                </p>
                <Button variant="outline" size="sm" onClick={() => { setNewError(null); setConfirmNew(true); }} className="h-10 sm:h-9">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Make a new QR
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {mounted &&
        createPortal(
          <div className="gp-print-poster" aria-hidden="true">
            <PosterSheet name={office.name} qrSrc={qrSrc} />
          </div>,
          document.body
        )}

      <Modal open={confirmNew} onClose={() => setConfirmNew(false)} title="Make a new QR?">
        <div className="space-y-4">
          {newError && (
            <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{newError}</div>
          )}
          <p className="text-sm text-zinc-400">
            The poster already printed for {office.name} will stop working at once. You will need to print the new one and
            put it up in its place.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-2">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setConfirmNew(false)}>Cancel</Button>
            <Button type="button" variant="destructive" loading={making} className="w-full sm:w-auto" onClick={makeNewQr}>
              Make new QR
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
