# IEEE Xplore 检索式构建详解

本文基于 IEEE Xplore 官方帮助页整理检索式构建规则，重点覆盖 `Search Examples`、`Search Terms`、`Advanced search` 三页中与检索式语法直接相关的内容。写作时点为 2026-03-14。

## 1. 页面定位

IEEE Xplore 的检索式构建可以分成两个层面理解：

- 普通搜索与结果页搜索
  - 更偏向输入关键词或短语
- `Advanced Search`
  - 支持显式字段限定、布尔逻辑和邻近算符

官方帮助页中最有用的三页是：

- `Search Examples`
- `Search Terms`
- `Advanced search`

## 2. 基本语法骨架

IEEE Xplore 高级检索最典型的字段化写法是：

```text
"Field Name":term
"Field Name":"exact phrase"
("Field A":term1 OR "Field B":term2) AND "Field C":"phrase"
```

从官方示例可以直接看出两个关键语法点：

- 字段名本身写在双引号中
- 字段名与检索内容之间用冒号连接

示例：

```text
"Document Title":"global warming"
("Document Title":telemedicine OR "Index Terms":telemedicine)
("Author Keywords":RFID OR "Index Terms":RFID) AND "Publication Title":"IEEE Transactions on Consumer Electronics"
```

## 3. 可检索字段

根据 `Advanced search` 官方页，IEEE Xplore 在高级检索中支持按字段构造查询。页面列出的高频字段包括：

- `Document Title`
- `Abstract`
- `Author Keywords`
- `Index Terms`
- `Author`
- `Affiliation`
- `Publication Title`
- `DOI`
- `Publisher`

此外，普通结果页与 URL 也显示 `All Metadata` 是一个常用的默认搜索域。

因此，实际写法通常分为两类：

### 3.1 默认或宽域检索

```text
("All Metadata":machine learning)
```

### 3.2 字段化检索

```text
"Document Title":"global warming"
"Abstract":"wireless sensor network"
"Author Keywords":RFID
"Publication Title":"IEEE Transactions on Power Systems"
```

## 4. 布尔运算与括号

### 4.1 支持的布尔逻辑

`Search Terms` 官方页明确提到 IEEE Xplore 支持布尔逻辑：

- `AND`
- `OR`
- `NOT`

示例：

```text
("Document Title":telemedicine OR "Index Terms":telemedicine)
("Author Keywords":RFID OR "Index Terms":RFID) AND "Publication Title":"IEEE Transactions on Consumer Electronics"
```

### 4.2 括号的作用

当一个检索式中既有多组 `OR`，又有 `AND` 或字段组合时，必须使用括号明确逻辑分组。

例如：

```text
("Publication Title":"IEEE Transactions on Power Systems" OR "Publication Title":"IET Generation, Transmission and Distribution") AND "Index Terms":("power system" OR "electric power transmission")
```

这个例子说明：

- 同字段的多个来源标题可以用 `OR` 并列
- 多个主题词也可以在同一字段内并列
- 两大块概念之间再用 `AND` 连接

## 5. 短语检索

IEEE Xplore 官方示例中最常见的精确短语方式是：

```text
"Field Name":"exact phrase"
```

例如：

```text
"Document Title":"global warming"
"Publication Title":"IEEE Transactions on Consumer Electronics"
```

对多词概念，如果不加引号，系统更可能把它当作多个词项处理；如果希望按一个固定短语处理，应使用双引号。

## 6. 邻近检索

`Search Terms` 官方页明确说明，IEEE Xplore 在 `Advanced Search` 和 `command search` 中支持邻近运算：

- `NEAR/x`
- `ONEAR/x`

### 6.1 NEAR/x

- 表示两个词在一定距离内接近出现
- 不强调前后顺序

### 6.2 ONEAR/x

- 表示两个词在一定距离内接近出现
- 同时要求顺序约束，前词先于后词

### 6.3 语法示例

官方页给出的示例是：

```text
"molecular" NEAR/2 "biology"
```

语义上表示：

- 两个词彼此靠近
- 中间允许一定数量的间隔词

如果更关注词序，应优先考虑 `ONEAR/x`。

## 7. 通配符与截词

`Search Terms` 官方页给出两个基础通配符：

- `*`
  - 匹配 0 个或多个字符
- `?`
  - 匹配单个字符

官方用途说明包括：

- 当你不确定单复数时，用 `*`
- 当你不确定某一个字符时，用 `?`

示例：

```text
colo*r
flavo?r
comput*
```

其中：

- `*` 常用于词干扩展与复数扩展
- `?` 常用于单字符拼写变体

## 8. Search Examples 中的典型写法

### 8.1 单字段精确标题

```text
"Document Title":"global warming"
```

用于把检索限制在文献标题字段。

### 8.2 同一主题在不同字段并列

```text
("Document Title":telemedicine OR "Index Terms":telemedicine)
```

适合一个主题同时覆盖题名和受控索引词。

### 8.3 主题字段 + 来源标题字段

```text
("Author Keywords":RFID OR "Index Terms":RFID) AND "Publication Title":"IEEE Transactions on Consumer Electronics"
```

适合限定主题同时要求出现在特定期刊或来源中。

### 8.4 多来源标题 + 多主题词

```text
("Publication Title":"IEEE Transactions on Power Systems" OR "Publication Title":"IET Generation, Transmission and Distribution") AND "Index Terms":("power system" OR "electric power transmission")
```

适合做“指定来源集合 + 指定主题集合”的组合检索。

## 9. 构建检索式时的实务建议

- IEEE Xplore 的高级检索更适合写成“字段名 + 冒号 + 检索词”的显式结构，而不是把复杂逻辑完全丢给默认搜索。
- 多个概念并列时，应优先用括号而不是猜测系统默认优先级。
- 需要固定短语时，字段后的多词概念要加双引号。
- 需要模糊拼写或词尾扩展时，再使用 `*`、`?`。
- 需要表达“彼此靠近但不一定是固定短语”时，使用 `NEAR/x`；若还要控制顺序，则使用 `ONEAR/x`。
- 主题检索经常要把 `Document Title`、`Abstract`、`Author Keywords`、`Index Terms` 组合使用，而不是只靠 `All Metadata`。

## 10. 限制与注意事项

- IEEE 官方帮助页更偏向示例驱动，没有像部分数据库那样给出超长的“完整语法参考手册”；因此最稳妥的做法是以帮助页给出的字段名和示例格式为准。
- `Advanced Search` 中字段名本身就是语法的一部分，书写时应保持官方字段名。
- 邻近算符明确只在 `Advanced Search` 和 `command search` 中说明支持，不应假定普通搜索框完全等价。
- 若一个主题需要同时覆盖题名、摘要、关键词和索引词，建议拆成多个字段块再用布尔逻辑组合。

## 11. 官方来源

- IEEE Xplore Help: Search Examples  
  https://ieeexplore.ieee.org/Xplorehelp/searching-ieee-xplore/search-examples
- IEEE Xplore Help: Search Terms  
  https://ieeexplore.ieee.org/Xplorehelp/searching-ieee-xplore/search-terms
- IEEE Xplore Help: Advanced search  
  https://ieeexplore.ieee.org/Xplorehelp/searching-ieee-xplore/advanced-search
