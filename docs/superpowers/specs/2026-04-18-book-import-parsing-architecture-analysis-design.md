# 书籍导入解析架构业务可用性审计

## 0. 结论先行

本次审计的结论不是“两套架构都合理，只是风格不同”，而是：

1. `sequential`（逐章解析）作为过渡架构是合理的，但不适合作为长期主架构。
2. `threestage`（三阶段）在架构方向上明显更合理，尤其更接近“角色数量正确 + 事迹归属正确”的业务目标。
3. 但以当前代码、知识库覆盖、阈值校准、评测闭环成熟度来看，**还不能严肃承诺已经稳定达到 85% 以上业务准确率**。
4. 如果业务口径是“角色数量接近真实规模，且主要事迹能归到正确角色”，那么当前系统的主要瓶颈已经不只是 Prompt 问题，而是：
   - 历史架构遗留语义与新架构并存
   - 知识库冷启动与别名覆盖不足
   - Stage B / Stage C 缺少充分的业务评测闭环
   - 不同 `BookType` 的阈值和 few-shot 远未完成充分校准

更直白地说：

- `sequential` 不足以支撑你的目标。
- `threestage` 是正确方向，但还处在“架构已到位，业务闭环未到位”的阶段。
- 当前系统适合继续作为研发迭代主线，不适合对外承诺“已经稳定满足角色数量、事迹都满足，且 ≥85%”。

---

## 1. 评估框架：本次不按论文指标，而按业务可用性审计

用户要求不是简单 precision / recall / F1，而是：

1. 角色数量要尽量接近真实书中有效人物规模。
2. 角色事迹要尽量归到正确的人，不能大量串人、错人、合并错人。
3. 错误出现后，知识库、候选池、人工复核链路要能纠偏，而不是一旦错了就全链路扩散。
4. 不能只在《儒林外史》一个样本上看起来有效，还要判断是否对其他书型有迁移能力。

因此本次判断“是否达到 85%+”时，采用的是业务口径：

- 若角色数偏离很大，即使单条实体识别看起来“像对了”，也不能算通过。
- 若角色存在，但主要事迹大量归错人，也不能算通过。
- 若系统只能在人工强干预下勉强修正，也不能算真正业务可用。

这意味着本次审计更接近“系统能否交付稳定结果”，而不是“局部样本上是否有漂亮分数”。

---

## 2. 两套架构的真实现状

### 2.1 当前运行时架构并不是“三选一”，而是二选一

从 [`runAnalysisJob.ts`](/home/mwjz/code/wen-yuan/src/server/modules/analysis/jobs/runAnalysisJob.ts) 与 [`factory.ts`](/home/mwjz/code/wen-yuan/src/server/modules/analysis/pipelines/factory.ts) 可见，当前运行时只支持：

- `sequential`
- `threestage`

未知 architecture 会被归一化到 `threestage`。这说明项目在运行时层面已经把三阶段视为新默认，不再把旧的 `twopass` 当作现行主链路。

### 2.2 `sequential` 的真实语义

[`SequentialPipeline.ts`](/home/mwjz/code/wen-yuan/src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts) 的核心逻辑是：

- 按章节循环
- 每章调用 `analyzeChapter`
- 高风险章节触发章节级校验
- 每隔若干章做一次称号溯源

它的优点是章节上下文连续、运行逻辑简单、失败定位也容易。但它把“识别人物”“判断是不是同一个人”“把事迹挂到谁身上”几件事绑得过紧，导致前一步错了，后面几步会一起错。

### 2.3 `threestage` 的真实语义

[`ThreeStagePipeline.ts`](/home/mwjz/code/wen-yuan/src/server/modules/analysis/pipelines/threestage/ThreeStagePipeline.ts) 已经把流程拆成：

1. Stage A：逐章硬提取 `persona_mentions`
2. Stage B.5：纯 DB 的时序一致性检查
3. Stage B：全书实体仲裁、决定 mention 是否晋级为 persona、是否只生成 `merge_suggestions`
4. Stage C：基于已晋级 persona 再做事迹归属

这不是名义上的重命名，而是实体识别、实体归并、事件归属已被明确解耦。

---

## 3. 正反论证一：逐章解析是否合理

### 3.1 正方论证：为什么它不是“完全错误”的

`sequential` 不是无意义架构，至少有三点现实价值：

