# 베베카 사전예약 수집/알림 구성

## 무엇이 추가됐나
- `POST /api/preorders`: 사전예약 저장 + 카카오톡(나에게) 알림 전송
- `GET /api/admin/preorders`: 관리자 목록 조회 API
- `admin.html`: 관리자 조회/CSV 다운로드 페이지
- `index.html`: 사전예약 완료 시 서버 API로 자동 전송

## 1) Supabase 준비
1. Supabase 프로젝트 생성
2. SQL Editor에서 아래 실행

```sql
create table if not exists public.preorders (
  id bigserial primary key,
  created_at timestamptz default now(),
  order_id text unique not null,
  user_id text,
  product_id text not null,
  product_name text not null,
  start_date date not null,
  end_date date not null,
  months int not null,
  address text not null,
  baby_age text not null,
  use_area text not null,
  referral_code text,
  note text,
  rental_amount int not null,
  deposit int not null,
  total_amount int not null,
  requested_at timestamptz default now()
);

create index if not exists idx_preorders_requested_at on public.preorders (requested_at desc);
```

## 2) Vercel 환경변수 설정
Vercel Project Settings > Environment Variables

- `SUPABASE_URL` = `https://<project-ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase service role key
- `SUPABASE_TABLE` = `preorders` (기본값 동일, 생략 가능)
- `ADMIN_DASHBOARD_KEY` = 관리자 조회용 임의 비밀키
- `KAKAO_ACCESS_TOKEN` = 카카오톡 나에게 보내기 access token

## 3) 카카오톡 알림 받기
이 구현은 카카오 `나에게 보내기` API를 사용합니다.

1. Kakao Developers 앱 생성
2. 카카오 로그인 + 동의항목 `talk_message` 권한 설정
3. OAuth로 사용자 access token 발급
4. 발급한 토큰을 `KAKAO_ACCESS_TOKEN`에 설정

테스트:
- 프론트에서 사전예약 완료
- 카카오톡으로 접수 메시지 도착 확인

## 4) 관리자 조회
- URL: `/admin.html`
- `ADMIN_DASHBOARD_KEY` 입력 후 조회
- CSV 다운로드 가능

## 참고
- API 파일: `api/preorders.js`, `api/admin/preorders.js`
- 관리자 페이지: `admin.html`
