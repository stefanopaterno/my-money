// Codice di importazione: JSON compresso (gzip) in base64url, "MM1:" + dati + "." (il punto segna la fine). Si incolla nell'app.
const PREFIX = 'MM1:';

export async function decodeImportCode(text) {
  const i = String(text).indexOf(PREFIX);
  if (i < 0) throw new Error('manca l\'inizio "MM1:" (copia il codice per intero)');
  // legge solo i caratteri del codice (spazi e a capo, anche in mezzo, vengono ignorati) e si ferma al punto finale
  const m = /^[\sA-Za-z0-9_\-]+/.exec(String(text).slice(i + PREFIX.length));
  const data = (m ? m[0] : '').replace(/\s+/g, '');
  const ended = String(text).slice(i + PREFIX.length + (m ? m[0].length : 0)).startsWith('.');
  if (data.length < 20) throw new Error(`codice troppo corto (${data.length} caratteri)`);
  let bytes;
  try {
    const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch { throw new Error(`codice incompleto o con caratteri non validi: ricevuti ${data.length} caratteri (il codice intero finisce con un punto)`); }
  if (typeof DecompressionStream === 'undefined') throw new Error('questo iPhone è troppo vecchio (serve iOS 16.4 o successivo)');
  let json;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    json = await new Response(stream).text();
  } catch { throw new Error(`dati incompleti o modificati: ricevuti ${data.length} caratteri${ended ? '' : ', manca il punto finale'}`); }
  try { return JSON.parse(json); } catch { throw new Error('contenuto non leggibile'); }
}

export async function encodeImportCode(obj) {
  const stream = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.';
}
