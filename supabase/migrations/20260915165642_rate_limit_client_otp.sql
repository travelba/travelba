create table if not exists crm_private.otp_rate_limits (
  scope text not null,
  key_hash text not null,
  bucket_start timestamptz not null,
  request_count integer not null default 1,
  primary key (scope, key_hash, bucket_start)
);

revoke all on crm_private.otp_rate_limits from public, anon, authenticated;

create or replace function public.crm_allow_otp_request(
  p_email_hash text,
  p_ip_hash text
)
returns boolean
language plpgsql
security definer
set search_path = crm_private, public
as $$
declare
  bucket timestamptz := date_trunc('minute', now());
  email_count integer;
  ip_count integer;
  global_count integer;
begin
  delete from crm_private.otp_rate_limits
  where bucket_start < now() - interval '1 day';

  insert into crm_private.otp_rate_limits (scope, key_hash, bucket_start)
  values ('email', p_email_hash, bucket)
  on conflict (scope, key_hash, bucket_start)
  do update set request_count = crm_private.otp_rate_limits.request_count + 1
  returning request_count into email_count;

  insert into crm_private.otp_rate_limits (scope, key_hash, bucket_start)
  values ('ip', p_ip_hash, bucket)
  on conflict (scope, key_hash, bucket_start)
  do update set request_count = crm_private.otp_rate_limits.request_count + 1
  returning request_count into ip_count;

  insert into crm_private.otp_rate_limits (scope, key_hash, bucket_start)
  values ('global', 'all', bucket)
  on conflict (scope, key_hash, bucket_start)
  do update set request_count = crm_private.otp_rate_limits.request_count + 1
  returning request_count into global_count;

  return email_count <= 1 and ip_count <= 10 and global_count <= 100;
end;
$$;

revoke all on function public.crm_allow_otp_request(text, text)
  from public, anon, authenticated;
grant execute on function public.crm_allow_otp_request(text, text)
  to service_role;
