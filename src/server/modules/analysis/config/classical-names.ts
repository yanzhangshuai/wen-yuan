/**
 * =============================================================================
 * 文件定位（服务端分析模块 - 古典文学字号/谥号/绰号知识库）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/analysis/config/classical-names.ts`
 *
 * 核心职责：
 * - 存储中国古典文学中已知人物的多称谓映射（字、号、谥号、绰号、法号等）；
 * - 供 GlobalEntityResolver 在 Pass 2 规则预分组阶段使用，将已知的称谓直接合并，
 *   减少对 LLM 消歧的依赖，提升准确率并降低成本。
 *
 * 数据来源与维护说明：
 * - 数据来自权威文学研究资料，经人工校验；
 * - 每条映射的 canonicalName 应为该人物最广为人知的全名；
 * - aliases 应包含该人物在原著中实际出现的所有称谓形式；
 * - 按作品/场景分组管理，便于后续按体裁选择性加载。
 *
 * 重要约束：
 * - 本知识库仅用于规则预合并，不替代 LLM 消歧；
 * - 对于不确定的映射（如同一称号在不同作品中指不同人物），不应写入此库；
 * - 修改时需验证不会引起跨作品误合并。
 * =============================================================================
 */

/**
 * 单条人物别名映射。
 * canonicalName: 标准全名（唯一标识）。
 * aliases: 该人物在文学作品中的所有已知称谓。
 */
export interface ClassicalNameEntry {
  /** 标准全名，如"关羽"。 */
  canonicalName: string;
  /** 所有已知别名/称谓，包含字、号、谥号、官衔、绰号等。 */
  aliases      : string[];
}

// ---------------------------------------------------------------------------
// 三国演义 — 字号/谥号极为丰富，是全网最常引用的别名体系
// ---------------------------------------------------------------------------

const SANGUO_NAMES: ClassicalNameEntry[] = [
  // 蜀汉
  { canonicalName: "刘备",   aliases: ["刘玄德", "玄德", "先主", "刘皇叔", "皇叔", "使君", "刘豫州", "豫州"] },
  { canonicalName: "关羽",   aliases: ["关云长", "云长", "关公", "关将军", "美髯公", "汉寿亭侯", "武圣"] },
  { canonicalName: "张飞",   aliases: ["张翼德", "翼德", "张将军"] },
  { canonicalName: "诸葛亮", aliases: ["孔明", "诸葛孔明", "卧龙", "卧龙先生", "丞相", "武侯", "诸葛丞相", "军师"] },
  { canonicalName: "赵云",   aliases: ["赵子龙", "子龙", "赵将军", "常山赵子龙"] },
  { canonicalName: "马超",   aliases: ["马孟起", "孟起", "锦马超", "马将军"] },
  { canonicalName: "黄忠",   aliases: ["黄汉升", "汉升"] },
  { canonicalName: "庞统",   aliases: ["庞士元", "士元", "凤雏", "凤雏先生"] },
  { canonicalName: "姜维",   aliases: ["姜伯约", "伯约"] },
  { canonicalName: "魏延",   aliases: ["魏文长", "文长"] },
  { canonicalName: "法正",   aliases: ["法孝直", "孝直"] },
  { canonicalName: "刘禅",   aliases: ["阿斗", "后主", "刘公嗣"] },

  // 曹魏
  { canonicalName: "曹操",   aliases: ["曹孟德", "孟德", "曹丞相", "魏王", "武帝", "阿瞒", "曹阿瞒"] },
  { canonicalName: "曹丕",   aliases: ["曹子桓", "子桓", "文帝", "魏文帝"] },
  { canonicalName: "司马懿", aliases: ["司马仲达", "仲达"] },
  { canonicalName: "夏侯惇", aliases: ["夏侯元让", "元让"] },
  { canonicalName: "夏侯渊", aliases: ["夏侯妙才", "妙才"] },
  { canonicalName: "荀彧",   aliases: ["荀文若", "文若"] },
  { canonicalName: "荀攸",   aliases: ["荀公达", "公达"] },
  { canonicalName: "郭嘉",   aliases: ["郭奉孝", "奉孝"] },
  { canonicalName: "许褚",   aliases: ["许仲康", "仲康", "虎侯", "虎痴"] },
  { canonicalName: "典韦",   aliases: ["古之恶来"] },
  { canonicalName: "张辽",   aliases: ["张文远", "文远"] },
  { canonicalName: "徐晃",   aliases: ["徐公明", "公明"] },
  { canonicalName: "张郃",   aliases: ["张儁乂", "儁乂"] },
  { canonicalName: "贾诩",   aliases: ["贾文和", "文和"] },
  { canonicalName: "程昱",   aliases: ["程仲德", "仲德"] },

  // 东吴
  { canonicalName: "孙权",   aliases: ["孙仲谋", "仲谋", "吴侯", "大帝", "吴大帝"] },
  { canonicalName: "孙坚",   aliases: ["孙文台", "文台"] },
  { canonicalName: "孙策",   aliases: ["孙伯符", "伯符", "小霸王"] },
  { canonicalName: "周瑜",   aliases: ["周公瑾", "公瑾", "周郎", "大都督"] },
  { canonicalName: "鲁肃",   aliases: ["鲁子敬", "子敬"] },
  { canonicalName: "吕蒙",   aliases: ["吕子明", "子明"] },
  { canonicalName: "陆逊",   aliases: ["陆伯言", "伯言"] },
  { canonicalName: "黄盖",   aliases: ["黄公覆", "公覆"] },
  { canonicalName: "甘宁",   aliases: ["甘兴霸", "兴霸", "锦帆贼"] },
  { canonicalName: "太史慈", aliases: ["太史子义", "子义"] },

  // 其他
  { canonicalName: "吕布",   aliases: ["吕奉先", "奉先", "温侯", "飞将"] },
  { canonicalName: "董卓",   aliases: ["董仲颖", "仲颖", "董太师"] },
  { canonicalName: "袁绍",   aliases: ["袁本初", "本初"] },
  { canonicalName: "袁术",   aliases: ["袁公路", "公路"] },
  { canonicalName: "刘表",   aliases: ["刘景升", "景升"] },
  { canonicalName: "貂蝉",   aliases: [] }
];

