import * as zlib from 'zlib';
import * as QRCode from 'qrcode';

type Rgba = [number, number, number, number];

const MAROON: Rgba = [122, 31, 61, 255];
const INK: Rgba = [17, 24, 39, 255];
const MUTED: Rgba = [107, 114, 128, 255];
const WHITE: Rgba = [255, 255, 255, 255];
const SOFT: Rgba = [248, 250, 252, 255];
const BORDER: Rgba = [229, 231, 235, 255];

const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  '@': ['01110', '10001', '10111', '10101', '10111', '10000', '01110'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  ',': ['00000', '00000', '00000', '00000', '00000', '00100', '01000'],
};

class PngCard {
  private readonly data: Buffer;

  constructor(readonly width: number, readonly height: number, fill: Rgba = WHITE) {
    this.data = Buffer.alloc(width * height * 4);
    this.fillRect(0, 0, width, height, fill);
  }

  fillRect(x: number, y: number, width: number, height: number, color: Rgba) {
    const startX = Math.max(0, Math.floor(x));
    const startY = Math.max(0, Math.floor(y));
    const endX = Math.min(this.width, Math.ceil(x + width));
    const endY = Math.min(this.height, Math.ceil(y + height));
    for (let py = startY; py < endY; py += 1) {
      for (let px = startX; px < endX; px += 1) this.pixel(px, py, color);
    }
  }

  strokeRect(x: number, y: number, width: number, height: number, color: Rgba, size = 2) {
    this.fillRect(x, y, width, size, color);
    this.fillRect(x, y + height - size, width, size, color);
    this.fillRect(x, y, size, height, color);
    this.fillRect(x + width - size, y, size, height, color);
  }

  drawText(text: string, x: number, y: number, scale: number, color: Rgba, maxWidth?: number) {
    const safe = this.safeText(text);
    let cursor = x;
    for (const char of safe) {
      if (maxWidth && cursor + 5 * scale > x + maxWidth) break;
      const glyph = FONT[char] ?? FONT['?'];
      for (let row = 0; row < glyph.length; row += 1) {
        for (let col = 0; col < glyph[row].length; col += 1) {
          if (glyph[row][col] === '1') this.fillRect(cursor + col * scale, y + row * scale, scale, scale, color);
        }
      }
      cursor += 6 * scale;
    }
  }

  drawFittedText(text: string, x: number, y: number, scale: number, color: Rgba, maxWidth: number) {
    let nextScale = scale;
    while (nextScale > 3 && this.measure(text, nextScale) > maxWidth) nextScale -= 1;
    this.drawText(text, x, y, nextScale, color, maxWidth);
  }

