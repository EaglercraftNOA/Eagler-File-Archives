self.onmessage = async (e) => {
  const { file, uploadId, chunkSize, totalChunks, concurrency } = e.data;

  const indices = Array.from({ length: totalChunks }, (_, i) => i);
  let cursor = 0;

  async function uploadChunk(index) {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const blob = file.slice(start, end);

    const res = await fetch(`/api/upload/chunk/${uploadId}/${index}`, {
      method: 'POST',
      body: blob,
    });

    if (!res.ok) {
      throw new Error(`Chunk ${index} failed with status ${res.status}`);
    }
    return res.json();
  }

  async function worker() {
    while (cursor < indices.length) {
      const myIndex = indices[cursor];
      cursor++;
      try {
        await uploadChunk(myIndex);
        self.postMessage({ type: 'chunk-done', index: myIndex });
      } catch (err) {
        self.postMessage({ type: 'error', error: err.message });
        return;
      }
    }
  }

  const workers = [];
  const poolSize = Math.min(concurrency || 4, totalChunks);
  for (let i = 0; i < poolSize; i++) {
    workers.push(worker());
  }

  try {
    await Promise.all(workers);
    self.postMessage({ type: 'all-done' });
  } catch (err) {
    self.postMessage({ type: 'error', error: err.message });
  }
};
