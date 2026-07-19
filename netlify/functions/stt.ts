/**
 * Swappable server-side STT (ADR-0013). Vendor = STT_VENDOR env var; the key stays
 * server-side. Primary target: Deepgram Nova-3 Medical with keyterm biasing on the
 * highest-stakes tokens (EtCO2 and friends), which STT mangles and which fail silently
 * in the safe-looking direction if dropped. No SDK — direct REST.
 *
 * Contract out: { utterances: [{ atSec, text }] } — the one shape the client maps.
 */

/** keyterm biasing: the tokens the pipeline cannot afford to lose (obligations.json affirm lists). */
const KEYTERMS = [
  'EtCO2', 'end-tidal CO2', 'capnography', 'waveform', 'bilateral breath sounds',
  'trauma activation', 'intubation', 'FAST exam', "Morrison's pouch", 'chest tube',
  'intercostal', 'type and cross', 'massive transfusion', 'critical care time',
  'extremity splint', 'femur', 'shock index', 'GCS', 'permissive hypotension',
];

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

interface DgUtterance { start: number; transcript: string }
interface DgResponse {
  results?: {
    utterances?: DgUtterance[];
    channels?: { alternatives?: { transcript?: string }[] }[];
  };
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const vendor = (process.env.STT_VENDOR || 'mock').toLowerCase();

  if (vendor === 'mock') {
    return json({ error: 'STT_VENDOR=mock — use canned mode in the UI (no live STT configured)' }, 400);
  }

  if (vendor === 'deepgram') {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) return json({ error: 'DEEPGRAM_API_KEY not set on the server' }, 500);

    const audio = await req.arrayBuffer();
    if (!audio.byteLength) return json({ error: 'empty audio body' }, 400);

    const params = new URLSearchParams({ model: 'nova-3-medical', smart_format: 'true', punctuate: 'true', utterances: 'true' });
    for (const k of KEYTERMS) params.append('keyterm', k);

    const r = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'content-type': req.headers.get('content-type') || 'audio/webm' },
      body: audio,
    });
    if (!r.ok) return json({ error: `deepgram ${r.status}`, detail: await r.text().catch(() => '') }, 502);

    const data = (await r.json()) as DgResponse;
    let utterances = (data.results?.utterances ?? []).map((u) => ({ atSec: Math.floor(u.start), text: u.transcript }));
    if (!utterances.length) {
      const whole = data.results?.channels?.[0]?.alternatives?.[0]?.transcript;
      if (whole) utterances = [{ atSec: 0, text: whole }];
    }
    return json({ utterances });
  }

  return json({ error: `unknown STT_VENDOR "${vendor}"` }, 500);
};