// ---------------------------------------------------------------------------
// 水浒传 — 绰号体系（一百零八将中最核心的人物）
// ---------------------------------------------------------------------------

const SHUIHU_NAMES: ClassicalNameEntry[] = [
  { canonicalName: "宋江",   aliases: ["及时雨", "呼保义", "孝义黑三郎", "宋公明", "宋押司"] },
  { canonicalName: "吴用",   aliases: ["智多星", "吴学究", "加亮先生"] },
  { canonicalName: "林冲",   aliases: ["豹子头", "林教头", "八十万禁军教头"] },
  { canonicalName: "鲁智深", aliases: ["花和尚", "鲁达", "鲁提辖"] },
  { canonicalName: "武松",   aliases: ["行者", "武二郎", "武都头", "打虎武松"] },
  { canonicalName: "李逵",   aliases: ["黑旋风", "铁牛"] },
  { canonicalName: "卢俊义", aliases: ["玉麒麟", "卢员外"] },
  { canonicalName: "公孙胜", aliases: ["入云龙", "一清道人"] },
  { canonicalName: "柴进",   aliases: ["小旋风", "柴大官人"] },
  { canonicalName: "花荣",   aliases: ["小李广"] },
  { canonicalName: "晁盖",   aliases: ["托塔天王", "晁天王", "晁保正"] },
  { canonicalName: "杨志",   aliases: ["青面兽", "杨制使"] },
  { canonicalName: "张顺",   aliases: ["浪里白条"] },
  { canonicalName: "石秀",   aliases: ["拼命三郎"] },
  { canonicalName: "燕青",   aliases: ["浪子", "小乙"] },
  { canonicalName: "时迁",   aliases: ["鼓上蚤"] },
  { canonicalName: "戴宗",   aliases: ["神行太保"] },
  { canonicalName: "阮小二", aliases: ["立地太岁"] },
  { canonicalName: "阮小五", aliases: ["短命二郎"] },
  { canonicalName: "阮小七", aliases: ["活阎罗"] },
  { canonicalName: "秦明",   aliases: ["霹雳火"] },
  { canonicalName: "关胜",   aliases: ["大刀"] },
  { canonicalName: "呼延灼", aliases: ["双鞭"] },
  { canonicalName: "董平",   aliases: ["双枪将"] },
  { canonicalName: "张清",   aliases: ["没羽箭"] },
  { canonicalName: "孙立",   aliases: ["病尉迟"] },
  { canonicalName: "史进",   aliases: ["九纹龙", "史大郎"] },
  { canonicalName: "杨雄",   aliases: ["病关索"] },
  { canonicalName: "解珍",   aliases: ["两头蛇"] },
  { canonicalName: "解宝",   aliases: ["双尾蝎"] }
];

