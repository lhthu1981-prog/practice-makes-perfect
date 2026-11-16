// Tạo bản giao diện cho GitHub Pages từ Index.html + Code.gs
// Cách dùng: node build_pages.js <thư mục nguồn> <thư mục docs> <API_URL>
const fs = require('fs'), path = require('path'), vm = require('vm');
const [src, out, apiUrl] = process.argv.slice(2);
if (!src || !out || !/^https:\/\/script\.google\.com\/.+\/exec$/.test(apiUrl || '')) {
  console.error('Usage: node build_pages.js <src> <docs> <https://script.google.com/.../exec>'); process.exit(1);
}

// Lấy cấu hình (APP_NAME, LEVELS…) từ Code.gs
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(src, 'Code.gs'), 'utf8') + '\n;this.__cfg = publicConfig_();', ctx);
const cfg = ctx.__cfg;

let html = fs.readFileSync(path.join(src, 'Index.html'), 'utf8');
const swap = (a, b) => { if (!html.includes(a)) throw new Error('Không tìm thấy: ' + a); html = html.replace(a, b); };
swap(`<body<? if (bannerUrl) { ?> style="--banner-img:url('<?!= bannerUrl ?>')"<? } ?>>`, `<body style="--banner-img:url('banner.jpg')">`);
swap('<?!= JSON.stringify(appName) ?>', JSON.stringify(cfg.appName));
swap('<?!= JSON.stringify(schoolName) ?>', JSON.stringify(cfg.schoolName));
swap('<?!= levelsJson ?>', JSON.stringify(cfg.levels));
swap('<?!= skillsJson ?>', JSON.stringify(cfg.skills));
swap('<?!= examJson ?>', JSON.stringify(cfg.exam));
swap('<base target="_top">', `<base target="_top">\n  <title>${cfg.appName}</title>\n  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📝</text></svg>">`);

// Thay google.script.run (chỉ có trong Apps Script) bằng lệnh gọi API qua fetch
const shim = `<script>
/* Bản GitHub Pages: giao diện ở đây, dữ liệu ở Google Apps Script */
const API_URL = ${JSON.stringify(apiUrl)};
window.google = { script: { run: (function mk(ok, fail) {
  return new Proxy({}, { get(_, fn) {
    if (fn === 'withSuccessHandler') return h => mk(h, fail);
    if (fn === 'withFailureHandler') return h => mk(ok, h);
    return (...args) => fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn, args }) })
      .then(r => { if (!r.ok) throw new Error('Máy chủ trả lỗi ' + r.status); return r.text(); })
      .then(t => { try { return JSON.parse(t); } catch (e) { window.__serverOld = true; throw new Error('máy chủ chưa có cổng API'); } })
      .then(x => ok && ok(x))
      .catch(e => fail && fail(new Error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại. (' + e.message + ')')));
  } });
})() } };
</script>
`;
const i = html.indexOf('<script>');
html = html.slice(0, i) + shim + html.slice(i);
if (/<\?/.test(html)) throw new Error('Còn sót đoạn mã Apps Script trong trang');

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
// Hình nền: lấy từ Banner.html (data URI) ra file ảnh
const b = fs.readFileSync(path.join(src, 'Banner.html'), 'utf8').trim();
const m = b.match(/^data:image\/(\w+);base64,(.+)$/s);
if (m) fs.writeFileSync(path.join(out, 'banner.jpg'), Buffer.from(m[2], 'base64'));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
// Kho ảnh: liệt kê mọi ảnh trong docs/img theo thư mục → docs/img/kho.json (trang web dùng để tự tìm ảnh theo tên từ)
const imgDir = path.join(out, 'img'), kho = {};
(function walk(dir, rel) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).forEach(e => {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), r);
    else if (/\.(jpe?g|png|webp|gif)$/i.test(e.name) && rel) (kho[rel] = kho[rel] || []).push(e.name);
  });
})(imgDir, '');
if (fs.existsSync(imgDir)) fs.writeFileSync(path.join(imgDir, 'kho.json'), JSON.stringify(kho, null, 1));
console.log('Kho ảnh:', Object.keys(kho).map(k => k + ' (' + kho[k].length + ')').join(', ') || 'trống');
console.log('OK', path.join(out, 'index.html'), (html.length / 1024).toFixed(0) + ' KB');
