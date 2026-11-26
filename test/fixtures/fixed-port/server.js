const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const index = process.argv.indexOf('--port');
const port = index >= 0 ? Number(process.argv[index + 1]) : 4823;
const marker = path.join(__dirname, 'server.pid');

const server = http.createServer((req, res) => res.end('ok'));

server.listen(port, '127.0.0.1', () => {
  fs.writeFileSync(marker, String(process.pid));
  console.log(`fixture-fixed ready on http://127.0.0.1:${port}`);
});

const bye = () => {
  try {
    fs.unlinkSync(marker);
  } catch {}
  server.close(() => process.exit(0));
};

process.on('SIGTERM', bye);
process.on('SIGINT', bye);
