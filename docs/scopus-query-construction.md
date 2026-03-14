# Scopus 检索式构建详解

本文基于 Scopus/Elsevier 官方支持页整理检索式构建规则，聚焦高级检索语法、字段代码、邻近算符、短语检索和近年的解析器限制。写作时点为 2026-03-14。

## 1. 页面定位

- 用户给出的主页面 `How do I search in Scopus?` 更新日期为 `2025-06-03`，主要解释布尔逻辑、短语、邻近、通配符和检索行为。
- `How can I best use the Advanced search?` 更新日期为 `2024-08-15`，提供了更完整的高级检索字段代码表。
- `搜索提示：什么使 Scopus 搜索变得复杂？` 更新日期为 `2026-03-03`，补充了 2025 年夏季解析器更新后的一些失败模式和规避建议。

## 2. 基本语法骨架

Scopus 高级检索的基本结构是：

```text
FIELD_CODE(term expression)
```

如果不写字段代码，则默认等价于：

```text
ALL(term expression)
```

一个典型检索式通常由以下部件组成：

- 字段代码：如 `TITLE-ABS-KEY(...)`
- 布尔运算：`OR`、`AND`、`AND NOT`
- 邻近运算：`W/n`、`PRE/n`
- 松散短语：`"..."` 
- 精确短语：`{...}`
- 通配符：`*`、`?`
- 日期比较：`BEF`、`AFT`、`IS`

示例：

```text
TITLE-ABS-KEY(prion disease)
TITLE-ABS-KEY("heart attack")
TITLE-ABS-KEY({heart attack})
TITLE-ABS-KEY("Tidal Energy" OR ocean W/3 energy)
PUBYEAR AFT 2019
```

## 3. 字段代码体系

### 3.1 文本与主题字段

- `ALL(...)`
  - 默认字段
  - 覆盖 `ABS, AFFIL, ARTNUM, AUTH, AUTHCOLLAB, CHEM, CODEN, CONF, DOI, EDITOR, ISBN, ISSN, ISSUE, KEY, LANGUAGE, MANUFACTURER, PUBLISHER, PUBYEAR, REF, SEQBANK, SEQNUMBER, SRCTITLE, VOLUME, TITLE`
- `ABS(...)`
  - 摘要
- `TITLE(...)`
  - 标题
- `TITLE-ABS(...)`
  - 标题 + 摘要
- `TITLE-ABS-KEY(...)`
  - 标题 + 摘要 + 关键词
- `TITLE-ABS-KEY-AUTH(...)`
  - 标题 + 摘要 + 关键词 + 作者名

### 3.2 作者与机构字段

- `AUTH(...)`
  - 组合作者字段
- `AUTHFIRST(...)`
- `AUTHLASTNAME(...)`
- `AUTHOR-NAME(...)`
  - 检索单一作者名及其变体
- `AU-ID(...)`
  - Scopus Author Identifier
- `ORCID(...)`
  - ORCID，可写带或不带连字符的 16 位值
- `AFFIL(...)`
  - 组合机构字段，覆盖 `AFFILCITY, AFFILCOUNTRY, AFFILORG`
- `AFFILCITY(...)`
- `AFFILCOUNTRY(...)`
- `AFFILORG(...)`
- `AF-ID(...)`
  - 机构 ID

需要特别注意 `AUTHOR-NAME` 和 `AFFIL` 的作用域语义：

```text
AUTHOR-NAME(john AND smith)
```

表示同一个作者名实体中同时有 `john` 和 `smith`。

```text
AUTHOR-NAME(john) AND AUTHOR-NAME(smith)
```

则只要求同一篇记录中分别能命中，不要求是同一个作者名字符串。

类似地：

```text
AFFIL(london and hospital)
```

要求两个词出现在同一个 affiliation 条目中；而：

```text
AFFIL(london) AND AFFIL(hospital)
```

只要求它们出现在同一篇记录的机构信息里。

### 3.3 关键词、化学、生物与基金字段

- `AUTHKEY(...)`
  - 作者关键词
- `INDEXTERMS(...)`
  - 索引词
- `KEY(...)`
  - 组合关键词字段，覆盖 `AUTHKEY, INDEXTERMS, TRADENAME, CHEMNAME`
- `CHEM(...)`
  - 化学名称和 CAS 号组合字段
- `CHEMNAME(...)`
- `CASREGNUMBER(...)`
- `TRADENAME(...)`
- `MANUFACTURER(...)`
- `SEQBANK(...)`
- `SEQNUMBER(...)`
- `FUND-ALL(...)`
  - 组合基金字段，覆盖 `FUND-NO, FUND-ACR, FUND-SPONSOR` 以及致谢文本
