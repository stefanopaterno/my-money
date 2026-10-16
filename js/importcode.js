// Codice di importazione: JSON compresso (gzip) e codificato in base64url, prefisso "MM1:". Si incolla nell'app.
const PREFIX = 'MM1:';

export async function decodeImportCode(text) {
  let t = String(text).trim();
  const i = t.indexOf(PREFIX);
  if (i < 0) throw new Error('Codice non riconosciuto');
  t = t.slice(i + PREFIX.length).replace(/[^A-Za-z0-9\-_]/g, '');
  const bin = atob(t.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

export async function encodeImportCode(obj) {
  const stream = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
