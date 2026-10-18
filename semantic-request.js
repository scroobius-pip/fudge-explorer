// A scope is an exact candidate set from one observed catalog generation.
export const MAX_SEMANTIC_SCOPE_IDS = 20_000;
export function validateSemanticScope(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'captureIds,generation'
    || !Number.isSafeInteger(value.generation) || value.generation < 1
    || !Array.isArray(value.captureIds) || value.captureIds.length > MAX_SEMANTIC_SCOPE_IDS
    || !value.captureIds.every(id => Number.isSafeInteger(id) && id > 0)
    || new Set(value.captureIds).size !== value.captureIds.length) {
    throw Object.assign(new Error('Invalid semantic search scope'), {code:'invalid_search_scope'});
  }
  return value;
}


export async function readSemanticImage(request) {
  const type = request.headers.get('content-type')?.split(';',1)[0]?.trim().toLowerCase();
  const maximum = type === 'multipart/form-data' ? 4 * 1024 * 1024 + 256 * 1024 : 4 * 1024 * 1024;
  if (Number(request.headers.get('content-length')) > maximum) throw Object.assign(Error('Too large'), {code:'request_too_large',status:413});
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length === 0 || body.length > maximum) throw Object.assign(Error('Too large'), {code:'request_too_large',status:413});
  let bytes = body, mediaType = type, scope;
  if (type === 'multipart/form-data') {
    try {
      const form = await new Response(body, {headers:{'content-type':request.headers.get('content-type')}}).formData();
      if ([...form.keys()].sort().join(',') !== 'image,scope') throw Error('Invalid fields');
      const image = form.get('image');
      if (!(image instanceof Blob) || typeof form.get('scope') !== 'string') throw Error('Invalid image');
      scope = validateSemanticScope(JSON.parse(form.get('scope')));
      bytes = new Uint8Array(await image.arrayBuffer()); mediaType = image.type;
    } catch (error) { throw Object.assign(Error('Invalid image search'), {code:'invalid_search_request',status:400}); }
  }
  if (!['image/jpeg','image/png'].includes(mediaType)) throw Object.assign(Error('Unsupported image'), {code:'unsupported_media_type',status:415});
  if (bytes.length === 0 || bytes.length > 4*1024*1024) throw Object.assign(Error('Too large'), {code:'request_too_large',status:413});
  return {bytes, mediaType, scope};
}
