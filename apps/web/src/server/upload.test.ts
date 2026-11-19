import { describe, expect, it } from 'vitest';
import { readUpload } from './upload';

const MAX = 1024;
const URL = 'https://siliconbox.test/api/v1/upload';

/** A multipart request with the type and length headers a browser sends with a FormData. */
async function upload(entries: [string, string | File][]): Promise<Request> {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  const encoded = new Response(form);
  const body = await encoded.arrayBuffer();
  const headers = {
    'content-type': encoded.headers.get('content-type') ?? '',
    'content-length': String(body.byteLength),
  };
  return new Request(URL, { method: 'POST', body, headers });
}

const cv = (bytes = '%PDF-1.7 invented') => new File([bytes], 'cv.pdf');

describe('readUpload', () => {
  it('returns the file and the form text fields', async () => {
    const request = await upload([
      ['file', cv()],
      ['jobDescription', 'UVM role'],
    ]);
    const { file, fields } = await readUpload(request, MAX, 'FILE_NOT_SUPPORTED');
    expect(file.name).toBe('cv.pdf');
    expect(fields).toEqual({ jobDescription: 'UVM role' });
  });

  it.each([
    ['no file field', () => upload([['jobDescription', 'UVM role']]), 'no file field'],
    ['an empty file', () => upload([['file', cv('')]]), 'file size'],
    ['a file over the limit', () => upload([['file', cv('x'.repeat(MAX + 1))]]), 'file size'],
    [
      'a body that is not a form',
      () =>
        Promise.resolve(
          new Request(URL, { method: 'POST', body: 'x', headers: { 'content-length': '1' } }),
        ),
      'not a multipart form',
    ],
    [
      'a request without a declared length',
      () => Promise.resolve(new Request(URL, { method: 'POST', body: 'x' })),
      'request too large',
    ],
  ])('refuses %s', async (_label, request, detail) => {
    await expect(readUpload(await request(), MAX, 'FILE_NOT_SUPPORTED')).rejects.toMatchObject({
      code: 'FILE_NOT_SUPPORTED',
      detail,
    });
  });
});