1. 对叙事结构比较直、称谓歧义较少的书，逐章解析天然贴近阅读顺序，模型更容易保持局部一致性。
2. 它的工程链路短，便于快速落地、快速查错、快速形成最早版本。
3. 对一些低复杂度场景，它可以用较低系统复杂度获得“能跑”的结果。

换言之，如果目标只是先把流水线搭起来，`sequential` 是合理的早期工程选择。

### 3.2 反方论证：为什么它不够支撑你的业务目标

问题在于，你要的不是“能跑”，而是“角色数量、事迹都满足”。

对此，`sequential` 有结构性短板：

1. 角色识别、别名消歧、事迹归属耦合过深。
   一旦章节里把称谓识错或归错，错误会直接写入 persona 和 biography，后续再修正成本很高。
2. 它更像“边读边定案”，缺少足够大的候选缓冲层。
   对《儒林外史》这类同姓、称号、讽刺口吻、高频转述混杂的文本，过早定案会放大误归并。
3. 章节级校验是补救，而不是重构链路。
   校验可以发现一部分问题，但很难逆转前面已经写入的人物边界错误。
4. 它对“角色数量准确”尤其不友好。
   因为局部章节里一个称谓一旦被当成人，后续常常会形成过量 persona。
5. 它对“事迹归属准确”同样不友好。
   因为 biography 生成发生在实体边界尚未真正稳定之前。

[`docs/人物解析链路审计报告.md`](/home/mwjz/code/wen-yuan/docs/人物解析链路审计报告.md) 中已经有《儒林外史》的具体反例，包括角色过量生成、牛浦 / 牛布衣之类的错误归并与错挂事迹。这说明问题不是偶发 Prompt 抖动，而是旧架构家族的结构性缺陷。

### 3.3 对 `sequential` 的最终判断

结论是：

- 作为过渡架构，合理。
- 作为长期主架构，不合理。
- 作为你的业务目标主解，不足够。

---

## 4. 正反论证二：三阶段是否合理

### 4.1 正方论证：为什么三阶段明显更接近正确方向

三阶段的核心价值不在于“阶段更多”，而在于它把最容易互相污染的三个问题拆开了。

#### A. 先把“原文出现了谁”存成候选，而不是立刻定成人物

[`StageAExtractor.ts`](/home/mwjz/code/wen-yuan/src/server/modules/analysis/pipelines/threestage/stageA/StageAExtractor.ts) 只负责写 `persona_mentions`，明确禁止直接写 `personas` 和 `biography_records`。这一步非常关键，因为它把“观察到的表层称呼”与“最终认定的人物实体”分离开了。

对《儒林外史》这类文本，这种分离本身就能明显降低过早建人的噪音。

#### B. 全书范围做实体仲裁，比逐章当场定案更符合人物识别本质

[`StageBResolver.ts`](/home/mwjz/code/wen-yuan/src/server/modules/analysis/pipelines/threestage/stageB/StageBResolver.ts) 会聚合全书 mention，并通过三条候选通道建组：

- 相同 `surfaceForm`
- 相同 `suspectedResolvesTo`
- `AliasEntry` 命中

而且它不是“模型说能合并就合并”，而是还有较强的必要/充分条件。不满足时会进入 `merge_suggestions`，而不是粗暴自动合并。

这说明它开始具备“先保守分离，再逐步确认”的工程意识，这比旧架构更适合保住角色数量上限和实体边界。

#### C. 先把实体边界做稳，再做事迹归属

[`StageCAttributor.ts`](/home/mwjz/code/wen-yuan/src/server/modules/analysis/pipelines/threestage/stageC/StageCAttributor.ts) 是在 `promotedPersonaId` 已经存在之后，再按章做 biography attribution。

这一步对“事迹都满足”尤其重要。因为业务上最伤的不是少一条边角信息，而是主要事迹挂错人。Stage C 把归属放到实体仲裁之后，理论上就更符合你的目标。

#### D. 数据模型已经开始围绕三阶段组织

从 [`schema.prisma`](/home/mwjz/code/wen-yuan/prisma/schema.prisma) 可见，新增模型和字段明显偏向三阶段：

- `PersonaMention`
- `ChapterPreprocessResult`
- `MergeSuggestion`
- `Persona.mentionCount`
- `Persona.effectiveBiographyCount`
- `Persona.distinctChapters`
- `BiographyRecord.rawSpan`
- `BiographyRecord.actionVerb`
- `BiographyRecord.isEffective`
- `BiographyRecord.attributionConfidence`

