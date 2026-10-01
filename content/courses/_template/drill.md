---
title: "Drill title"
slug: drill-slug
level: basic        # basic | intermediate | advance
topic: "safety properties"
top_module: top
mode: prove         # allow-listed by the server: bmc | prove | cover
solver: boolector   # allow-listed by the server
depth: 20           # must not exceed the cap for the level
timeout: 60         # seconds; must not exceed the cap for the level
---

## Task

What the learner must do.

## Starter code

```systemverilog
module top(input clk);
  // learner edits this
endmodule
```

<!-- PRIVATE: imported into drill_private, never shown -->

## Reference solution (private)

```systemverilog
module top(input clk);
endmodule
```

## Hidden properties (private)

```systemverilog
```

## Seeded-bug variants (private, each must FAIL)

### variant-1

```systemverilog
```

<!-- Publish gate: the reference must PASS and every variant must FAIL on the real solver. -->
