const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const TMP_DIR = path.join(__dirname, '.tmp-chunks');

for (const dir of [UPLOAD_DIR, TMP_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

// Track in-progress uploads: uploadId -> { fileName, totalChunks, received:Set }
const uploads = new Map();

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function serveStatic(req, res) {
  let reqPath = req.url === '/' ? '/index.html' : req.url;
  reqPath = reqPath.split('?')[0];
  const filePath = path.join(PUBLIC_DIR, reqPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function handleInit(req, res, body) {
  const { fileName, totalChunks, totalSize } = JSON.parse(body);
  const uploadId = crypto.randomBytes(8).toString('hex');
  const cleanName = safeName(fileName);

  uploads.set(uploadId, {
    fileName: cleanName,
    totalChunks,
    totalSize,
    received: new Set(),
    tmpDir: path.join(TMP_DIR, uploadId),
  });

  fs.mkdirSync(path.join(TMP_DIR, uploadId), { recursive: true });
  sendJSON(res, 200, { uploadId });
}

function handleChunk(req, res, uploadId, chunkIndex) {
  const upload = uploads.get(uploadId);
  if (!upload) {
    sendJSON(res, 400, { error: 'Unknown uploadId' });
    return;
  }

  const chunkPath = path.join(upload.tmpDir, String(chunkIndex));
  const writeStream = fs.createWriteStream(chunkPath);
  req.pipe(writeStream);

  writeStream.on('finish', () => {
    upload.received.add(chunkIndex);
    sendJSON(res, 200, {
      ok: true,
      received: upload.received.size,
      total: upload.totalChunks,
    });
  });

  writeStream.on('error', (err) => {
    sendJSON(res, 500, { error: err.message });
  });
}

function handleComplete(req, res, body) {
  const { uploadId } = JSON.parse(body);
  const upload = uploads.get(uploadId);

  if (!upload) {
    sendJSON(res, 400, { error: 'Unknown uploadId' });
    return;
  }

  if (upload.received.size !== upload.totalChunks) {
    sendJSON(res, 400, {
      error: 'Missing chunks',
      received: upload.received.size,
      total: upload.totalChunks,
    });
    return;
  }

  const finalPath = path.join(UPLOAD_DIR, upload.fileName);
  const writeStream = fs.createWriteStream(finalPath);

  let i = 0;
  function writeNext() {
    if (i >= upload.totalChunks) {
      writeStream.end(() => {
        // cleanup tmp chunk dir
        fs.rm(upload.tmpDir, { recursive: true, force: true }, () => {});
        uploads.delete(uploadId);
        sendJSON(res, 200, { ok: true, file: upload.fileName });
      });
      return;
    }
    const chunkPath = path.join(upload.tmpDir, String(i));
    const readStream = fs.createReadStream(chunkPath);
    readStream.pipe(writeStream, { end: false });
    readStream.on('end', () => {
      i++;
      writeNext();
    });
    readStream.on('error', (err) => {
      sendJSON(res, 500, { error: err.message });
    });
  }
  writeNext();
}

function collectBody(req, cb) {
  let chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => cb(Buffer.concat(chunks).toString('utf8')));
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (req.method === 'POST' && url === '/api/upload/init') {
    collectBody(req, (body) => handleInit(req, res, body));
    return;
  }

  if (req.method === 'POST' && url.startsWith('/api/upload/chunk/')) {
    // /api/upload/chunk/<uploadId>/<chunkIndex>
    const parts = url.split('/');
    const uploadId = parts[4];
    const chunkIndex = parseInt(parts[5], 10);
    handleChunk(req, res, uploadId, chunkIndex);
    return;
  }

  if (req.method === 'POST' && url === '/api/upload/complete') {
    collectBody(req, (body) => handleComplete(req, res, body));
    return;
  }

  if (req.method === 'GET' && url === '/api/files') {
    fs.readdir(UPLOAD_DIR, (err, files) => {
      if (err) return sendJSON(res, 500, { error: err.message });
      sendJSON(res, 200, { files });
    });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Upload server running at http://localhost:${PORT}`);
});
