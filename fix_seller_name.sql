-- ==========================================
-- 修复供应商名称前缀污染（冒号/"名称："等）
-- 用法: psql -U invoice -d invoice -f fix_seller_name.sql
-- 安全: 先用 SELECT 预览，确认无误后取消下面 UPDATE 的注释
-- ==========================================

-- 预览脏数据
SELECT id, seller_name AS 清洗前,
       regexp_replace(seller_name, '^(名称|销售方|销方)[：:]?|[：:]', '', 'g') AS 清洗后
FROM receiving_notes
WHERE seller_name ~ '^[：:]'
   OR seller_name ~ '^名称[：:]'
   OR seller_name ~ '^销售方[：:]'
   OR seller_name ~ '^销方[：:]'
ORDER BY id;

-- 执行修复（确认预览无误后取消注释执行）
-- UPDATE receiving_notes
-- SET seller_name = regexp_replace(seller_name, '^(名称|销售方|销方)[：:]?|[：:]', '', 'g')
-- WHERE seller_name ~ '^[：:]'
--    OR seller_name ~ '^名称[：:]'
--    OR seller_name ~ '^销售方[：:]'
--    OR seller_name ~ '^销方[：:]';
