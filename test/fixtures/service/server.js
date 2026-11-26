const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const marker = path.join(__dirname, 'server.pid');

const server = http.createServer((req, res) => {
  if (req.url === '/emit') {
    // 用来测试 SSE：命中后打一行日志，页面/测试应该实时收到
    console.log('fixture emit marker');
    res.end('emitted');
    return;
  }
  res.end('ok');
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  fs.writeFileSync(marker, String(process.pid));
  console.log(`fixture-service ready on http://127.0.0.1:${port}`);
});

const bye = () => {
  try {
    fs.unlinkSync(marker);
  } catch {}
  server.close(() => process.exit(0));
};

process.on('SIGTERM', bye);
process.on('SIGINT', bye);
