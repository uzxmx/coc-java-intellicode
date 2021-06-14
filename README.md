# coc-java-intellicode

An extension for [coc.nvim](https://github.com/neoclide/coc.nvim) to provide
AI-assisted development features for the
[jdt.ls](https://github.com/eclipse/eclipse.jdt.ls) language server that is
loaded by [coc-java](https://github.com/neoclide/coc-java). This extension uses
the jar and model file from
[Visual Studio IntelliCode](https://marketplace.visualstudio.com/items?itemName=VisualStudioExptTeam.vscodeintellicode&ssr=false#overview).

## Prerequisites

You must have [coc-java](https://github.com/neoclide/coc-java) installed first
and the Java language server is working properly.

```
:CocInstall coc-java
```

## Installation

Run below command in vim.

```
:CocInstall coc-java-intellicode
```

For the first time, it will download dependencies from
[Visual Studio IntelliCode](https://marketplace.visualstudio.com/items?itemName=VisualStudioExptTeam.vscodeintellicode&ssr=false#overview).

## How to use

Once this extension is enabled, you will get completion as you did before in
coc.nvim.

## Available commands

The following commands are available:

* `java.intellicode.download [version]`: download the default (or specific)
  version of the [Visual Studio
  IntelliCode](https://marketplace.visualstudio.com/items?itemName=VisualStudioExptTeam.vscodeintellicode&ssr=false#overview)
  extension.

## License

[MIT License](LICENSE)
