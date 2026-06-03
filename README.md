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
| `zy-cli space share` | 设置空间公开分享 |
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
# ===== 空间管理 =====

# 新增空间
zy-cli space update --name "我的知识库" --type 2 --explain "个人笔记空间"

# 修改空间
zy-cli space update --id 21 --name "新名称"

# 设置空间发布到互联网
zy-cli space share --spaceId 21 --openDoc 1

# 设置空间密码访问
zy-cli space share --spaceId 21 --openDoc 1 --shareEnablePassword 1 --sharePassword abc123

# 添加空间成员（管理员）
zy-cli space member-add --spaceId 21 --userIds 1001,1002 --roleType 2

# 移除空间成员
zy-cli space member-remove --authId 56

# ===== 文档管理 =====

# 查看空间文档列表
zy-cli page list --spaceId 21

# 按关键词全局搜索文档
zy-cli page search --keywords 部署

# 搜索指定空间下的文档
zy-cli page search --spaceId 21 --keywords API 文档

# 获取文档详情（含完整内容）
zy-cli page detail --id 123

# 新增 Markdown 文档（通过文件传入内容）
zy-cli page update --spaceId 21 --name "新文档" --editorType 2 --file ./doc.md

# 修改文档
zy-cli page update --id 123 --spaceId 21 --name "修改后标题" --editorType 2 --editVersion 5 --content "# 新内容"

# 创建引用文档（指向其他文档，源文档更新时自动同步）
zy-cli page update --spaceId 21 --name "引用副本" --editorType 10 --quotePageId 456 --quoteSpaceId 22

# 上传本地文件到文档库（HTML 类型）
zy-cli page upload --spaceId 21 --file ./doc.md --editorType 1

# 上传表格文件
zy-cli page upload --spaceId 21 --file ./data.xlsx --editorType 9 --name "数据表"

# 删除文档到回收站
zy-cli page delete --pageId 123 --spaceId 21 --delFlag 1

# 从回收站彻底删除
zy-cli page delete --pageId 123 --spaceId 21 --delFlag 2

# 分享文档（公开）
zy-cli page share --id 123 --shareFlag 1 --shareIncludeChildren 1

# 分享文档（密码保护 + 有效期）
zy-cli page share --id 123 --shareFlag 1 --sharePassword pass123 --shareExpirationDate "2026-12-31 23:59:59"

# 取消分享
zy-cli page share --id 123 --shareFlag 0

# 复制文档到同空间其他目录
zy-cli page copy --pageId 123 --spaceId 21 --parentId 45

# 迁移文档到其他空间
zy-cli page move --pageId 123 --spaceId 22 --parentId 0

# 添加文档成员（协作者）
zy-cli page member-add --pageId 123 --userIds 1001 --roleType 5

# 移除文档成员
zy-cli page member-remove --authId 78

# ===== 通讯录 =====

# 按用户名搜索
zy-cli contact search-user --userName 张三

# 按邮箱搜索
zy-cli contact search-user --email zs@example.com

# 按账号搜索
zy-cli contact search-user --userNo zhangsan

# 搜索部门
zy-cli contact search-dept --name 技术部
```

## 注意事项

- 使用前必须通过 `zy-cli config init` 完成设备绑定
- 文档 ID、空间 ID 等可通过 `list` 命令获取
- 修改文档时 `editVersion` 需通过 `page detail` 获取当前版本号

## License

MIT
