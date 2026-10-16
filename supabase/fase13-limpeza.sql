-- Limpeza pós-deploy da etapa de escala. EXECUTAR SÓ DEPOIS DE 48 H ESTÁVEL com a versão 54ee84a (ou posterior) no ar.
-- Enquanto a função antiga existir, dá para voltar a versão anterior do site com um clique na Vercel.
-- Depois desta limpeza, voltar para uma versão anterior a 54ee84a exige recriar snapshot_data (supabase/fase8-otimizacao-2.sql).

drop function if exists public.snapshot_data(uuid, uuid[], date, date, boolean);
