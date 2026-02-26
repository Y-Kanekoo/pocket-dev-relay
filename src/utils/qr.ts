export async function generateQR(text: string): Promise<string> {
  try {
    const qrcode = await import('qrcode');
    const qr = await qrcode.default.toString(text, { type: 'terminal', small: true });
    return qr;
  } catch {
    return `[QR code unavailable - install qrcode: npm i qrcode]\n${text}`;
  }
}
