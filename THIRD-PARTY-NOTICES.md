# 第三方组件与许可声明

本项目（opencode chat）是个人自用的第三方图形前端，**非官方项目**，与
[opencode](https://github.com/sst/opencode) 及其开发团队无隶属或官方关联。
以下列出本项目分发、调用或内置的第三方组件及其许可。各组件版权归其各自作者所有。

## 一、随本仓库源码分发的组件

| 组件 | 版本 | 许可 | 说明 |
| --- | --- | --- | --- |
| [marked](https://github.com/markedjs/marked) | 15.0.12 | MIT | `static/vendor/marked.min.js`，Markdown 渲染 |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 3.1.6 | Apache-2.0 或 MPL-2.0 | `static/vendor/purify.min.js`，HTML 净化 |
| [KaTeX](https://github.com/KaTeX/KaTeX) | 0.16.11 | MIT | `static/vendor/katex.*` 与 `static/vendor/fonts/`，数学公式渲染 |
| [highlight.js](https://github.com/highlightjs/highlight.js) | - | BSD-3-Clause | `static/vendor/highlight.min.js`、`highlight-github-dark.min.css`，代码高亮 |

> 上述文件的许可证头信息保留在对应文件内。若需分发二进制版本，请一并保留这些声明。

## 二、运行时获取的组件（不随本仓库提交）

| 组件 | 许可 | 说明 |
| --- | --- | --- |
| [opencode](https://github.com/sst/opencode) | MIT | 本程序运行时从 npm 源下载其平台二进制；版权归 SST 及贡献者所有 |
| [Python embeddable](https://www.python.org/) | PSF-2.0 | `release/build.ps1` 在打包时下载，随发布包分发（不随仓库提交）；版权归 Python Software Foundation |

## 三、仅构建期使用的工具

| 组件 | 许可 | 说明 |
| --- | --- | --- |
| [rcedit](https://github.com/electron/rcedit) | MIT | `tools/rcedit-x64.exe`（已被 `.gitignore` 忽略），用于写入 exe 版本信息 |

## 四、上游项目与商标

- “opencode” 是上游开源项目的名称，相关名称与商标归其各自所有者。
- 本项目名称中的 “opencode” 仅用于说明其作为该工具前端的用途，不表示任何官方认可或关联。
- 若你是上游项目方并认为本项目的命名或说明不当，请通过仓库 Issue 联系，作者将配合调整。
