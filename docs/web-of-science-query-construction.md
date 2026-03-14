# Web of Science 检索式构建详解

本文聚焦 Web of Science `Advanced Search Query Builder` 及其直接关联的官方帮助页，整理检索式构建所需的完整规则。写作时点为 2026-03-14；其中字段标签部分以 `Web of Science Core Collection` 为例，因为 Web of Science 的字段标签会随具体数据库集合变化。

## 1. 页面定位

- `Advanced Search Query Builder` 的核心不是自然语言搜索，而是用 `字段标签(field tags) + 检索词 + 运算符 + 括号` 构造可控的高级检索式。
- Query Builder 页面明确提示：
  - `Exact Search` 默认关闭。
  - 默认状态下系统会执行词形还原和词干扩展。
  - 使用字段标签时，必须正确使用布尔逻辑与括号。
- 若要完整理解语法，必须结合以下官方页一起看：
  - `Advanced Search Query Builder`
  - `Search Rules`
  - `Search Operators`
  - 具体数据库的 `Advanced Search Field Tags`

## 2. 检索式的基本骨架

Web of Science 高级检索最常见的写法是：

```text
FIELD_TAG=(query expression)
```

常见示例：

```text
TS=(climate change)
TI=("machine learning")
TS=((heart OR cardiac) NEAR/3 failure)
TS=(graphene) AND PY=2024
```

一个完整检索式通常由以下部件组成：

- 字段标签：如 `TS`、`TI`、`AB`、`AU`
- 普通词：如 `mouse`
- 短语：如 `"soil drainage"`
- 通配/截词：如 `color*`、`flavo$r`、`wom?n`
- 布尔运算：`AND`、`OR`、`NOT`
- 邻近运算：`NEAR/x`
- 地址同址运算：`SAME`
- 括号：用于控制优先级和分组

## 3. 字段标签体系

### 3.1 通用原则

- 字段标签不是全平台完全通用的固定表，而是和当前检索的数据库集合绑定。
- Query Builder 中的 `View field tags` 会展示当前集合支持的标签。
- 因此写检索式时，不能把某个集合的字段表直接当成所有 Web of Science 数据库都适用的语法表。

### 3.2 Core Collection 常见字段标签

以下是 `Web of Science Core Collection` 常见字段标签，足以覆盖绝大多数系统综述和主题检索场景：

- `TS=` Topic
  - 覆盖题名、摘要、作者关键词、Keywords Plus
- `TI=` Title
- `AB=` Abstract
- `AK=` Author Keywords
- `ALL=` All Fields
- `AU=` Author
- `AI=` Author Identifiers
  - 如 ORCID、ResearcherID
- `AD=` Address
- `OG=` Organization-Enhanced
- `OO=` Organization
- `SO=` Publication Name
- `DO=` DOI
- `PMID=` PubMed ID
- `PY=` Year Published
- `DOP=` Date of Publication
- `SU=` Research Area
- `WC=` Web of Science Category
- `UT=` Accession Number

### 3.3 字段写法示例

```text
TS=graphene
TS=(graphene OR "carbon nanotube*")
AU=(De Marco* OR DeMarco*)
TS=cell growth AND PY=2007
TS=cell growth AND PY=(2008-2010)
DOP=2020-01-01/2020-03-01
```

### 3.4 字段使用注意点

- `PY=` 不能单独作为一个独立查询存在，必须与其他字段通过 `AND` 或 `NOT` 组合。
- `ALL=` 在 Core Collection 中不包含 `FD=Funding Details`。
- 作者姓氏中如果包含空格，官方建议把“有空格”和“无空格”两种形式都写进去。
  - 示例：`AU=(De Marco* OR DeMarco*)`

## 4. 运算符与优先级

### 4.1 支持的运算符

- `AND`
- `OR`
- `NOT`
- `NEAR/x`
- `SAME`

### 4.2 隐式逻辑

- 在多数文本字段中，相邻词默认按 `AND` 处理。
  - 例如：`rainbow trout fish farm` 等价于 `rainbow AND trout AND fish AND farm`
- 但有两个重要例外：
  - 中文和韩文查询不适用这种默认隐式 `AND`
  - `DOI`、`PMID`、`UT` 这类标识字段中，相邻值默认按 `OR` 处理

### 4.3 优先级

官方给出的执行顺序是：

1. `NEAR/x`
2. `SAME`
3. `NOT`
4. `AND`
5. `OR`

所以：

```text
influenza OR flu AND avian
```

与：

```text
(influenza OR flu) AND avian
```

并不等价。多概念检索不应依赖默认优先级，而应强制加括号。

## 5. Exact Search、短语、截词与邻近

### 5.1 Exact Search

- Query Builder 中 `Exact Search` 默认关闭。
- 关闭时，系统会进行词形还原和词干扩展。
  - 例如输入 `mouse` 时，系统可能同时检到 `mouse` 和 `mice`
  - 输入 `color` 时，系统可能扩展到 `colour`
- 开启 `Exact Search` 后，系统只匹配输入的精确词项。
- 如果需要检索精确短语，即使启用了 `Exact Search`，仍应使用双引号。

### 5.2 短语检索

- 用双引号包裹短语：

```text
"soil drainage"
```

