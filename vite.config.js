import { appendFileSync } from 'node:fs';

// relative asset paths, so the build works from any folder. The dev and
// preview servers take stats for nerds' numbers, posted to /__stats every
// two seconds while the panel is open, into STATS_LOG, to be read off the
// machine running the server
const STATS_LOG = process.env.STATS_LOG || '/tmp/skyflight-stats.log';
function statsLog(req, res, next) {
  if (req.url !== '/__stats' || req.method !== 'POST') return next();
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try { appendFileSync(STATS_LOG, `${JSON.stringify({ at: new Date().toISOString(), ...JSON.parse(body || '{}') })}\n`); } catch { /* a bad post */ }
    res.statusCode = 204;
    res.end();
  });
}
const statsLogPlugin = {
  name: 'stats-log',
  configureServer: (server) => { server.middlewares.use(statsLog); },
  configurePreviewServer: (server) => { server.middlewares.use(statsLog); },
};

export default { base: './', plugins: [statsLogPlugin] };
