// Saves a text file. Inside a published claude.ai artifact the page can't start
// downloads itself, so it asks the viewer through the `downloads` capability.
// Everywhere else (e.g. `npm run dev`) it uses a normal browser download.
export async function saveTextFile(filename, text) {
  const claude = typeof window !== 'undefined' ? window.claude : undefined;
  if (claude?.use) {
    const downloads = await claude.use('downloads');
    if (downloads) {
      try {
        await downloads.save({ filename, data: text });
        return 'saved';
      } catch (err) {
        if (err?.code === 'declined') return 'declined';
        throw err;
      }
    }
  }
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
}
