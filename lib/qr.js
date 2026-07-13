'use client';

import jsQR from 'jsqr';

// Decode a QR code from raw canvas ImageData. Returns decoded text or null.
// Live camera loops should pass 'dontInvert' — it halves jsQR work per frame;
// inverted QRs are still caught by the attemptBoth pass on captured images.
export function decodeQrFromImageData(imageData, inversionAttempts = 'attemptBoth') {
  if (!imageData) return null;
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts,
  });
  return result?.data || null;
}

// Decode a QR code from a base64 data-URL image. Tries the original size and a
// downscaled pass (large photos sometimes fail while smaller ones succeed).
export function decodeQrFromDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const attempts = [1, 800 / Math.max(img.width, img.height)].filter(s => s > 0 && s <= 1);
      for (const scale of attempts) {
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          const text = decodeQrFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
          if (text) return resolve(text);
        } catch {
          // canvas read failure — fall through to next attempt
        }
      }
      resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

const EMPTY_FIELDS = () => ({
  name: '', title: '', company: '', phone: '', mobile: '', email: '', website: '', address: '', notes: '',
});

// Decode quoted-printable sequences (=E2=80=93 etc.) used in vCard 2.1.
function decodeQuotedPrintable(str) {
  try {
    const bytes = str
      .replace(/=\r?\n/g, '')
      .replace(/=([A-Fa-f0-9]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    // Re-interpret as UTF-8
    return decodeURIComponent(
      bytes.split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    );
  } catch {
    return str;
  }
}

function unescapeVCard(value) {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseVCard(text) {
  const fields = EMPTY_FIELDS();
  // Unfold folded lines (continuation lines start with space/tab)
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  let nFallback = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const left = line.slice(0, colonIdx);
    let value = line.slice(colonIdx + 1);
    const parts = left.split(';');
    const prop = parts[0].split('.').pop().toUpperCase(); // drop item1. group prefixes
    const params = parts.slice(1).join(';').toUpperCase();

    if (params.includes('QUOTED-PRINTABLE')) value = decodeQuotedPrintable(value);
    value = unescapeVCard(value);
    if (!value) continue;

    switch (prop) {
      case 'FN':
        fields.name = value;
        break;
      case 'N': {
        const [last = '', first = '', middle = ''] = value.split(';');
        nFallback = [first, middle, last].filter(Boolean).join(' ').trim();
        break;
      }
      case 'TITLE':
        fields.title = value;
        break;
      case 'ROLE':
        if (!fields.title) fields.title = value;
        break;
      case 'ORG':
        fields.company = value.split(';').filter(Boolean).join(' - ');
        break;
      case 'TEL': {
        const num = value.replace(/^tel:/i, '').trim();
        if (params.includes('CELL') || params.includes('MOBILE')) {
          if (!fields.mobile) fields.mobile = num;
          else if (!fields.phone) fields.phone = num;
        } else if (!fields.phone) {
          fields.phone = num;
        } else if (!fields.mobile) {
          fields.mobile = num;
        }
        break;
      }
      case 'EMAIL':
        if (!fields.email) fields.email = value.replace(/^mailto:/i, '').trim();
        break;
      case 'URL':
        if (!fields.website) fields.website = value;
        break;
      case 'ADR':
        if (!fields.address) {
          fields.address = value.split(';').map(s => s.trim()).filter(Boolean).join(', ');
        }
        break;
      case 'NOTE':
        fields.notes = fields.notes ? `${fields.notes}\n${value}` : value;
        break;
      default:
        break;
    }
  }

  if (!fields.name && nFallback) fields.name = nFallback;
  return fields;
}

function parseMeCard(text) {
  const fields = EMPTY_FIELDS();
  const body = text.replace(/^MECARD:/i, '');
  // Split on unescaped semicolons
  const entries = body.split(/(?<!\\);/).filter(Boolean);
  const unescape = (v) => v.replace(/\\([;,:\\])/g, '$1').trim();

  for (const entry of entries) {
    const sep = entry.indexOf(':');
    if (sep === -1) continue;
    const key = entry.slice(0, sep).toUpperCase();
    const value = unescape(entry.slice(sep + 1));
    if (!value) continue;
    switch (key) {
      case 'N': {
        const [last = '', first = ''] = value.split(',');
        fields.name = [first, last].map(s => s.trim()).filter(Boolean).join(' ');
        break;
      }
      case 'TEL':
        if (!fields.mobile) fields.mobile = value;
        else if (!fields.phone) fields.phone = value;
        break;
      case 'EMAIL':
        if (!fields.email) fields.email = value;
        break;
      case 'URL':
        if (!fields.website) fields.website = value;
        break;
      case 'ADR':
        if (!fields.address) fields.address = value;
        break;
      case 'ORG':
        fields.company = value;
        break;
      case 'NOTE':
        fields.notes = value;
        break;
      default:
        break;
    }
  }
  return fields;
}

// Parse decoded QR text into contact fields.
// Returns { fields, kind, raw } or null when the text is empty.
export function parseQrText(text) {
  if (!text || !text.trim()) return null;
  const trimmed = text.trim();

  if (/BEGIN:VCARD/i.test(trimmed)) {
    return { fields: parseVCard(trimmed), kind: 'vcard', raw: trimmed };
  }
  if (/^MECARD:/i.test(trimmed)) {
    return { fields: parseMeCard(trimmed), kind: 'mecard', raw: trimmed };
  }
  if (/^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed)) {
    const fields = EMPTY_FIELDS();
    fields.website = trimmed;
    fields.notes = 'Imported from QR code (URL)';
    return { fields, kind: 'url', raw: trimmed };
  }
  if (/^mailto:/i.test(trimmed)) {
    const fields = EMPTY_FIELDS();
    fields.email = trimmed.replace(/^mailto:/i, '').split('?')[0];
    return { fields, kind: 'email', raw: trimmed };
  }
  if (/^tel:/i.test(trimmed)) {
    const fields = EMPTY_FIELDS();
    fields.mobile = trimmed.replace(/^tel:/i, '');
    return { fields, kind: 'phone', raw: trimmed };
  }

  // Unknown payload — keep the raw text so no data is lost
  const fields = EMPTY_FIELDS();
  fields.notes = trimmed;
  return { fields, kind: 'text', raw: trimmed };
}

// Does the parsed QR contain enough info to be a usable contact?
export function isMeaningfulQrContact(parsed) {
  if (!parsed) return false;
  const f = parsed.fields;
  return !!(f.name || f.email || f.phone || f.mobile || f.company || f.website);
}

// Compress an image data-URL: fit within maxDim, re-encode as JPEG.
// Cuts upload size and AI vision token cost without hurting OCR accuracy.
export function compressImageDataUrl(dataUrl, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      if (scale === 1 && dataUrl.startsWith('data:image/jpeg')) return resolve(dataUrl);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
