# PubMed 检索式构建详解

本文基于 PubMed 官方 `Help / User Guide` 整理检索式构建规则，重点覆盖 Automatic Term Mapping、字段标签、短语、通配、邻近、作者/期刊/日期写法以及 Search Details 调试方法。写作时点为 2026-03-14。官方帮助页最近更新时间显示为 `March 11, 2026`。

## 1. 页面定位

PubMed 的检索逻辑和很多数据库不同。它不是一个“默认纯字面匹配”的系统，而是会对未加标签的输入执行大量自动翻译和扩展。构建高质量检索式时，首先要理解两个事实：

- 不加字段标签的检索，默认会进入 `Automatic Term Mapping`，简称 `ATM`
- 加字段标签、双引号短语、通配符、邻近等写法后，系统会关闭部分自动行为

与检索式构建直接相关的官方章节主要包括：

- `How PubMed works: Automatic Term Mapping (ATM)`
- `Searching for a phrase`
- `Wildcards and truncation`
- `Combining search terms with Boolean operators`
- `Using search field tags`
- `Proximity searching`
- `PubMed data field descriptions`

## 2. 默认检索机制：Automatic Term Mapping

### 2.1 ATM 的工作顺序

未加字段标签的词项会依次匹配：

1. `Subject translation table`
2. `Journals translation table`
3. `Author index`
4. `Investigator index`

一旦在某一级匹配成功，PubMed 就停止继续往下映射。

### 2.2 若完全没有命中映射

当查询无法命中上述映射表时，PubMed 会：

- 拆分短语
- 忽略 stopwords
- 把剩余词项用 `AND` 连接
- 在 `All Fields` 中继续检索

### 2.3 为什么 Search Details 很重要

PubMed 会把你的原始输入翻译成实际执行的检索式。要判断检索式是否被自动改写，最重要的官方入口是：

- `Advanced Search > History > Search Details`

这一步在系统综述、检索式复核和方法学复现中都很关键。

## 3. 字段标签体系

### 3.1 基本规则

- 字段标签写在方括号里：

```text
UCLA[ad]
```

- 字段标签会关闭 `ATM`
- 字段标签大小写不敏感
- 字段标签前的空格不影响含义
  - `crabs [mh]` 与 `Crabs[mh]` 等价

### 3.2 多词与字段标签

若多个词后面只跟一个字段标签，PubMed 会尝试把它当作一个短语或多词块处理：

```text
kidney allograft[tiab]
```

如果你想让每个词都分别限定到同一字段，写法应更明确：

```text
covid-19[ti] vaccine[ti] children[ti]
```

### 3.3 常用字段

#### All Fields

- `All Fields [all]`
- 未加标签的词与 `[all]` 都会走 `ATM`
- 对未映射的词项，系统会在大多数字段中检索，但不包含部分日期与元数据字段
- 双引号短语和带 `*` 的词不会走 `ATM`，而是在 all fields 中直接检索

#### 标题与摘要

- `Title [ti]`
- `Title/Abstract [tiab]`
- `Text Words [tw]`
  - 覆盖题名、摘要、MeSH 术语、subheadings、publication types、other terms 等多个文本域

#### 作者与机构

- `Author [au]`
- `Affiliation [ad]`

作者字段要点：

- 一般格式是“姓 + 空格 + 前 1-2 个首字母”
  - 例如：`fauci as[au]`
- 通常不写句点，也通常不需要逗号
- 作者字段默认自动截断，便于兼容不同 initials 和后缀
- 如果想关闭作者自动截断，应加双引号
  - 例如：`"smith j"[au]`
- 其他常见作者字段：
  - `1au`：首位作者
  - `lastau`：末位作者

#### 期刊

- `Journal [ta]`
- 可用期刊全名、缩写、ISSN 或 eISSN
- 含特殊字符的刊名应先去掉符号
- 如要关闭期刊自动映射，可用：

```text
"science"[ta]
```

#### 日期

- `Publication Date [dp]` 或 `[pdat]`
- `Electronic Date of Publication [epdat]`
- `Print Date of Publication [ppdat]`
- `Entry Date [edat]`
- `MeSH Date [mhda]`
- `Create Date [crdt]`

#### MeSH 与主题控制

- `MeSH Terms [mh]`
- `MeSH Major Topic [majr]`
- `MeSH Subheadings [sh]`

规则要点：

- `[mh]` 和 `[majr]` 下，entry term 也可映射到规范 MeSH
- MeSH 默认会向下扩展到更具体术语
- 若要关闭扩展，用：

```text
[mh:noexp]
```

- 副主题关闭自动扩展用：

```text
[sh:noexp]
```

- MeSH 和副主题可以直接连写：

```text
neoplasms/diet therapy
neoplasms/dh
```

### 3.4 其他高频字段

- `Publication Type [pt]`
- `Language [la]`
- `PMID [pmid]`
- `Subset [sb]`
- `Other Term [ot]`

## 4. 布尔逻辑与括号

### 4.1 支持的布尔运算

PubMed 支持：

- `AND`
- `OR`
- `NOT`

官方建议用大写。

### 4.2 默认 AND

如果不显式写布尔运算，PubMed 常会在概念之间自动应用 `AND`。

例如：

```text
vitamin c common cold
```

通常会按“多个概念同时成立”的方式解析。

