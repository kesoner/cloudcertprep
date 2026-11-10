begin;
do $$ declare invalid jsonb; begin
 foreach invalid in array array['[]'::jsonb,'null'::jsonb,'1'::jsonb,'{"999999999999999999999":50}'::jsonb,'{"1":101}'::jsonb,'{"1":"50"}'::jsonb] loop
  if public.is_valid_domain_scores(invalid) then raise exception 'Invalid score shape accepted: %',invalid; end if;
 end loop;
 if not public.is_valid_domain_scores('{"1":0,"5":99.5}') then raise exception 'Valid scores rejected'; end if;
end $$;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.attempt_questions(user_id,cert_code,question_id,domain_id,user_answer,correct_answer,is_correct)
values('10000000-0000-4000-8000-000000000002','aif-c01','RLS-OTHER',5,'A','B',false);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into public.exam_attempts(user_id,cert_code,score_percent,scaled_score,passed,time_taken_seconds,total_questions,correct_answers,domain_scores)
values('10000000-0000-4000-8000-000000000001','aif-c01',100,1000,true,120,1,1,'{"5":100}');
insert into public.attempt_questions(user_id,cert_code,question_id,domain_id,user_answer,correct_answer,is_correct)
values('10000000-0000-4000-8000-000000000001','aif-c01','RLS-OWN',5,'A','A',true);
insert into public.domain_progress(user_id,cert_code,domain_id,questions_attempted,questions_correct,mastery_percent)
values('10000000-0000-4000-8000-000000000001','aif-c01',5,1,1,10)
on conflict(user_id,domain_id,cert_code) do update set mastery_percent=excluded.mastery_percent;
do $$ begin
 begin
 insert into public.exam_attempts(user_id,cert_code,score_percent,scaled_score,passed,time_taken_seconds,total_questions,correct_answers,domain_scores)
 values('10000000-0000-4000-8000-000000000001','aif-c01',100,1000,true,120,1,1,'[]');
 raise exception 'Invalid JSON insert accepted';
 exception when check_violation then null; end;
 if (select count(*) from public.attempt_questions)<>1 then raise exception 'RLS read isolation failed'; end if;
 if (select count(*) from public.question_mastery)<>1 then raise exception 'View RLS failed'; end if;
 if (select correct_streak from public.question_mastery)<>1 then raise exception 'Streak failed'; end if;
 begin
 insert into public.attempt_questions(user_id,cert_code,question_id,domain_id,correct_answer,is_correct)
 values('10000000-0000-4000-8000-000000000002','aif-c01','DENIED',5,'A',true);
 raise exception 'RLS write isolation failed';
 exception when insufficient_privilege then null; end;
 if (public.get_public_exam_stats()->'cert_stats'->0->'domain_stats'->0->>'avg_score')::numeric<>100 then raise exception 'Domain stats aggregation failed'; end if;
 if (public.get_public_exam_stats()->'cert_stats'->0->>'avg_score')::numeric<>1000 then raise exception 'Scaled score aggregation failed'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform * from public.attempt_questions; raise exception 'Anonymous private read allowed'; exception when insufficient_privilege then null; end;
 perform public.get_public_totals(); perform public.get_public_exam_stats();
end $$;
reset role;
rollback;
select 'PASS: owner read/write, cross-user denial, anonymous denial, AIF domain 5, mastery, public RPC. Fixtures rolled back.' status;
