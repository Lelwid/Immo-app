do $$
begin
  if to_regclass('public.document_ai_extractions') is not null then
    alter table public.document_ai_extractions
    drop constraint if exists document_ai_extractions_extraction_method_check;

    alter table public.document_ai_extractions
    add constraint document_ai_extractions_extraction_method_check
    check (extraction_method is null or extraction_method in ('native', 'ocr', 'vision'));
  end if;
end;
$$;
