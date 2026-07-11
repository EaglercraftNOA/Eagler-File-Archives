const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const uploadList = document.getElementById('uploadList');
const fileListEl = document.getElementById('fileList');

fileInput.addEventListener('change', (e) => {
  handleFiles(e.target.files);
});

['dragover', 'dragenter'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  handleFiles(e.dataTransfer.files);
});

function handleFiles(fileListArg) {
  Array.from(fileListArg).forEach(uploadFile);
}

function uploadFile(file) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  const item = document.createElement('div');
  item.className = 'upload-item';
  item.innerHTML = `
    <div class="name"><span>${file.name}</span><span class="pct">0%</span></div>
    <div class="progress-bar-bg"><div class="progress-bar-fill"></div></div>
    <div class="status">Initializing…</div>
  `;
  uploadList.appendChild(item);

  const fill = item.querySelector('.progress-bar-fill');
  const pctEl = item.querySelector('.pct');
  const statusEl = item.querySelector('.status');

  fetch('/api/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      totalChunks,
      totalSize: file.size,
    }),
  })
    .then((r) => r.json())
    .then(({ uploadId }) => {
      statusEl.textContent = `Uploading 0 / ${totalChunks} chunks`;

      const worker = new Worker('upload-worker.js');
      let completed = 0;

      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'chunk-done') {
          completed++;
          const pct = Math.round((completed / totalChunks) * 100);
          fill.style.width = pct + '%';
          pctEl.textContent = pct + '%';
          statusEl.textContent = `Uploading ${completed} / ${totalChunks} chunks`;
        } else if (msg.type === 'all-done') {
          finalizeUpload(uploadId, item, fill, pctEl, statusEl);
          worker.terminate();
        } else if (msg.type === 'error') {
          statusEl.textContent = 'Error: ' + msg.error;
          worker.terminate();
        }
      };

      worker.postMessage({
        file,
        uploadId,
        chunkSize: CHUNK_SIZE,
        totalChunks,
        concurrency: 4,
      });
    })
    .catch((err) => {
      statusEl.textContent = 'Init failed: ' + err.message;
    });
}

function finalizeUpload(uploadId, item, fill, pctEl, statusEl) {
  statusEl.textContent = 'Finalizing…';
  fetch('/api/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId }),
  })
    .then((r) => r.json())
    .then((res) => {
      if (res.ok) {
        item.classList.add('done');
        statusEl.textContent = 'Done: ' + res.file;
        refreshFileList();
      } else {
        statusEl.textContent = 'Error: ' + (res.error || 'unknown');
      }
    })
    .catch((err) => {
      statusEl.textContent = 'Finalize failed: ' + err.message;
    });
}

function refreshFileList() {
  fetch('/api/files')
    .then((r) => r.json())
    .then(({ files }) => {
      fileListEl.innerHTML = '';
      files.forEach((f) => {
        const li = document.createElement('li');
        li.textContent = f;
        fileListEl.appendChild(li);
      });
    });
}

refreshFileList();
