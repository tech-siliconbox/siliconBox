'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** The authenticator setup link as a QR code, with the key for manual entry beside it. */
export function TotpQrCode({ uri }: { uri: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const manualKey = new URL(uri).searchParams.get('secret') ?? '';

  useEffect(() => {
    let current = true;
    void QRCode.toString(uri, { type: 'svg', margin: 1, width: 176 }).then((markup) => {
      if (current) setSvg(markup);
    });
    return () => {
      current = false;
    };
  }, [uri]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div
        role="img"
        aria-label="QR code for your authenticator app"
        className="h-44 w-44 shrink-0 rounded-md border border-border"
        // Markup generated locally by the qrcode library from our own setup link.
        dangerouslySetInnerHTML={svg === null ? undefined : { __html: svg }}
      />
      <p className="text-sm text-muted-foreground">
        Can’t scan it? Enter this key in your app:
        <code
          data-testid="totp-key"
          className="mt-1 block break-all font-mono text-[12px] text-foreground"
        >
          {manualKey}
        </code>
      </p>
    </div>
  );
}