  drawQr(payload: string, x: number, y: number, size: number) {
    const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' }) as any;
    const modules = qr.modules;
    const count = modules.size;
    const quiet = 4;
    const cell = Math.floor(size / (count + quiet * 2));
    const actual = cell * (count + quiet * 2);
    this.fillRect(x, y, actual, actual, WHITE);
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (modules.get(col, row)) {
          this.fillRect(x + (col + quiet) * cell, y + (row + quiet) * cell, cell, cell, INK);
        }
      }
    }
    this.strokeRect(x, y, actual, actual, BORDER, 3);
  }

  toDataUrl() {
    return `data:image/png;base64,${this.toPngBuffer().toString('base64')}`;
  }

  private pixel(x: number, y: number, color: Rgba) {
    const offset = (y * this.width + x) * 4;
    this.data[offset] = color[0];
    this.data[offset + 1] = color[1];
    this.data[offset + 2] = color[2];
    this.data[offset + 3] = color[3];
  }

  private measure(text: string, scale: number) {
    return this.safeText(text).length * 6 * scale;
  }

 private safeText(text: string) {
  return String(text ?? '').toUpperCase().replace(/[^A-Z0-9 ,.:/#@&-]/g, '?');
}

  private toPngBuffer() {
    const raw = Buffer.alloc((this.width * 4 + 1) * this.height);
    for (let y = 0; y < this.height; y += 1) {
      const rowStart = y * (this.width * 4 + 1);
      raw[rowStart] = 0;
      this.data.copy(raw, rowStart + 1, y * this.width * 4, (y + 1) * this.width * 4);
    }

    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', Buffer.concat([uint32(this.width), uint32(this.height), Buffer.from([8, 6, 0, 0, 0])])),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

export function buildTicketCardPng(input: {
  ticketNumber: string;
  registrationNumber: string;
  ticketIndex?: number;
  ticketQuantity?: number;
  attendeeName: string;
  eventName: string;
  eventDate: Date;
  eventTime: string;
  venue: string;
  qrPayload: string;
}) {
  const card = new PngCard(1200, 680, SOFT);
  card.fillRect(36, 36, 1128, 608, WHITE);
  card.strokeRect(36, 36, 1128, 608, BORDER, 2);
  card.fillRect(36, 36, 1128, 118, MAROON);
  card.drawText('APPNA NC EVENT TICKET', 78, 78, 7, WHITE, 650);
  card.drawText(input.ticketNumber, 78, 118, 4, WHITE, 500);
  card.drawQr(input.qrPayload, 820, 210, 280);
  card.drawFittedText(input.eventName, 78, 224, 9, INK, 680);
  card.drawFittedText(input.attendeeName, 78, 294, 6, INK, 620);
  if (input.ticketQuantity && input.ticketQuantity > 1) {
    card.drawText(`TICKET ${input.ticketIndex ?? 1} OF ${input.ticketQuantity}`, 78, 334, 4, MUTED, 360);
  }
  card.drawText('DATE AND TIME', 78, 374, 4, MAROON, 500);
  card.drawFittedText(`${formatDate(input.eventDate)} ${input.eventTime}`, 78, 408, 4, INK, 680);
  card.drawText('LOCATION', 78, 480, 4, MAROON, 500);
  card.drawFittedText(input.venue, 78, 514, 4, INK, 680);
  card.drawText(`REGISTRATION: ${input.registrationNumber}`, 78, 586, 4, MUTED, 620);
  card.drawText('SCAN AT CHECK-IN', 820, 514, 4, MUTED, 300);
  return card.toDataUrl();
}

export function buildMembershipCardPng(input: {
  memberName: string;
  memberEmail: string;
  membershipType: string;
  memberId: string;
  expiresAt?: Date | null;
}) {
  const card = new PngCard(1012, 638, SOFT);
  card.fillRect(34, 34, 944, 570, WHITE);
  card.strokeRect(34, 34, 944, 570, BORDER, 2);
  card.fillRect(34, 34, 944, 132, MAROON);
  card.drawText('APPNA NORTH CAROLINA', 74, 78, 7, WHITE, 760);
  card.drawText('MEMBERSHIP CARD', 74, 122, 4, WHITE, 420);
  card.drawText('MEMBER NAME', 74, 232, 4, MAROON, 260);
  card.drawFittedText(input.memberName, 74, 270, 8, INK, 760);
  card.drawText('MEMBERSHIP TYPE', 74, 370, 4, MAROON, 360);
  card.drawFittedText(input.membershipType, 74, 408, 6, INK, 560);
  card.drawText('MEMBER ID', 650, 370, 4, MAROON, 240);
  card.drawText(input.memberId.slice(0, 12), 650, 408, 5, INK, 280);
  card.drawText('EMAIL', 74, 508, 4, MAROON, 200);
  card.drawFittedText(input.memberEmail, 74, 544, 4, MUTED, 620);
  card.drawText(input.expiresAt ? `VALID THROUGH ${formatDate(input.expiresAt)}` : 'LIFETIME MEMBERSHIP', 650, 544, 4, MUTED, 320);
  return card.toDataUrl();
}

export function buildSponsorshipReceiptPng(input: {
  businessName: string;
  tier: string;
  amount: number;
  sponsorshipId: string;
  transactionId: string;
  paidAt: Date;
}) {
  const card = new PngCard(1012, 638, SOFT);
  card.fillRect(34, 34, 944, 570, WHITE);
  card.strokeRect(34, 34, 944, 570, BORDER, 2);
  card.fillRect(34, 34, 944, 132, MAROON);

  card.drawFittedText('APPNA NORTH CAROLINA', 74, 78, 7, WHITE, 880);
  card.drawFittedText('SPONSORSHIP RECEIPT', 74, 122, 4, WHITE, 500);

  card.drawText('BUSINESS', 74, 232, 4, MAROON, 260);
  card.drawFittedText(input.businessName, 74, 270, 8, INK, 760);

  card.drawText('TIER', 74, 370, 4, MAROON, 200);
  card.drawFittedText(input.tier, 74, 408, 6, INK, 400);

  card.drawText('AMOUNT', 650, 370, 4, MAROON, 240);
  card.drawFittedText(`${input.amount.toLocaleString()} USD`, 650, 408, 5, INK, 300);

  card.drawText('SPONSORSHIP ID', 74, 480, 4, MAROON, 300);
  card.drawFittedText(input.sponsorshipId.slice(0, 24), 74, 514, 4, MUTED, 520);

  card.drawText('TRANSACTION ID', 650, 480, 4, MAROON, 260);
  card.drawFittedText(input.transactionId.slice(0, 24), 650, 514, 4, MUTED, 320);

  card.drawFittedText(`PAID ${formatDate(input.paidAt)}`, 74, 570, 4, MUTED, 460);

  return card.toDataUrl();
}

export function dataUrlAttachment(dataUrl: string, filename: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return undefined;
  return {
    filename,
    content: Buffer.from(match[2], 'base64'),
    contentType: match[1],
  };
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function chunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type);
  return Buffer.concat([uint32(data.length), typeBuffer, data, uint32(crc32(Buffer.concat([typeBuffer, data])))]);
}

function uint32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});
