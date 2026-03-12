const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || 'preorders';
const ADMIN_DASHBOARD_KEY = process.env.ADMIN_DASHBOARD_KEY;
const KAKAO_ACCESS_TOKEN = process.env.KAKAO_ACCESS_TOKEN;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
}

async function sendKakaoMemo(text) {
  if (!KAKAO_ACCESS_TOKEN) return { ok: false, skipped: true, reason: 'missing KAKAO_ACCESS_TOKEN' };

  const templateObject = {
    object_type: 'text',
    text,
    link: {
      web_url: 'https://github.com/clarm3126-prog/baby-carriage',
      mobile_web_url: 'https://github.com/clarm3126-prog/baby-carriage',
    },
  };

  const resp = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KAKAO_ACCESS_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body: new URLSearchParams({ template_object: JSON.stringify(templateObject) }),
  });

  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

function validate(payload) {
  const required = ['orderId', 'userId', 'prodId', 'prodName', 'start', 'end', 'months', 'addr', 'babyAge', 'useArea', 'total'];
  for (const key of required) {
    if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
      return `missing field: ${key}`;
    }
  }
  return null;
}

async function insertPreorder(payload) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE env missing');
  }

  const row = {
    order_id: payload.orderId,
    user_id: payload.userId,
    product_id: String(payload.prodId),
    product_name: payload.prodName,
    start_date: payload.start,
    end_date: payload.end,
    months: Number(payload.months),
    address: payload.addr,
    baby_age: payload.babyAge,
    use_area: payload.useArea,
    referral_code: payload.refCode || null,
    note: payload.note || null,
    rental_amount: Number(payload.rentalAmt || 0),
    deposit: Number(payload.deposit || 0),
    total_amount: Number(payload.total || 0),
    requested_at: payload.requestedAt || new Date().toISOString(),
  };

  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${SUPABASE_TABLE}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([row]),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message = data?.message || data?.error || 'failed to insert preorder';
    throw new Error(message);
  }

  return data?.[0] || null;
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    const adminKey = req.headers['x-admin-key'] || req.query.adminKey;
    if (!ADMIN_DASHBOARD_KEY || adminKey !== ADMIN_DASHBOARD_KEY) {
      return json(res, 401, { ok: false, message: 'unauthorized' });
    }
    return json(res, 200, { ok: true, message: 'use /api/admin/preorders for list' });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, message: 'Method not allowed' });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const bad = validate(payload);
    if (bad) return json(res, 400, { ok: false, message: bad });

    const inserted = await insertPreorder(payload);

    const msg = [
      '[베베카] 신규 사전예약 접수',
      `예약번호: ${payload.orderId}`,
      `상품: ${payload.prodName}`,
      `기간: ${payload.start} ~ ${payload.end}`,
      `아이연령: ${payload.babyAge}`,
      `지역: ${payload.useArea}`,
      `추천코드: ${payload.refCode || '-'}`,
      `예상결제: ${(Number(payload.total) || 0).toLocaleString()}원`,
    ].join('\n');

    const kakao = await sendKakaoMemo(msg).catch((e) => ({ ok: false, error: e.message }));

    return json(res, 200, {
      ok: true,
      preorder: inserted,
      notification: {
        kakao,
      },
    });
  } catch (e) {
    return json(res, 500, { ok: false, message: e.message || 'internal error' });
  }
};
