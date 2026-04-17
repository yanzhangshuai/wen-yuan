-- REV-2 §0-3(b) 跨地点并发冲突检测：为 personas 增加 `current_location_chapter`
-- 语义：与 `current_location` 配对使用，记录最后一次写入地点对应的章节号。
-- Stage C 按章节时序维护：仅当新章节号 > 本字段时才允许覆盖地点，
-- 避免"旧章节回写覆盖新章节地点"的时序倒置。
-- 可空；新建角色与未知地点的情况保持 NULL。

ALTER TABLE "personas" ADD COLUMN "current_location_chapter" INTEGER;