- `FUND-SPONSOR(...)`
- `FUND-NO(...)`
- `FUND-ACR(...)`

### 3.4 来源、会议与标识字段

- `CONF(...)`
  - 会议综合字段
- `CONFNAME(...)`
- `CONFSPONSORS(...)`
- `CONFLOC(...)`
- `DOI(...)`
- `EID(...)`
- `PMID(...)`
- `ISSN(...)`
- `ISSNP(...)`
- `EISSN(...)`
- `ISBN(...)`
- `CODEN(...)`
- `SRCTITLE(...)`
- `EXACTSRCTITLE(...)`
  - 精确刊名或来源标题
- `SRCID(...)`
- `SRCTYPE(j|b|k|p)`
  - `j` 期刊，`b` 图书，`k` 丛书，`p` 会议录
- `DOCTYPE(...)`
  - 如 `ar, re, cp, cr, bk` 等
- `LANGUAGE(...)`
- `BOOKPUB(...)`

### 3.5 日期与参考文献字段

- `PUBYEAR`
  - 支持 `BEF`、`AFT`、`IS`
- `LOAD-DATE`
  - 格式 `YYYYMMDD`
  - 同样支持 `BEF`、`AFT`、`IS`
- `PUBDATETXT(...)`
  - 自由文本日期字段
- `REF(...)`
  - 组合参考文献字段，覆盖 `REFAUTH, REFTITLE, REFSRCTITLE, REFPUBYEAR, REFPAGE, WEBSITE`
- `REFAUTH(...)`
- `REFTITLE(...)`
- `REFSRCTITLE(...)`
- `REFPUBYEAR IS ...`
- `REFPAGE(...)`
- `WEBSITE(...)`

关键差异：

```text
REF(darwin 1859)
```

要求这些词出现在同一条参考文献中。

```text
REF(darwin) AND REF(1859)
```

只要求它们出现在同一篇父文献的参考文献区中，不要求属于同一条引文。

## 4. 布尔运算与优先级

### 4.1 支持的布尔逻辑

- `OR`
  - 任一命中即可
- `AND`
  - 必须同时命中
- `AND NOT`
  - 排除

官方特别提醒：`AND NOT` 最适合放在检索式末段。

### 4.2 优先级

Scopus 的优先级和很多数据库不同，官方页面明确说明：

- 仅布尔运算时：
  1. `OR`
  2. `AND`
  3. `AND NOT`
- 含邻近算符时：
  1. `OR`
  2. `W/n`、`PRE/n`
  3. `AND`
  4. `AND NOT`

这意味着 Scopus 不是“按从左到右顺序”执行，也不是很多人默认以为的“AND 高于 OR”。

例如：

```text
KEY(mouse AND NOT cat OR dog)
```

会被解释为：

```text
KEY((mouse) AND NOT (cat OR dog))
```

因此，多组概念并列时必须显式加括号。

## 5. 短语、精确匹配与邻近

### 5.1 双引号与花括号

Scopus 有两种常见短语方式：

- 双引号 `"..."`：松散短语检索
- 花括号 `{...}`：精确匹配

示例：

```text
TITLE-ABS-KEY("heart attack")
TITLE-ABS-KEY({heart attack})
```

差异点：

- `{heart-attack}` 与 `{heart attack}` 结果不同
- 在 `{...}` 中，空格、标点、停用词都按字面处理
- `{health care?}` 中的 `?` 会被当成普通字符，不是通配符

### 5.2 邻近算符

- `W/n`
  - 不要求顺序
  - 例：`journal W/2 publishing`
- `PRE/n`
  - 要求前词在后词之前
  - 例：`behavioral PRE/3 disturbances`

经验上：

- `0` 适合紧邻
- `15` 常被视作同句量级
- `50` 常被视作同段量级

例如：

```text
heart PRE/0 attack
```

语义上接近：

```text
"heart attack"
```

### 5.3 邻近表达式限制

- `W/n` 和 `PRE/n` 可与 `*`、`?` 联用
  - 例如：`TITLE-ABS-KEY(ship* PRE/0 channel)`
- 不能把包含 `AND` 或 `AND NOT` 的表达式直接塞入同一个邻近块中
  - `TITLE-ABS-KEY(bay PRE/6(ship* AND channel AND fish))` 无效
- 同一个表达式内：
  - 不能混用 `W/n` 和 `PRE/n`
  - 不能混用不同的 `n`
