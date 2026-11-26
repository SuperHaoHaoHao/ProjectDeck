#!/usr/bin/env node
process.env.PROJECTDECK_NO_AUTOSTART = '1';

const mod = await import('../dist/server/main.js');
await mod.start(process.argv.slice(2));