这说明三阶段不是只改了代码目录，而是已经获得了数据模型层的正式支撑。

### 4.2 反方论证：为什么三阶段“方向对”不等于“已经可承诺”

三阶段也有当前阶段的现实问题。

#### A. 规则和数据结构虽然到位，但业务评测闭环还不够硬

[`regression.test.ts`](/home/mwjz/code/wen-yuan/src/server/modules/analysis/pipelines/threestage/regression.test.ts) 覆盖了 5 个 `BookType`，这是优点；但它主要证明的是规则层行为稳定、region override 稳定，而不是证明“角色数量 + 事迹归属”在业务意义上已经稳定达标。

也就是说，现在更像是“链路可回归”，还不是“结果已证明”。

#### B. 不同书型阈值并未充分实测校准

[`thresholdsByBookType.ts`](/home/mwjz/code/wen-yuan/src/server/modules/analysis/config/thresholdsByBookType.ts) 中，`CLASSICAL_NOVEL` 的阈值相对更像基于《儒林外史》做过思考，但其他类型大多仍是 TODO 性质的保守默认。

这直接影响一个关键判断：

- 三阶段有跨书泛化潜力，成立。
- 三阶段已经跨书稳定达到 85%+，不成立。

#### C. 知识库虽然转向 DB-only，但冷启动能力仍是弱点

[`load-book-knowledge.ts`](/home/mwjz/code/wen-yuan/src/server/modules/knowledge/load-book-knowledge.ts) 与 [`analysis-runtime-knowledge.md`](/home/mwjz/code/wen-yuan/.trellis/spec/backend/analysis-runtime-knowledge.md) 已明确约束：运行时知识应由数据库驱动，不允许在 Prompt / Resolver 中补硬编码默认规则。

这是对的，因为它让系统具备长期可维护性。

但反过来说，这也意味着：

- DB 中没有的 alias、称谓规则、历史人物、名字模式，就真的不会在运行时自动出现。
- 如果知识库种子、审核、激活状态、BookType 适配不足，三阶段不会“神奇地自己补齐”。

所以 DB-only 是正确的长期架构，但短期会把知识覆盖不足暴露得更明显。

#### D. 新旧语义并存，仍有冲突风险

`Persona` 既有新的 mention / status / effectiveBiography 语义，也保留了旧的 `aliases: String[]`。

与此同时，系统中又存在：

- `AliasMapping`
- `AliasEntry`
- `PersonaMention.suspectedResolvesTo`

这意味着“别名”语义至少分散在三套机制中。只要治理不彻底，就可能出现：

- 某个别名在旧字段里存在，但 Stage B 不以它为主证据
- 某个别名在 `AliasEntry` 有，但 `Persona.aliases` 没同步
- 某个 merge 已形成 suggestion，但旧 persona 语义仍残留

这会伤害实体边界稳定性，继而伤害角色数量和事迹归属。

### 4.3 对 `threestage` 的最终判断

结论是：

- 作为长期主架构，合理。
- 作为替代 `sequential` 的主线，合理。
- 作为“已经可以稳定承诺业务目标”的成熟方案，暂时还不够。

---

## 5. 知识库、数据表、代码是否真的支撑这两套架构

### 5.1 Book / Chapter / AnalysisJob / ChapterPreprocessResult 层

这一层明显更偏向三阶段。

原因有三：

1. `AnalysisJob.architecture` 默认值已经是 `threestage`。
2. `AnalysisJob` 已经直接关联 `personaMentions` 与 `preprocessResults`。
3. `ChapterPreprocessResult` 是典型的三阶段前置产物，逐章解析并不天然需要这个中间层。

判断：这层数据结构对三阶段支撑充分，对 sequential 只是兼容，不再是为它设计。

### 5.2 Persona / Profile / AliasMapping / MergeSuggestion 层

这一层处在“新旧过渡混合态”。

支撑点：

- `MergeSuggestion` 非常符合三阶段“先保守、再审议”的思路。
- `Persona.status / mentionCount / distinctChapters / effectiveBiographyCount` 已经把 persona 从静态表变成了一个可晋级的实体状态机。

不足点：

- `Profile` 仍承接不少旧链路的书内人物摘要语义。
- `AliasMapping` 是旧链路时期的重要机制，但现在与 `AliasEntry`、`Persona.aliases`、`suspectedResolvesTo` 并存，边界不够单一。

判断：实体层已明显向三阶段倾斜，但别名治理层尚未彻底统一。

