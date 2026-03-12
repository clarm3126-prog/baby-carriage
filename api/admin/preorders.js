const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || 'preorders';
const ADMIN_DASHBOARD_KEY = process.env.ADMIN_DASHBOARD_KEY;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return json(res, 405, { ok: false, message: 'Method not allowed' });

  const adminKey = req.headers['x-admin-key'] || req.query.adminKey;
  if (!ADMIN_DASHBOARD_KEY || adminKey !== ADMIN_DASHBOARD_KEY) {
    return json(res, 401, { ok: false, message: 'unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, { ok: false, message: 'SUPABASE env missing' });
  }

  const limit = Math.min(Number(req.query.limit || 100), 500);
  const offset = Math.max(Number(req.query.offset || 0), 0);

  const url = new URL(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${SUPABASE_TABLE}`);
  url.searchParams.set('select', '*');
  url.searchParams.set('order', 'requested_at.desc');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));

  try {
    const resp = await fetch(url.toString(), {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const message = data?.message || data?.error || 'failed to query preorders';
      return json(res, 500, { ok: false, message });
    }

    return json(res, 200, { ok: true, items: data });
  } catch (e) {
    return json(res, 500, { ok: false, message: e.message || 'internal error' });
  }
};
