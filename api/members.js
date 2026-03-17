const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_MEMBERS_TABLE = process.env.SUPABASE_MEMBERS_TABLE || 'members';
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
  const required = ['memberUid', 'provider'];
  for (const key of required) {
    if (!payload[key]) return `missing field: ${key}`;
  }
  return null;
}

async function findMemberByUid(memberUid) {
  const url = new URL(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${SUPABASE_MEMBERS_TABLE}`);
  url.searchParams.set('select', 'id,member_uid');
  url.searchParams.set('member_uid', `eq.${memberUid}`);
  url.searchParams.set('limit', '1');

  const resp = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  const data = await resp.json().catch(() => ([]));
  if (!resp.ok) {
    const message = data?.message || data?.error || 'failed to query member';
    throw new Error(message);
  }
  return data?.[0] || null;
}

async function upsertMember(payload) {
  const row = {
    member_uid: payload.memberUid,
    provider: payload.provider,
    provider_user_id: payload.providerUserId || null,
    name: payload.name || null,
    phone: payload.phone || null,
    email: payload.email || null,
    marketing_opt_in: Boolean(payload.marketingOptIn),
    auth_flow: payload.authFlow || 'login',
    last_login_at: payload.requestedAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const url = new URL(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${SUPABASE_MEMBERS_TABLE}`);
  url.searchParams.set('on_conflict', 'member_uid');

  const resp = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
    },
    body: JSON.stringify([row]),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message = data?.message || data?.error || 'failed to upsert member';
    throw new Error(message);
  }
  return data?.[0] || null;
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'Method not allowed' });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, { ok: false, message: 'SUPABASE env missing' });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const bad = validate(payload);
    if (bad) return json(res, 400, { ok: false, message: bad });

    const existed = await findMemberByUid(payload.memberUid);
    const member = await upsertMember(payload);
    const isNew = !existed;

    let kakao = { ok: false, skipped: true, reason: 'login update only' };
    if (isNew || payload.authFlow === 'signup') {
      const msg = [
        '[베베카] 신규 회원가입',
        `회원ID: ${payload.memberUid}`,
        `방식: ${payload.provider}`,
        `이름: ${payload.name || '-'}`,
        `연락처: ${payload.phone || '-'}`,
        `이메일: ${payload.email || '-'}`,
      ].join('\n');
      kakao = await sendKakaoMemo(msg).catch((e) => ({ ok: false, error: e.message }));
    }

    return json(res, 200, {
      ok: true,
      isNew,
      member,
      notification: { kakao },
    });
  } catch (e) {
    return json(res, 500, { ok: false, message: e.message || 'internal error' });
  }
};

