-- Non-destructive repair: old rows remain; invalid domain stats are ignored.
begin;
create or replace function public.is_valid_domain_scores(scores jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare item record;
begin
 if jsonb_typeof(scores) is distinct from 'object' then return false; end if;
 for item in select * from jsonb_each(scores) loop
  if item.key !~ '^[1-9][0-9]{0,8}$' or jsonb_typeof(item.value) <> 'number' then return false; end if;
  if (item.value::text)::numeric not between 0 and 100 then return false; end if;
 end loop;
 return true;
end;
$$;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='exam_attempts_domain_scores_valid' and conrelid='public.exam_attempts'::regclass) then
  alter table public.exam_attempts add constraint exam_attempts_domain_scores_valid check(public.is_valid_domain_scores(domain_scores)) not valid;
 end if;
end $$;
create or replace function public.get_public_exam_stats() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('cert_stats',coalesce(jsonb_agg(stats),'[]'::jsonb)) from (
 select e.cert_code,count(*) total_attempts,count(*) filter(where passed) total_passes,
 round(avg(scaled_score),2) avg_score,round(avg(time_taken_seconds)/60,2) avg_time_minutes,
 min(time_taken_seconds) filter(where passed) fastest_pass_seconds,
 coalesce((select jsonb_agg(d) from (
 select kv.key::integer domain_id,round(avg(kv.value::numeric),2) avg_score
 from public.exam_attempts x cross join lateral jsonb_each_text(case when public.is_valid_domain_scores(x.domain_scores) then x.domain_scores else '{}'::jsonb end) kv
 where x.cert_code=e.cert_code group by kv.key
 ) d),'[]'::jsonb) domain_stats,
 coalesce((select jsonb_agg(w) from (
 select attempted_at passed_at,scaled_score,cert_code,time_taken_seconds from public.exam_attempts x
 where x.cert_code=e.cert_code and x.passed order by attempted_at desc limit 10
 ) w),'[]'::jsonb) recent_passes
 from public.exam_attempts e group by e.cert_code
 ) stats
$$;
commit;