// ---------------------------------------------------------------------------
// 西游记 — 法号/本相/尊称体系
// ---------------------------------------------------------------------------

const XIYOU_NAMES: ClassicalNameEntry[] = [
  { canonicalName: "孙悟空", aliases: ["美猴王", "齐天大圣", "大圣", "行者", "孙行者", "斗战胜佛", "弼马温", "石猴"] },
  { canonicalName: "唐僧",   aliases: ["唐三藏", "三藏", "三藏法师", "玄奘", "金蝉子", "御弟", "长老", "圣僧"] },
  { canonicalName: "猪八戒", aliases: ["猪悟能", "悟能", "天蓬元帅", "呆子", "八戒", "净坛使者"] },
  { canonicalName: "沙僧",   aliases: ["沙悟净", "悟净", "沙和尚", "卷帘大将", "金身罗汉"] },
  { canonicalName: "白龙马", aliases: ["小白龙", "玉龙三太子", "八部天龙"] },
  { canonicalName: "观音菩萨", aliases: ["观音", "观世音", "南海观音", "菩萨"] },
  { canonicalName: "如来佛祖", aliases: ["如来", "佛祖", "释迦牟尼"] },
  { canonicalName: "太上老君", aliases: ["老君", "太上道祖"] },
  { canonicalName: "玉皇大帝", aliases: ["玉帝", "天帝", "昊天上帝"] },
  { canonicalName: "牛魔王", aliases: ["大力牛魔王", "平天大圣"] },
  { canonicalName: "铁扇公主", aliases: ["罗刹女", "铁扇仙"] },
  { canonicalName: "红孩儿", aliases: ["圣婴大王", "善财童子"] },
  { canonicalName: "哪吒",   aliases: ["哪吒三太子", "三太子"] },
  { canonicalName: "二郎神", aliases: ["杨戬", "灌江口二郎", "显圣真君"] },
  { canonicalName: "托塔天王", aliases: ["李靖", "李天王"] }
];

// ---------------------------------------------------------------------------
// 红楼梦 — 辈分称呼/丫鬟名/别名体系
// ---------------------------------------------------------------------------

const HONGLOU_NAMES: ClassicalNameEntry[] = [
  { canonicalName: "贾宝玉", aliases: ["宝玉", "宝二爷", "绛洞花主", "怡红公子", "混世魔王", "神瑛侍者"] },
  { canonicalName: "林黛玉", aliases: ["黛玉", "林姑娘", "林妹妹", "颦儿", "潇湘妃子", "绛珠仙草"] },
  { canonicalName: "薛宝钗", aliases: ["宝钗", "薛姑娘", "宝姐姐", "蘅芜君"] },
  { canonicalName: "王熙凤", aliases: ["凤姐", "凤姐儿", "凤辣子", "琏二奶奶", "熙凤"] },
  { canonicalName: "贾母",   aliases: ["老太太", "老祖宗", "史太君"] },
  { canonicalName: "贾政",   aliases: ["政老爷", "贾存周"] },
  { canonicalName: "贾琏",   aliases: ["琏二爷", "琏儿"] },
  { canonicalName: "贾赦",   aliases: ["赦老爷", "贾恩侯"] },
  { canonicalName: "王夫人", aliases: ["二太太"] },
  { canonicalName: "邢夫人", aliases: ["大太太"] },
  { canonicalName: "李纨",   aliases: ["珠大奶奶", "稻香老农"] },
  { canonicalName: "贾探春", aliases: ["探春", "三姑娘", "蕉下客"] },
  { canonicalName: "贾惜春", aliases: ["惜春", "四姑娘"] },
  { canonicalName: "贾迎春", aliases: ["迎春", "二姑娘"] },
  { canonicalName: "史湘云", aliases: ["湘云", "云妹妹", "枕霞旧友"] },
  { canonicalName: "妙玉",   aliases: [] },
  { canonicalName: "花袭人", aliases: ["袭人", "花珍珠"] },
  { canonicalName: "晴雯",   aliases: [] },
  { canonicalName: "紫鹃",   aliases: ["鹦哥"] },
  { canonicalName: "平儿",   aliases: [] },
  { canonicalName: "鸳鸯",   aliases: [] },
  { canonicalName: "刘姥姥", aliases: ["刘老老"] },
  { canonicalName: "薛蟠",   aliases: ["薛大傻子", "薛大爷", "呆霸王"] },
  { canonicalName: "贾珍",   aliases: ["珍大爷"] },
  { canonicalName: "贾蓉",   aliases: ["蓉哥儿"] },
  { canonicalName: "秦可卿", aliases: ["可卿", "蓉大奶奶", "兼美"] }
];