- 引号会关闭默认的词形扩展和更宽泛的同义变体扩展。
- `"soil drainage"` 检索的是该短语本身，不等于 `drainage of soil`。

### 5.3 通配符与截词

Web of Science 支持三类通配符：

- `*`：匹配 0 个或多个字符
- `?`：匹配 1 个字符
- `$`：匹配 0 个或 1 个字符

示例：

```text
organi?ation*
flavo$r
wom?n
color* OR colour*
```

语义上分别可用于：

- 英美拼写变体
- 单复数或词尾变化
- 单字符变体

### 5.4 截词限制

- `All Fields` 中只支持右截词，不支持左截词。
- 对 `Title`、`Topic` 等常用字段：
  - 右截词时，通配符前至少需要 3 个字符
  - 左截词时，通配符后至少需要 3 个字符
- 合法/非法示例：

```text
oxid*      <- 合法
zeo*       <- 合法
ze*        <- 过短，不合法
*oxide     <- 在 All Fields 中不支持
*oxid*     <- 在 All Fields 中不支持
```

- 左截词支持情况并不一致：
  - `Topic`、`Title`、`Identifying Codes` 支持左截词
  - `Author`、`Cited Author` 不支持左截词

### 5.5 邻近检索

- `NEAR/x` 表示两个词最多相隔 `x` 个词。
- `NEAR` 不写距离时，默认等于 `NEAR/15`。
- `NEAR/0` 表示两词必须相邻。

示例：

```text
Beverage NEAR/5 bottle
TS=(Germany NEAR/10 "monetary union")
TS=(Germany NEAR/10 (monetary NEAR/0 union))
```

重要限制：

- 如果词本身就是 `near`，必须写成 `"near"`，否则会被识别为运算符。
- 在一个 `NEAR` 表达式内部，不能再把 `AND` 塞进同一层表达式中。
  - 例如 `TS=(Germany NEAR/10 (monetary AND union))` 是无效写法。

### 5.6 SAME

- `SAME` 仅用于地址字段，用于要求多个词出现在同一地址中。
- 典型写法：

```text
AD=(McGill Univ SAME Quebec SAME Canada)
```

## 6. 官方示例整理

### 6.1 扩展与精确

```text
mouse
"mouse"
```

- 前者默认可能检到 `mouse` 与 `mice`
- 后者只检索引号内的精确词面

### 6.2 字段标签组合

```text
TS=(...)
AU=(De Marco* OR DeMarco*)
TS=cell growth AND PY=2007
TS=cell growth AND PY=(2008-2010)
```

### 6.3 邻近与同址

```text
salmon NEAR virus
AD=(McGill Univ SAME Quebec SAME Canada)
```

### 6.4 通配与拼写变体

```text
color* OR colour*
flavo$r
Barthold?
```

### 6.5 名称和连字符

```text
AU=O Brien
AU=O'Brien
TS=hydro-power
TS=hydro*power
TS=hydro power
```

这些写法的结果范围并不完全相同，机构名、人名、连字符词都应视情况并列展开。

## 7. 限制与注意事项

### 7.1 官方未给出统一字符上限

- 当前官方帮助页没有给出统一的“整条查询最大字符数”说明。
- 因此在方法学文档中，最好写成：
  - `未见官方统一字符上限说明`

### 7.2 已明确给出的限制

- 在 Core Collection 的 `ALL/AF` 检索中，最多允许 `49` 个布尔或邻近运算符。
- 其他字段通常没有这个同样明确的全局上限描述。

### 7.3 其他高频踩坑点

- 通配符主要针对拉丁字母语言有效。
- 通配符不能紧跟在 `/ @ #` 和 `. , : ; !` 之后。
- 发表年不能用通配写法。
  - `200*` 不合法
- 含字面量星号的字符串不能依赖通配符命中。
  - 例如 `E*Trade`
- 过宽的左截词，尤其是编号字段中的左截词，可能导致结果不完整甚至无结果。
  - 例如 `UT=*2*`
- 左截词在某些场景下会关闭部分词形扩展，可能漏掉单复数。
- 机构名中如果本身含有 `AND`、`OR`、`NOT`、`NEAR`、`SAME` 等保留词，应加引号。
- `SAME` 不适用于 Korean Journal Database。

## 8. 实务建议

- Web of Science 默认会做词形还原和词干扩展，系统综述或高精度复核时，应明确决定是否启用 `Exact Search`、引号或更保守的字段限定。
- 多概念检索不要依赖默认优先级，应全部显式括号化。
- 字段标签必须写成“当前集合可用”的版本；迁移数据库集合时要重新核对 field tags。
- 当作者名、机构名、连字符词、拼写变体可能影响召回时，应并列写多个等价形式。

## 9. 官方来源

- Web of Science Advanced Search Query Builder  
  https://webofscience.zendesk.com/hc/en-us/articles/20130361503249-Advanced-Search-Query-Builder
- Web of Science Search Rules  
  https://webofscience.zendesk.com/hc/en-us/articles/25350084904721-Search-Rules
- Web of Science Search Operators  
  https://webofscience.zendesk.com/hc/en-us/articles/20016122409105-Search-Operators
- Web of Science Core Collection Advanced Search Field Tags  
  https://webofscience.zendesk.com/hc/en-us/articles/26916347018257-Web-of-Science-Core-Collection-Advanced-Search-Field-Tags