### 5.3 PersonaMention 层

这是三阶段最关键、也是最有价值的新支点。

它解决的不是“多一张表”，而是：

- 把“原文观察”与“实体确认”分离
- 允许 Stage B 做全书级聚合
- 允许 Stage C 只基于已晋级 persona 做事件归属

若没有 `PersonaMention` 这一层，想真正解决《儒林外史》的人物数量控制和错归属问题会非常困难。

判断：`PersonaMention` 是三阶段合理性的核心证据。

### 5.4 BiographyRecord / Mention / Relationship 层

这里反映出旧新两套思维的并存。

好的方面：

- `BiographyRecord` 新增了 `narrativeLens`、`narrativeRegionType`、`rawSpan`、`actionVerb`、`isEffective`、`attributionConfidence`，说明事迹归属已经开始被精细建模，而不是简单生成一句摘要。

隐患方面：

- `Mention` / `Relationship` 更接近旧链路直接落事实体的思路。
- 若未来业务核心转为“三阶段先 mention、后 persona、后 biography”，则旧 `Mention` 与新 `PersonaMention` 的职责边界还需要继续收敛，否则会给维护和评测带来歧义。

判断：事迹层已经开始支撑“事迹都满足”的目标，但周边模型的语义收束还未完成。

### 5.5 运行时知识库是否真的是数据库驱动

这一点总体判断为：**是，方向上已经成立。**

证据：

- [`analysis-runtime-knowledge.md`](/home/mwjz/code/wen-yuan/.trellis/spec/backend/analysis-runtime-knowledge.md) 明确规定 `load-book-knowledge.ts` 是唯一运行时知识网关。
- 运行时知识包括：
  - generic titles
  - surnames
  - ner lexicon rules
  - prompt extraction rules
  - alias lookup
  - historical figures
  - relational terms
  - name pattern rules

这说明“知识库服务化”不再只是文档口号，而是已落到运行时约束。

但要注意：DB-only 只是解决了“知识从哪里来”，没有解决“知识够不够、准不准、覆盖不覆盖”。

---

## 6. 围绕“角色数量 + 事迹都满足”的多轮正反论证

### 6.1 第一轮：如果只看角色数量，哪套更有希望

正方支持 `sequential` 的观点：

- 逐章做局部消歧，理论上能少一些全书级误合并。

反方指出：

- 真正伤角色数量的往往不是“误合并太多”，而是“误建人太多”。
- `sequential` 在实体边界未稳定前就持续建 persona，更容易把称号、泛称、局部误识别累积成过量角色。

结论：

- 若业务目标是角色数量接近真实规模，`threestage` 更有希望。

### 6.2 第二轮：如果只看事迹归属，哪套更有希望

正方支持 `sequential` 的观点：

- 章节内上下文完整，模型在当章直接抽人物和事迹，似乎更自然。

反方指出：

- 章节内“看起来自然”并不等于归属稳。
- 如果人物边界本身尚未稳定，当章生成的 biography 只是更早地把错误固化。

而 `threestage` 的优势是：

- 先晋级 persona，再做 attribution，至少在流程上减少了“人还没认准，就先写履历”的风险。

结论：

- 若业务目标是事迹尽量挂对人，`threestage` 也更有希望。

### 6.3 第三轮：如果考虑知识库和人工复核，哪套更能形成闭环

支持 `sequential` 的观点：

- 它逻辑简单，人工看起来更容易理解。

反方指出：

- 容易理解不等于容易修正。
- 如果错误已经直接写进 persona / biography，人工复核面对的是“已污染结果”，而不是“待仲裁候选”。

三阶段的好处是：

- `persona_mentions` 是候选池
- `merge_suggestions` 是缓冲层
- Stage C 还能反向给 Stage B 提反馈

这更像一个能不断纠偏的系统。

结论：

- 若业务目标要求可持续提高准确率，三阶段闭环能力更强。

### 6.4 第四轮：如果考虑跨书泛化，哪套更有前景

支持 `sequential` 的观点：

- 逻辑简单，似乎更容易迁移。

反方指出：

- 真正的泛化不是“流程简单”，而是“结构能吸收不同书型的知识差异”。
- 当前系统的 BookType、Prompt 变体、few-shot、threshold overlay、知识库加载，明显都是围绕三阶段在建设。

结论：

- 从泛化潜力看，三阶段优于 sequential。
- 但从已验证程度看，目前还不能说泛化能力已经被证实。

