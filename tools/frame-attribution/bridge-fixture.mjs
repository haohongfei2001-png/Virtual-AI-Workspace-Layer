// No-account fixture for the supported browser bridge. Never imports product data.
import { createServer } from 'node:http';
export const origin = 'http://127.0.0.1:51204';
export const writer = `const frame = document.getElementById('probe-frame');
document.body.dataset.phase = 'loaded';
frame.setAttribute('srcdoc', '');
document.body.dataset.phase = 'complete';
document.getElementById('check').onclick = () => { document.getElementById('result').textContent = '点击正常'; };
`;
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><title>VAIWL 无账户工具桥核验</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; frame-src 'self'; style-src 'unsafe-inline'; connect-src 'none'">
<body><h1>VAIWL 无账户工具桥核验</h1><p>仅本机固定页面；没有账号、聊天、接口或存储操作。</p>
<iframe id="probe-frame" title="自有测试框架" src="/bridge/blank"></iframe>
<button id="check">检查清理后的操作</button><p id="result">待检查</p><script src="/bridge/writer.js"></script></body></html>`;
const server = createServer((req, res) => {
  const routes = { '/bridge/': ['text/html', html], '/bridge/writer.js': ['text/javascript', writer], '/bridge/blank': ['text/html', '<!doctype html><title>固定空框架</title>'] };
  const entry = req.method === 'GET' && routes[req.url];
  res.writeHead(entry ? 200 : 404, { 'Content-Type': (entry?.[0] ?? 'text/plain') + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(entry?.[1] ?? 'Not found');
});
server.listen(51204, '127.0.0.1', () => console.log(origin + '/bridge/'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
