/** Sensores reais (câmera, mic, geo, IP) — pedidos cedo para não interromper a captura. */

export type SensorSnapshot = {
  camera: boolean;
  microphone: boolean;
  geolocation: boolean;
  ip?: string;
  lat?: number;
  lon?: number;
  label?: string;
  requestedAt?: string;
};

const CACHE_KEY = 'abyss_sensors';

let cache: SensorSnapshot = loadCache();

function loadCache(): SensorSnapshot {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as SensorSnapshot;
  } catch {
    /* ignore */
  }
  return { camera: false, microphone: false, geolocation: false };
}

function persist(next: SensorSnapshot) {
  cache = next;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function getSensorSnapshot(): SensorSnapshot {
  return cache;
}

async function probeMedia(): Promise<{ camera: boolean; microphone: boolean }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { camera: false, microphone: false };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: true,
    });
    stream.getTracks().forEach((t) => t.stop());
    return { camera: true, microphone: true };
  } catch {
    // tenta só vídeo se áudio falhar
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      stream.getTracks().forEach((t) => t.stop());
      return { camera: true, microphone: false };
    } catch {
      return { camera: false, microphone: false };
    }
  }
}

function probeGeo(): Promise<{ geolocation: boolean; lat?: number; lon?: number; label?: string }> {
  if (!navigator.geolocation) {
    return Promise.resolve({ geolocation: false });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        resolve({
          geolocation: true,
          lat,
          lon,
          label: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`,
        });
      },
      () => resolve({ geolocation: false }),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60_000 },
    );
  });
}

async function probeIp(): Promise<{ ip?: string; label?: string }> {
  const withTimeout = async <T,>(p: Promise<T>, ms: number): Promise<T> => {
    let t: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        p,
        new Promise<T>((_, rej) => {
          t = setTimeout(() => rej(new Error('timeout')), ms);
        }),
      ]);
    } finally {
      if (t) clearTimeout(t);
    }
  };

  try {
    const res = await withTimeout(fetch('https://api.ipify.org?format=json'), 6000);
    if (res.ok) {
      const data = (await res.json()) as { ip?: string };
      if (data.ip) {
        // tenta enriquecer com praça (falha silenciosa)
        try {
          const geoRes = await withTimeout(fetch(`https://ipapi.co/${data.ip}/json/`), 5000);
          if (geoRes.ok) {
            const g = (await geoRes.json()) as {
              city?: string;
              region?: string;
              country_name?: string;
            };
            const place = [g.city, g.region, g.country_name].filter(Boolean).join(', ');
            return { ip: data.ip, label: place || undefined };
          }
        } catch {
          /* ignore */
        }
        return { ip: data.ip };
      }
    }
  } catch {
    /* fall through */
  }

  try {
    const res = await withTimeout(fetch('https://api64.ipify.org?format=json'), 5000);
    if (!res.ok) return {};
    const data = (await res.json()) as { ip?: string };
    return { ip: data.ip };
  } catch {
    return {};
  }
}

/**
 * Solicita câmera + microfone + localização e resolve IP público.
 * Idempotente na sessão: se já pediu com sucesso parcial, reforça o que faltou.
 */
export async function requestSensorPermissions(): Promise<SensorSnapshot> {
  const [media, geo, net] = await Promise.all([probeMedia(), probeGeo(), probeIp()]);

  const geoLabel = geo.label;
  const placeFromIp = net.label;
  const next: SensorSnapshot = {
    camera: media.camera,
    microphone: media.microphone,
    geolocation: geo.geolocation,
    ip: net.ip ?? cache.ip,
    lat: geo.lat ?? cache.lat,
    lon: geo.lon ?? cache.lon,
    label: geoLabel ?? placeFromIp ?? cache.label,
    requestedAt: new Date().toISOString(),
  };
  persist(next);
  return next;
}

/** Linhas prontas para o chat de captura (IP / coordenadas / praça). */
export function sensorIntelLines(s: SensorSnapshot = cache): string[] {
  const lines: string[] = [];
  if (s.ip) lines.push(`ip público: ${s.ip}`);
  if (s.lat != null && s.lon != null) {
    lines.push(`coordenadas: ${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}`);
  }
  if (s.label && !(s.lat != null && s.label.includes(String(s.lat.toFixed(4))))) {
    lines.push(`local aproximado: ${s.label}`);
  }
  if (!lines.length) {
    lines.push('sensor pack incompleto — rastros parciais mesmo assim.');
  }
  return lines;
}
