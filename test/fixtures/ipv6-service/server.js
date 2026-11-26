const http = require('node:http');

const server = http.createServer((req, res) => res.end('ipv6-ok'));

server.listen(0, '::1', () => {
  const { port } = server.address();
  console.log(`fixture-ipv6 ready on http://[::1]:${port}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