- 不同表达式之间可以混用，只要它们分成不同的括号块

保守写法示例：

```text
TITLE-ABS-KEY((b?y W/6 ship*) AND (ship* PRE/0 channel) AND NOT (channel W/0 isl*))
```

### 5.4 精确短语与邻近的近年限制

较新的官方补充页指出，一些“带空格的精确短语块 + 邻近算符”的写法在新解析器下可能失败。

例如这类写法不应默认安全：

```text
TITLE-ABS-KEY({nitrous oxide} W/2 emission*)
```

更稳妥的策略是：

- 单个精确词可与邻近共用
- 带空格的精确短语块，不要直接放在 `W/n` 或 `PRE/n` 一侧

## 6. 通配符、特殊字符与词形处理

### 6.1 通配符

- `*`：匹配 0 到多个字符
- `?`：匹配 1 个字符

可用于普通文本、作者名、机构名等，但要遵守限制。

### 6.2 明确不推荐或无效的写法

- 独立通配符
- 双向截词
  - `*daylight*`
- 与点、斜杠、连字符直接错误拼接的写法

较新的官方补充页明确指出以下写法可能失败：

```text
TITLE-ABS-KEY(5.0*)
FUND-ALL(izp-2021/1*)
TITLE-ABS-KEY(fire-*)
```

原因通常是：

- 点、斜杠、连字符会被当作分隔符
- `*` 被解析成独立通配符

### 6.3 标点、重音、拼写变体

- 字段代码大小写不敏感，但拼写必须准确，连字符也必须写对。
- 在松散检索中，多数标点会被忽略或标准化处理。
- 连字符与点经常会被处理成词间空格。
  - `heart-attack`
  - `heart.attack`
  - 两者通常会向 `"heart attack"` 靠拢
- 重音和常见字母变体可互通。
  - `España` 与 `Espana`
  - `alpha` 与 `α`

若确实要检索特殊字符本身，应使用花括号：

```text
{π}
```

### 6.4 词形还原和英美拼写

- Scopus 会在文本字段上做 stemming。
- 单数通常能召回单复数及所有格变体。
- 英美拼写通常会一起覆盖。
  - `anesthesia` 常可匹配 `anaesthesia`

## 7. 官方示例整理

```text
TITLE-ABS-KEY(prion disease)
INDEXTERMS(prion disease)
TITLE-ABS-KEY("heart attack")
TITLE-ABS-KEY({heart attack})
TITLE-ABS-KEY("Tidal Energy" OR ocean W/3 energy OR marine W/3 energy OR offshore W/3 energy)
AFFIL(london and hospital)
AFFIL(london) AND AFFIL(hospital)
AU-ID(100038831)
AF-ID(3000604)
REF(REFAUTH(darwin) AND REFSRCTITLE(species) AND REFPUBYEAR IS 1859)
PUBYEAR AFT 1994
LOAD-DATE AFT 20190107
SRCTYPE(j)
DOCTYPE(ar)
```

## 8. 限制与实务建议

- 官方没有给出硬性的统一字符上限，但建议每条查询大致控制在 `50` 个布尔运算符以内，以保证性能与稳定性。
- 大量 `OR`、常见高频词、过多 `*`、宽距离邻近和深层嵌套都可能导致超时或结果不稳定。
- 不要默认 Scopus 按左到右执行；所有多概念检索都应显式加括号。
- `REF(...)` 和 `AFFIL(...)` 都是带“局部作用域”的字段，字段块内部的多词常常意味着“在同一条 reference / affiliation 中同时出现”。
- 不要用单引号当短语界定符。
- 不要在词前直接写负号式排除；Scopus 不是这种命令式语法。
- 不要把带点、斜杠、连字符的字符串直接和通配符黏连。
- 遇到复杂检索报错时，官方建议先拆成多个简单括号块分别测试，再逐步合并。

## 9. 官方来源

- Scopus: How do I search in Scopus?  
  https://service.elsevier.com/app/answers/detail/a_id/34325/
- Scopus: How can I best use the Advanced search?  
  https://service.elsevier.com/app/answers/detail/a_id/11365/supporthub/mendeley/p/10524/
- Scopus 中文支持页：什么使 Scopus 搜索变得复杂？  
  https://cn.service.elsevier.com/app/answers/detail/a_id/16236/supporthub/scopus/

注：第二个补充页虽然 URL 路径中包含 `mendeley`，但正文内容是 Scopus Advanced Search 的官方帮助。
