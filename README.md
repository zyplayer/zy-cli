# zy-cli

zyplayer-doc 知识库命令行工具，用于在终端管理空间、文档和通讯录。

## 安装

```bash
npm install -g zyplayer
```

## 快速开始

```bash
# 1. 绑定设备到知识库
zy-cli config init

# 2. 查看空间列表
zy-cli space list

# 3. 搜索文档
zy-cli page search --keywords 部署指南
```

## 命令概览

```
zy-cli config <sub>     配置管理
zy-cli space <sub>      空间管理
zy-cli page <sub>       文档管理
zy-cli contact <sub>    通讯录
```

### config — 配置管理

| 命令 | 说明 |
|------|------|
| `zy-cli config init` | 设备码绑定，连接知识库服务 |
| `zy-cli config show` | 查看当前连接配置 |
| `zy-cli config clear` | 清除连接配置 |

### space — 空间管理

| 命令 | 说明 |
|------|------|
| `zy-cli space list` | 查看有权限的空间列表 |
| `zy-cli space update` | 新增或修改空间 |
| `zy-cli space member-list` | 查看空间成员 |
| `zy-cli space member-add` | 添加空间成员 |
| `zy-cli space member-remove` | 移除空间成员 |

### page — 文档管理

| 命令 | 说明 |
|------|------|
| `zy-cli page list` | 查看空间文档列表 |
| `zy-cli page search` | 全文搜索文档 |
| `zy-cli page detail` | 获取文档内容与详情 |
| `zy-cli page update` | 新增或修改文档 |
| `zy-cli page upload` | 上传文件到文档库 |
| `zy-cli page delete` | 删除文档 |
| `zy-cli page release` | 发布文档 |
| `zy-cli page share` | 分享文档 |
| `zy-cli page copy` | 复制文档到指定目录或空间 |
| `zy-cli page move` | 迁移文档到指定目录或空间 |
| `zy-cli page member-list` | 查看文档成员 |
| `zy-cli page member-add` | 添加文档成员 |
| `zy-cli page member-remove` | 移除文档成员 |

### contact — 通讯录

| 命令 | 说明 |
|------|------|
| `zy-cli contact search-user` | 按姓名/账号/邮箱/手机号搜索用户 |
| `zy-cli contact search-dept` | 按部门名模糊搜索部门 |

## 使用示例

```bash
# 按关键词全局搜索文档
zy-cli page search --keywords 部署

# 搜索指定空间下的文档
zy-cli page search --spaceId 21 --keywords API 文档

# 上传本地文件
zy-cli page upload --spaceId 21 --file ./doc.md --editorType 1

# 搜索用户
zy-cli contact search-user --userName 张三
zy-cli contact search-user --email zs@example.com

# 搜索部门
zy-cli contact search-dept --name 技术部

# 获取文档详情（含完整内容）
zy-cli page detail --id 123 --spaceId 21

# 新增文档
zy-cli page update --spaceId 21 --name "新文档" --editorType 2 --content "# 标题"

# 分享文档
zy-cli page share --id 123 --shareFlag 1 --shareIncludeChildren 1
```

## 注意事项

- 使用前必须通过 `zy-cli config init` 完成设备绑定
- 文档 ID、空间 ID 等可通过 `list` 命令获取
- 修改文档时 `editVersion` 需通过 `page detail` 获取当前版本号

## License

MIT
