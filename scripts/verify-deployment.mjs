const origin = new URL(process.argv[2] || process.env.BARDO_ORIGIN || "http://127.0.0.1:8080");

const checks = [
  ["/bardo.html", "text/html", "Bardo"],
  ["/api/capabilities", "application/json", '"browsing":true'],
  ["/sw.js", "javascript", "$scramjetLoadWorker"],
  ["/sw-sherpa.js", "javascript", "$sherpaLoadWorker"],
  ["/sw-klystron.js", "javascript", "addEventListener"],
  ["/sherpa/sherpa.all.js", "javascript", "$sherpaLoadController"],
  ["/sherpa/sherpa.client.js", "javascript", ""],
  ["/sherpa/sherpa.sync.js", "javascript", ""],
  ["/sherpa/sherpa.wasm.wasm", "application/wasm", ""],
  ["/scramjet/scramjet.all.js", "javascript", "$scramjetLoadController"],
  ["/scramjet/scramjet.sync.js", "javascript", ""],
  ["/scramjet/scramjet.wasm.wasm", "application/wasm", ""],
  ["/scramjet/scramjet.runtime.js", "javascript", ""],
  ["/scramjet/scramjet.runtime.sync.js", "javascript", ""],
  ["/scramjet/scramjet.runtime.wasm", "application/wasm", ""],
  ["/scramjet/scramjet.sw.js", "javascript", "$sherpaLoadWorker"],
  ["/baremux/index.js", "javascript", "BareMux"],
  ["/baremux/worker.js", "javascript", ""],
  ["/epoxy/index.mjs", "javascript", ""],
  ["/libcurl/index.mjs", "javascript", "createBardoLibcurlClient"],
  ["/libcurl/upstream.mjs", "javascript", ""],
  ["/libcurl/libcurl-pool.mjs", "javascript", "createBardoLibcurlClient"],
  ["/ab-launcher.js", "javascript", "__bardoLaunchAboutBlank"],
  ["/shortcuts.json", "application/json", ""],
  ["/manifest.json", "application/manifest+json", ""],
  ["/bardo-favicon-inverted.svg", "image/svg+xml", ""],
  ["/apple-touch-icon.png", "image/png", ""],
  ["/icon-192.png", "image/png", ""],
  ["/icon-512.png", "image/png", ""],
  ["/icon-512-maskable.png", "image/png", ""],
];

let failures = 0;
for (const [path, expectedType, needle] of checks) {
  const url = new URL(path, origin);
  try {
    const response = await fetch(url, { headers: { accept: "*/*" } });
    const type = response.headers.get("content-type") || "";
    const body = new Uint8Array(await response.arrayBuffer());
    const text = needle ? new TextDecoder().decode(body) : "";
    const swHeaderOk = !path.startsWith("/sw") || response.headers.get("service-worker-allowed") === "/";
    const ok = response.ok && type.includes(expectedType) && (!needle || text.includes(needle)) && swHeaderOk;
    console.log(`${ok ? "PASS" : "FAIL"} ${path} ${response.status} ${type} ${body.byteLength}b`);
    if (!ok) failures++;
  } catch (error) {
    failures++;
    console.error(`FAIL ${path}: ${error instanceof Error ? error.message : error}`);
  }
}

if (failures) {
  console.error(`\n${failures} deployment check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${checks.length} deployment checks passed for ${origin.origin}.`);
}