---

## 7. 能否达到 85% 以上业务准确率

### 7.1 若只问“理论上哪套更可能达到”

答案是：`threestage`。

因为它在结构上更符合业务目标：

- 先保存 mention，不急于建人
- 全书仲裁人物边界
- 再做事迹归属
- 允许 suggestion 和反馈回路存在

### 7.2 若问“当前项目现在能不能稳定做到”

答案是：**不能严肃下这个结论。**

原因不是完全没希望，而是证据链不够闭合：

1. 《儒林外史》方向上已有针对性设计，但缺少能直接支撑“角色数量 + 事迹归属 ≥85%”的成体系业务评测结果。
2. 其他 `BookType` 阈值明显仍在待校准阶段。
3. 回归测试更多证明规则一致性，不证明端到端业务准确率。
4. 知识库 DB-only 已建立，但知识覆盖率本身还没有形成可量化的达标证据。
5. 旧字段与新机制并存，会继续制造边界噪音。

### 7.3 对“85%”的更谨慎表述

更准确的说法应该是：

- `sequential` 基本不应被视为达成 85% 业务可用性的主路径。
- `threestage` 有机会成为达成 85% 的主路径。
- 但当前状态更接近“已具备逼近 85% 的架构基础”，而不是“已经被证明稳定达到 85%”。

---

## 8. 目前最明显的问题与不足

### 8.1 架构层问题

1. `sequential` 仍然存在，容易让系统长期处于双主线心态，而不是明确收敛。
2. 新旧实体语义并存，尤其 alias 相关机制未完全统一。
3. `Mention` 与 `PersonaMention` 的职责边界还不够彻底收束。

### 8.2 知识库层问题

1. DB-only 运行时是对的，但知识覆盖冷启动不足会直接暴露在结果上。
2. `AliasEntry`、BookType 规则、历史人物、名字模式的质量，当前还不足以支撑稳定跨书泛化。
3. 若没有持续知识审核与回灌机制，三阶段再好也会受制于基础知识覆盖。

### 8.3 评测层问题

1. 缺少围绕“角色数量 + 事迹归属”设计的端到端业务评测集。
2. 缺少将《儒林外史》作为主基准、并扩展到其他书型的统一评分口径。
3. 现有测试更多是回归护栏，不是业务验收。

### 8.4 工程收敛层问题

1. 旧链路遗留文档、旧字段、旧心智仍在。
2. 若未来继续同时维护两套主链路，团队会长期把精力耗在兼容而不是提升业务准确率。

---

## 9. 最终判断与建议

### 9.1 是否两套架构都合理

不是。

更准确地说：

- `sequential` 作为历史过渡方案合理。
- `threestage` 作为长期主架构合理。
- 若把两者都视为同等长期合理方案，不成立。

### 9.2 三阶段是否已经成熟到可以替代逐章解析

从架构方向上，应该替代。

从业务承诺上，还不能说“替代后已稳定达标”。

因此建议是：

- 组织层面上把 `threestage` 定为唯一主演进方向。
- `sequential` 只保留为回归对照、灰度 fallback 或特定低复杂度书型的临时兜底。

### 9.3 当前实现能否满足“角色数量、事迹都满足”

我的判断是：

- 在部分样本、部分章节、部分书型上，可能已经明显优于旧链路。
- 但从全局、稳定、可承诺的角度看，**还不能说已经满足**。

### 9.4 差距主要属于哪一类问题

不是单一问题，而是四类问题叠加：

1. 架构收敛还未彻底完成
2. 知识库覆盖和别名治理还不足
3. Prompt / 阈值 / few-shot 的分书型校准不足
4. 业务评测闭环尚未形成硬证据

### 9.5 最终建议

建议明确采取以下判断：

1. 不再把 `sequential` 当作与 `threestage` 并列的长期方案。
2. 把三阶段定位为唯一主线，并围绕它继续收敛数据模型与别名体系。
3. 暂时不要对外或对业务方承诺“已经稳定达到 85%+”。
4. 后续所有优化应围绕同一个业务口径评估：
   - 角色数量是否接近真实规模
   - 主要事迹是否归到正确角色

---

## 10. 本次审计的最终一句话

当前项目在“书籍导入解析”上，**三阶段是正确方向，逐章解析只是历史过渡；当前系统已经具备逼近业务目标的骨架，但还没有形成足以证明‘角色数量、事迹都满足且稳定 ≥85%’的完整证据链。**
