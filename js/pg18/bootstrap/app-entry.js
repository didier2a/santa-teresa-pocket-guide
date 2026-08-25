globalThis.__POCKETGUIDE_DISABLE_SNAP_SIM__=true;
globalThis.__POCKETGUIDE_EXTERNAL_PROACTIVE__=true;

await import('../../pg16/bootstrap/app-rc-entry.js');
await import('../../pg17/bootstrap/app-enhancer.js?v=1.8.0rc5');
await import('./app-enhancer.js?v=1.8.0rc5');
