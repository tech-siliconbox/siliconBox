---
title: "Lesson title"
slug: lesson-slug
order: 1
preview: false      # true makes this a free public preview lesson
duration_minutes: 10
---

<!-- Blocks: heading, paragraph, code, assertion, callout, diagram -->

## What you will do

One paragraph.

```systemverilog
// code block
```

:::assertion
assert property (@(posedge clk) req |-> ##[1:3] ack);
:::

:::callout
A short tip or warning.
:::

:::diagram
<svg viewBox="0 0 400 120" role="img" aria-label="Describe the diagram"></svg>
:::