### 4.3 处理顺序

- PubMed 按从左到右处理检索式
- 用括号控制逻辑分组

例如：

```text
(asthma OR wheeze) AND child*
```

比省略括号更安全。

### 4.4 History 集合

PubMed 支持用历史检索编号组合检索：

```text
#1 OR #2
```

其中：

- `#0` 代表 Clipboard

## 5. 短语检索

### 5.1 常见方式

PubMed 官方给出三类常见短语方式：

- 双引号：

```text
"kidney allograft"
```

- 字段标签：

```text
kidney allograft[tw]
```

- 连字符：

```text
kidney-allograft
```

### 5.2 短语与 ATM 的关系

- 短语检索会绕过 `ATM`
- 这意味着短语写法不会自动享受 MeSH 层级扩展

例如：

```text
"health planning"
```

不会自动覆盖其更具体下位主题词。

### 5.3 Phrase index 的重要限制

- 如果双引号短语不在 phrase index 中，双引号可能被忽略，系统回退为 `ATM`
- 系统会提示 `Quoted phrase not found in phrase index`
- 如果字段标签后的多词块不在 phrase index 中，该短语可能被拆成多个词处理
- 如果使用连字符强制短语，而该短语不在 phrase index 中，则可能没有结果

当长短语不能稳定命中 phrase index 时，可考虑用邻近检索来表达更精确的局部搭配关系。

## 6. 通配符与截词

### 6.1 基本规则

- PubMed 使用 `*` 表示 `0 个或多个字符`
- 首个 `*` 前至少需要 `4` 个字符
  - 例如：`colo*`
- 同一词中可以出现多个 `*`
  - 例如：`organi*ation*`

### 6.2 通配会关闭 ATM

一旦用到通配符，PubMed 不再对该词做 `ATM`。

这既能避免自动翻译干扰，也意味着你不能再依赖 MeSH 映射补齐同义项。

### 6.3 官方示例

```text
"vaccin* schedul*"
breast feed*[tiab]
breast-feed*
"tumo*r associated macrophage*"
```

## 7. 邻近检索

### 7.1 语法

PubMed 的邻近检索语法是：

```text
"search terms"[field:~N]
```

### 7.2 支持的字段

官方明确支持以下字段：

- `[ti]` / `[Title]`
- `[tiab]` / `[Title/Abstract]`
- `[ad]` / `[Affiliation]`

### 7.3 行为特征

- `N` 表示允许的最大间隔词数
- `N=0` 表示词必须相邻
- 词序不固定
- 邻近检索必须加双引号
- 邻近检索不执行 `ATM`
- 邻近检索与 wildcard 不兼容
  - 如果引号内部包含 `*`，邻近算符会被忽略

### 7.4 何时用短语，何时用邻近

- 若要求词序固定，应使用短语检索
- 若只要求词彼此靠近、但不要求固定顺序，可用邻近检索

### 7.5 机构字段的用途

在 `Affiliation` 字段中，较大的 `N` 值可帮助限定多个机构词仍落在同一 affiliation 内。

示例：

```text
"Hopkins Bloomberg Public"[ad:~45]
```

## 8. 作者、期刊、日期的专用写法

### 8.1 作者

```text
brody[au]
"smith j"[au]
just by[au] seizure
```

### 8.2 期刊

```text
gene therapy[ta]
"science"[ta]
```

### 8.3 日期

```text
cancer AND 2020/06/01[dp]
heart disease AND 2019/01/01:2019/06/30[dp]
influenza AND 2000:2010[dp]
"last 5 years"[dp]
```

需要特别注意：

- `[dp]` 是 publication date，但对 print/electronic 的处理有例外
- 做新增监测时，官方提示 `[crdt]` 常比 `[dp]` 更全面

## 9. 符号、字符和系统行为

PubMed 官方还说明了若干字符处理规则：

- `&` 会被当作 `AND`
- `|` 会被当作 `OR`
- `:` 用于范围
- `#1` 这类写法表示 History 集合
- 许多符号会被当作空格处理，包括 `- . , ; + ? _` 等

另外：

- PubMed 会忽略 stopwords
- 但在邻近检索的双引号内部，stopwords 和布尔词会作为普通词参与匹配

## 10. 限制与实务建议

- PubMed 默认会自动翻译查询，因此系统综述或高精度复检不能只看输入框里的原始文本，必须查看 `Search Details`。
- 字段标签、短语和通配都会关闭 `ATM`；这是控制系统行为的关键手段。
- 作者字段默认自动截断，能提高召回，但会降低精确性。
- 全名作者检索对 2002 年后的记录更可靠。
- 期刊名中若有括号、方括号、`&` 等符号，最好先去掉后再检索。
- `[mh]` 默认 explode，如需限制到当前 MeSH 层级，要显式写 `[mh:noexp]`。
- 邻近不是固定顺序匹配；固定词序必须回到短语检索。

## 11. 官方来源

- PubMed Help / User Guide  
  https://pubmed.ncbi.nlm.nih.gov/help/

建议重点查看同页中的以下章节：

- `How PubMed works: Automatic Term Mapping (ATM)`
- `Searching for a phrase`
- `Wildcards and truncation`
- `Combining search terms with Boolean operators`
- `Using search field tags`
- `Proximity searching`
- `PubMed data field descriptions`
