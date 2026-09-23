-- Keep the strongest identity match visible even when many weaker name matches
-- fill the bounded preview. Full-result fingerprints remain unchanged.
do $$
declare definition text;
begin
  select pg_get_functiondef('crm_private.research_duplicate_rows(uuid,jsonb)'::regprocedure) into definition;
  if strpos(definition,'order by kind,id limit 10')=0 then raise exception 'Unexpected research duplicate function'; end if;
  definition:=replace(definition,'order by kind,id limit 10',
    'order by case when match=''domain'' then 0 else 1 end,case when kind=''company'' then 0 else 1 end,id limit 10');
  execute definition;
end;
$$;
