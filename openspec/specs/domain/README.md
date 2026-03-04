# 业务领域模型

本目录定义 Wen-Yuan 项目的核心业务概念和领域模型。

## 核心领域

### 1. 文本分析领域
- 小说文本（Novel）
- 章节（Chapter）
- 段落（Paragraph）
- 文本片段（TextSegment）

### 2. 角色分析领域
- 角色（Character）
- 角色关系（Relationship）
- 角色事件（Event）
- 角色特征（Trait）

### 3. AI 分析领域
- 分析任务（AnalysisTask）
- 分析结果（AnalysisResult）
- 证据链（EvidenceChain）
- 置信度（Confidence）

### 4. 人工审核领域
- 审核任务（ReviewTask）
- 审核意见（ReviewComment）
- 审核状态（ReviewStatus）

## 领域边界

- 文本分析：处理原始文本的结构化
- 角色分析：基于文本的角色信息提取
- AI 分析：自动化分析与推理
- 人工审核：人工验证与修正

## 领域交互

```
文本分析 -> 角色分析 -> AI 分析 -> 人工审核
                          ↓
                      证据追溯
```