// ---------------------------------------------------------------------------
// 儒林外史 — 核心人物别名（官衔/称谓/敬称）
// ---------------------------------------------------------------------------

const RULIN_NAMES: ClassicalNameEntry[] = [
  { canonicalName: "范进",   aliases: ["范举人", "范老爷", "范学道", "范进士"] },
  { canonicalName: "周进",   aliases: ["周学道", "周老爷", "周太爷"] },
  { canonicalName: "严监生", aliases: ["严致和", "严二老爷"] },
  { canonicalName: "严贡生", aliases: ["严致中", "严大老爷", "严大先生"] },
  { canonicalName: "杜少卿", aliases: ["杜仪"] },
  { canonicalName: "匡超人", aliases: ["匡迥", "匡二"] },
  { canonicalName: "胡屠户", aliases: ["胡老爹", "老丈"] },
  { canonicalName: "王惠",   aliases: ["王太守", "王老爷"] },
  { canonicalName: "娄三公子", aliases: ["娄琫"] },
  { canonicalName: "娄四公子", aliases: ["娄瓒"] },
  { canonicalName: "鲁编修", aliases: ["鲁小姐之父"] },
  { canonicalName: "马二先生", aliases: ["马纯上"] },
  { canonicalName: "蘧公孙", aliases: ["蘧駪夫"] },
  { canonicalName: "牛布衣", aliases: ["牛浦郎"] },
  { canonicalName: "杜慎卿", aliases: ["杜少卿之兄"] },
  { canonicalName: "沈琼枝", aliases: [] },
  { canonicalName: "庄绍光", aliases: ["庄征君"] },
  { canonicalName: "虞博士", aliases: ["虞育德"] },
  { canonicalName: "迟衡山", aliases: [] },
  { canonicalName: "萧云仙", aliases: [] }
];

// ---------------------------------------------------------------------------
// 汇总：按体裁分组的完整知识库
// ---------------------------------------------------------------------------

/**
 * 体裁 → 字号知识库映射。
 * key 对应 GENRE_PRESETS 中的体裁键名。
 *
 * 使用方式：
 * 1. 根据书籍 genre 选取对应知识库；
 * 2. 在 GlobalEntityResolver 规则预分组阶段，将知识库中的已知映射直接合并，
 *    避免 LLM 消歧时因缺乏上下文而拆分已知的字号/绰号。
 */
export const GENRE_CLASSICAL_NAMES: Record<string, ClassicalNameEntry[]> = {
  历史演义: SANGUO_NAMES,
  英雄传奇: SHUIHU_NAMES,
  神魔小说: XIYOU_NAMES,
  家族世情: HONGLOU_NAMES,
  明清官场: RULIN_NAMES
};

/**
 * 将知识库条目展平为"别名 → 标准名"的查找表。
 * 用于 GlobalEntityResolver 在 Union-Find 分组前做快速预合并。
 *
 * @param genre 体裁键名，对应 GENRE_CLASSICAL_NAMES 中的 key。
 * @returns Map<normalizedAlias, canonicalName>，未命中体裁时返回空 Map。
 */
export function buildAliasLookup(genre: string | null | undefined): Map<string, string> {
  const lookup = new Map<string, string>();
  if (!genre) return lookup;

  const entries = GENRE_CLASSICAL_NAMES[genre];
  if (!entries) return lookup;

  for (const entry of entries) {
    const canonical = entry.canonicalName.trim().toLowerCase();
    lookup.set(canonical, entry.canonicalName);
    for (const alias of entry.aliases) {
      const key = alias.trim().toLowerCase();
      if (key) {
        lookup.set(key, entry.canonicalName);
      }
    }
  }

  return lookup;
}

/**
 * 通过知识库判断两个名字是否属于同一人物。
 * @returns 如果属于同一人返回标准名；否则返回 null。
 */
export function resolveByKnowledgeBase(
  nameA: string,
  nameB: string,
  aliasLookup: Map<string, string>
): string | null {
  if (aliasLookup.size === 0) return null;

  const canonA = aliasLookup.get(nameA.trim().toLowerCase());
  const canonB = aliasLookup.get(nameB.trim().toLowerCase());

  if (canonA && canonB && canonA === canonB) {
    return canonA;
  }

  return null;
}
