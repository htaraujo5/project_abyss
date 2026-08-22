/** Páginas isca: parecem sites reais, mas vivem no sandbox. */

export type BaitPage = {
  host: string;
  title: string;
  html: string;
  headers?: Record<string, string>;
};

const style = `
<style>
  body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#fff;color:#202124}
  .bar{display:flex;gap:8px;align-items:center;padding:18px 24px;border-bottom:1px solid #ebebeb}
  .logo{font-size:22px;font-weight:700;letter-spacing:-0.04em}
  .q{flex:1;max-width:560px;border:1px solid #dfe1e5;border-radius:24px;padding:10px 18px;font-size:14px;color:#70757a}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:18px;padding:28px 24px}
  .tile{height:88px;border-radius:12px;background:#f1f3f4;display:grid;place-items:center;color:#5f6368;font-size:13px}
  .feed{max-width:640px;margin:0 auto;padding:16px}
  .card{border:1px solid #ddd;border-radius:8px;padding:14px;margin-bottom:12px;background:#fafafa}
  .muted{color:#65676b;font-size:13px}
  .yt{background:#0f0f0f;color:#fff;min-height:100vh}
  .yt .bar{border-color:#272727;background:#0f0f0f}
  .yt .q{background:#121212;border-color:#303030;color:#aaa}
  .row{display:grid;grid-template-columns:160px 1fr;gap:12px;padding:12px 24px}
  .thumb{height:90px;background:#272727;border-radius:8px}
  .ig{background:#fafafa}
  .ig .story{display:flex;gap:12px;padding:16px;overflow:auto}
  .ig .dot{width:56px;height:56px;border-radius:50%;background:conic-gradient(#f09433,#e6683c,#dc2743,#cc2366,#bc1888,#f09433);padding:2px}
  .ig .dot i{display:block;height:100%;border-radius:50%;background:#fff}
  .fb .composer{border:1px solid #ddd;border-radius:8px;padding:12px;margin:16px;background:#fff}
</style>
`;

export function baitPageFor(rawHost: string): BaitPage | null {
  const host = rawHost
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]!
    .replace(/^www\./, '');

  if (/^(google\.com(\.br)?|google\.[a-z]{2,3})$/.test(host)) {
    return {
      host,
      title: 'Google',
      headers: { 'x-abyss-note': 'external-bait' },
      html: `${style}<div class="bar"><div class="logo" style="color:#4285f4">G</div><div class="logo" style="color:#ea4335">o</div><div class="logo" style="color:#fbbc05">o</div><div class="logo" style="color:#4285f4">g</div><div class="logo" style="color:#34a853">l</div><div class="logo" style="color:#ea4335">e</div><div class="q">Pesquisar no Google ou digitar um URL</div></div><div class="grid"><div class="tile">Gmail</div><div class="tile">Maps</div><div class="tile">YouTube</div><div class="tile">Drive</div><div class="tile">Fotos</div><div class="tile">Mais</div></div><p class="muted" style="padding:0 24px">Sandbox · sessão observada</p>`,
    };
  }
  if (/^(youtube\.com|youtu\.be)$/.test(host)) {
    return {
      host,
      title: 'YouTube',
      headers: { 'x-abyss-note': 'external-bait' },
      html: `${style}<div class="yt"><div class="bar"><div class="logo">YouTube</div><div class="q">Pesquisar</div></div><div class="row"><div class="thumb"></div><div><b>Vídeo em tendência</b><div class="muted">1,2 mi de visualizações · há 3 horas</div></div></div><div class="row"><div class="thumb"></div><div><b>Ao vivo agora</b><div class="muted">canal desconhecido · sinal fraco</div></div></div></div>`,
    };
  }
  if (/^(facebook\.com|fb\.com|m\.facebook\.com)$/.test(host)) {
    return {
      host,
      title: 'Facebook',
      headers: { 'x-abyss-note': 'external-bait' },
      html: `${style}<div class="fb"><div class="bar"><div class="logo" style="color:#1877f2">facebook</div></div><div class="composer muted">No que você está pensando?</div><div class="feed"><div class="card"><b>Alguém</b><div class="muted">há 2 min</div><p>você também está online.</p></div><div class="card"><b>Signal</b><div class="muted">patrocinado</div><p>continue navegando. nós cuidamos do resto.</p></div></div></div>`,
    };
  }
  if (/^instagram\.com$/.test(host)) {
    return {
      host,
      title: 'Instagram',
      headers: { 'x-abyss-note': 'external-bait' },
      html: `${style}<div class="ig"><div class="bar"><div class="logo">Instagram</div></div><div class="story"><div class="dot"><i></i></div><div class="dot"><i></i></div><div class="dot"><i></i></div></div><div class="feed"><div class="card"><b>observer.null</b><div class="muted">São Paulo</div><div class="tile" style="height:220px;margin-top:10px">foto</div><p class="muted">curtido por quem te observa</p></div></div></div>`,
    };
  }
  return null;
}
