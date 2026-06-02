# zy-cli 开发文档

zyplayer-doc 知识库 CLI 工具，基于 Node.js + Commander。

---

## 目录结构

```
zy-cli/
├── bin/
│   └── cli.js              # 入口，shebang + 启动核心
├── src/
│   ├── core.js             # 核心框架：自动扫描 commands/ 并注册子命令
│   ├── commands/
│   │   ├── config.js       # zy-cli config —— 配置管理
│   │   ├── space.js        # zy-cli space —— 空间管理
│   │   ├── page.js         # zy-cli page —— 文档管理
│   │   └── contact.js      # zy-cli contact —— 通讯录
│   └── utils/
│       ├── api.js          # API 请求封装（签名、multipart）
│       ├── config.js       # 配置读写（AES-256-GCM 加密存储）
│       └── helpers.js      # 通用工具：buildParams / printResult / handleError
├── package.json
└── README.md
```

---

## 工作原理

```
npm install -g zyplayer
zy-cli config init
   │
   ├─ 1. npm 从 registry 下载 zyplayer 包
   ├─ 2. 读 package.json → "bin": { "zy-cli": "./bin/cli.js" }
   ├─ 3. 执行 ./bin/cli.js（#!/usr/bin/env node）
   └─ 4. Commander 解析参数，匹配到 config init，执行 action
```

包名 `zyplayer` 与命令名 `zy-cli` 是独立的——用户装的是 `npm install -g zyplayer`，敲的命令是 `zy-cli`。

---

## 一、本地开发

### 1. 安装依赖

```bash
cd doc-other/zy-cli
npm install
```

### 2. 本地调试（直接运行）

```bash
# 查看帮助
node bin/cli.js --help

# 查看版本
node bin/cli.js --version

# 执行命令
node bin/cli.js config show
node bin/cli.js space list
node bin/cli.js page search --keywords 测试
```

### 3. 本地调试（npm link）

`npm link` 会在全局注册 `zy-cli` 命令，指向当前源码目录，修改代码即时生效。

```bash
cd doc-other/zy-cli
npm link

# 之后就可以在任何目录直接用了
zy-cli --version
zy-cli config show

# 调试完毕，取消链接
npm unlink -g zyplayer
```

> **注意**：Windows 下 `npm link` 可能需要管理员权限的终端。

---

## 二、打包

### 本地打包测试（npm pack）

```bash
cd doc-other/zy-cli
npm pack
# 生成 zyplayer-2.6.6.tgz
```

解压看打包内容：

```bash
tar -tzf zyplayer-2.6.6.tgz
```

本地安装 `.tgz` 测试：

```bash
npm install -g ./zyplayer-2.6.6.tgz
zy-cli --version
```

> 打包范围由 `package.json` 的 `"files": ["bin/", "src/"]` 控制，`docs/` 目录不会被包含。

---

## 三、发布到 npm

### 1. 前置准备

使用命令 `npm config get registry` 查看当前源，如果不是 npmjs 则需要先切到官方源再登录：
npm config set registry https://registry.npmjs.org/

登录成功后再切回来：
npm config set registry https://registry.npmmirror.com/

```bash
# 注册 npm 账号（如果还没有）
# https://www.npmjs.com/signup
# 登录 npm
npm login
```

### 2. 发布前检查清单

| 检查项 | 说明 |
|--------|------|
| `package.json` 版本号 | 每次发布升版本（`npm version patch` / `minor` / `major`） |
| `bin/cli.js` 有 shebang | 第一行必须是 `#!/usr/bin/env node` |
| `npm login` 已登录 | `npm whoami` 确认 |
| 包名不冲突 | `npm view zyplayer` 检查 |
| 2FA 验证码 | 启用了双因子认证需带 `--otp=XXXXXX` |

### 3. 发布

```bash
# 小版本号自动 +1（2.6.6 → 2.6.7）
npm version patch

# 发布（首次发布公包需 --access public）
npm publish --access public

# 如有 2FA，需带一次性验证码
npm publish --access public --otp=XXXXXX
```

发布成功后，可在 [npmjs.com/package/zyplayer](https://www.npmjs.com/package/zyplayer) 看到。

---

## 四、用户安装使用

### 方式一：全局安装

```bash
npm install -g zyplayer
zy-cli config init
```

### 方式二：npx 免安装运行

```bash
npx zyplayer config init
```

`npx` 自动下载最新版、执行、然后清理，不污染全局环境。

### 方式三：指定版本

```bash
npx zyplayer@2.6.6 config init
```

---

## 五、命令开发指南

现有命令都使用子命令模式，例如 `zy-cli page search`。在 `src/commands/` 下新建文件即可，以 `contact.js` 为例：

```js
const { getConfig, request, buildParams, printResult, handleError } = require('../utils/helpers');

module.exports = function(program) {
    const cmd = program.command('contact').description('通讯录管理');

    cmd.command('search-user')
        .description('搜索用户')
        .option('--userName <userName>', '用户名（模糊搜索）')
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息'); return; }
            const params = buildParams(opts, ['userName']);
            try { printResult(await request(config, '/openApi/v1/user/search', params)); }
            catch (err) { handleError(err); }
        });
};
```

无需改任何其他文件——[core.js](../src/core.js) 启动时自动扫描 `commands/` 目录并注册。

### 工具函数

| 函数 | 说明 |
|------|------|
| `getConfig()` | 读取已保存的配置（url、token 等） |
| `request(config, path, params)` | POST JSON 请求，自动签名加密 |
| `uploadRequest(config, path, params, file)` | multipart 文件上传 |
| `buildParams(opts, fields, aliasMap)` | 从 commander opts 构建 API 参数，支持字段名映射 |
| `printResult(data, fields)` | 输出格式化 JSON，支持按字段过滤 |
| `handleError(err)` | 统一错误输出（连接失败、超时、HTTP 错误） |

更多：https://github.com/tj/commander.js

---

## 六、常见问题

### Q: npm publish 报 403 权限错误？

A: 包名可能已被占用。`npm view <包名>` 查看是否已存在。换包名或走 dispute 流程。

### Q: npm publish 报 "Two-factor authentication required"？

A: 账号开了 2FA，发布时需带 `--otp=XXXXXX`。

### Q: 本地 link 后改了代码没生效？

A: `npm link` 创建的是符号链接，改了源码即生效。如果没生效，检查是否装了多个版本 `npm ls -g zyplayer`。

### Q: npx 执行提示找不到命令？

A: `npx` 跟的是包名（`zyplayer`），不是命令名（`zy-cli`）。正确：`npx zyplayer config init`。

### Q: 怎么撤销某个版本的发布？

A: `npm unpublish zyplayer@2.6.6`（发布 72h 内）。超过 72h 需联系 npm 官方。
