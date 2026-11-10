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
create table public.exam_attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 cert_code text not null, attempted_at timestamptz not null default now(),
 score_percent numeric not null check(score_percent between 0 and 100), scaled_score integer not null check(scaled_score between 100 and 1000),
 passed boolean not null, time_taken_seconds integer not null check(time_taken_seconds >= 0), total_questions integer not null check(total_questions > 0),
 correct_answers integer not null check(correct_answers between 0 and total_questions), domain_scores jsonb not null default '{}' constraint exam_attempts_domain_scores_valid check(public.is_valid_domain_scores(domain_scores)), unique(id,user_id)
);
create table public.attempt_questions (
 id uuid primary key default gen_random_uuid(), attempt_id uuid, user_id uuid not null references auth.users(id) on delete cascade,
 cert_code text not null, question_id text not null, domain_id integer not null check(domain_id >= 1), user_answer text,
 correct_answer text not null, is_correct boolean not null, was_flagged boolean not null default false,
 answered_at timestamptz not null default clock_timestamp(), foreign key(attempt_id,user_id) references public.exam_attempts(id,user_id) on delete cascade
);
create table public.domain_progress (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 cert_code text not null, domain_id integer not null check(domain_id >= 1), questions_attempted integer not null default 0,
 questions_correct integer not null default 0, mastery_percent numeric not null default 0, updated_at timestamptz not null default now(),
 unique(user_id,domain_id,cert_code), check(questions_correct between 0 and questions_attempted), check(mastery_percent between 0 and 100)
);
create index on public.exam_attempts(user_id,cert_code);
create index on public.exam_attempts(attempted_at);
create index on public.attempt_questions(attempt_id);
create index on public.attempt_questions(user_id,domain_id,cert_code,question_id,answered_at desc);
alter table public.exam_attempts enable row level security;
alter table public.attempt_questions enable row level security;
alter table public.domain_progress enable row level security;
create policy owner_only on public.exam_attempts for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy owner_only on public.attempt_questions for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy owner_only on public.domain_progress for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
revoke all on public.exam_attempts,public.attempt_questions,public.domain_progress from anon,authenticated;
grant select,insert,update,delete on public.exam_attempts,public.attempt_questions,public.domain_progress to authenticated;
create view public.question_mastery with(security_invoker=true) as
with ranked as (
 select *,row_number() over(partition by user_id,cert_code,domain_id,question_id order by answered_at desc,id desc) rn
 from public.attempt_questions
), grouped as (
 select user_id,cert_code,domain_id,question_id,max(answered_at) last_seen_at,
 coalesce(min(rn) filter(where not is_correct)-1,count(*))::integer correct_streak,
 bool_or(not is_correct) filter(where rn=1) last_was_wrong
 from ranked group by user_id,cert_code,domain_id,question_id
)
select *,correct_streak>=3 is_mastered,
 (correct_streak>=3 and last_seen_at>now()-interval '7 days') in_exclusion_window,
 case when correct_streak>=3 and last_seen_at>now()-interval '7 days' then null::numeric
 when last_was_wrong then 10::numeric else greatest(1,5-correct_streak)::numeric end weight from grouped;
revoke all on public.question_mastery from anon,authenticated;
grant select on public.question_mastery to authenticated;
create function public.get_public_totals() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('total_users',(select count(*) from auth.users),'total_questions_answered',(select count(*) from public.attempt_questions))
$$;
create function public.get_public_exam_stats() returns jsonb language sql stable security definer set search_path='' as $$
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
revoke all on function public.get_public_totals(),public.get_public_exam_stats() from public,anon,authenticated;
grant execute on function public.get_public_totals(),public.get_public_exam_stats() to anon,authenticated;
commit;
select 'CloudCertPrep schema ready' status;
