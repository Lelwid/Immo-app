alter table public.document_ai_extractions
add column if not exists extraction_method text,
add column if not exists page_count integer,
add column if not exists analyzed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'document_ai_extractions_extraction_method_check'
      and conrelid = 'public.document_ai_extractions'::regclass
  ) then
    alter table public.document_ai_extractions
    add constraint document_ai_extractions_extraction_method_check
    check (extraction_method is null or extraction_method in ('native', 'ocr'));
  end if;
end;
$$;

create index if not exists document_ai_extractions_analyzed_at_idx
on public.document_ai_extractions(analyzed_at desc);
