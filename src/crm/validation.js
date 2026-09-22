const fail = (status, message) => Object.assign(new Error(message), {status});
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const string = (value, max, name) => {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw fail(400, `Invalid ${name}.`);
  return value.trim();
};
const choice = (value, options, name) => {
  if (!options.includes(value)) throw fail(400, `Invalid ${name}.`);
  return value;
};
function link(value, name) {
  const raw = string(value, 2048, name);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch { throw fail(400, `Use a full http:// or https:// URL for ${name}.`); }
}


export {fail,uuid,string,choice,link};
