const { getConfig, request, uploadRequest, buildParams, printResult, handleError, stripHtml } = require('../utils/helpers');

/**
 * zy-cli page —— 文档管理
 */
module.exports = function(program) {
    const cmd = program.command('page').description('空间文档管理');

    cmd.command('list')
        .description('查看文档列表')
        .option('--spaceId <spaceId>', '空间ID（必填）', Number)
        .action(async (opts) => {
            const config = getConfig();
            const fields = [
                'id', 'name', 'spaceId', 'spaceName', 'parentId', 'fullPath', 'editorType', 'canEdit', 'canCreate'
            ];
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.spaceId) { console.log('--spaceId 不能为空'); return; }
            const params = buildParams(opts, ['spaceId']);
            try { printResult(await request(config, '/openApi/v1/space/page/list', params), fields); }
            catch (err) { handleError(err); }
        });

    cmd.command('update')
        .description('新增或修改文档')
        .option('--id <id>', '文档ID，有值为修改，无值为新增', Number)
        .option('--spaceId <spaceId>', '空间ID（必填）', Number)
        .option('--name <name>', '文档名（必填）')
        .option('--parentId <parentId>', '父文档ID', Number)
        // 给cli用的这几种类型就够用了
        // 0=文件夹 1=HTML 2=Markdown 3=表格 4=大纲 5=原始文件 6=API 7=思维导图 8=drawio 9=univer表格 10=引用 11=Excalidraw 12=页面搭建
        .option('--editorType <editorType>', '编辑类型（必填） 0=文件夹 1=HTML 2=Markdown 10=引用文档', Number)
        .option('--editVersion <editVersion>', '编辑版本号（修改时必填，需通过 zy-cli page detail 获取）', Number)
        .option('--content <content>', '文档内容（简单内容可直接传入）')
        .option('--file <file>', '文档内容文件路径（推荐，支持多行内容）')
        .option('--quotePageId <quotePageId>', '引用源文档ID，创建引用文档（editorType=10）时使用', Number)
        .option('--quoteSpaceId <quoteSpaceId>', '引用源文档所在空间ID（与quotePageId配合使用）', Number)
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.spaceId || !opts.name) { console.log('--spaceId 和 --name 不能为空'); return; }
            // 读取内容：--file 优先，否则用 --content
            let content = '';
            if (opts.file) {
                try { content = require('fs').readFileSync(opts.file, 'utf-8'); }
                catch (e) { console.log('读取文件失败: ' + e.message); return; }
            } else if (opts.content !== undefined) {
                content = opts.content;
            }
            // 自动生成预览内容，不依赖外部传入
            let preview = content;
            if (opts.editorType === 1) {
                preview = stripHtml(content);
            }
            const params = buildParams(opts, ['id', 'name', 'spaceId', 'parentId', 'editorType', 'editVersion', 'quotePageId', 'quoteSpaceId']);
            params.content = content;
            params.preview = preview;
            try { printResult(await request(config, '/openApi/v1/space/page/update', params)); }
            catch (err) { handleError(err); }
        });

    cmd.command('upload')
        .description('上传文件的方式新建文档')
        .option('--spaceId <spaceId>', '空间ID（必填）', Number)
        .option('--file <file>', '文件路径（必填）')
        // 给cli用的这几种类型就够用了
        // 0=文件夹 1=HTML 2=Markdown 3=表格 4=大纲 5=原始文件 6=API 7=思维导图 8=drawio 9=univer表格 10=引用 11=Excalidraw 12=页面搭建
        .option('--editorType <editorType>', '文档类型（必填） 0=文件夹 1=HTML 2=Markdown 5=原始文件 9=表格', Number)
        .option('--name <name>', '文档名')
        .option('--parentId <parentId>', '父文档ID', Number)
        .option('--repeatAction <repeatAction>', '重复操作 1=仍然保存 2=增加后缀保存 3=跳过重名文件 4=覆盖保存', Number)
        .option('--autoUnzip <v>', '自动解压 0=否 1=是，上传zip文件时可选')
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.spaceId || !opts.editorType || !opts.file) { console.log('--spaceId、--editorType 和 --file 不能为空'); return; }
            const params = buildParams(opts, ['spaceId', 'name', 'parentId', 'editorType', 'repeatAction', 'autoUnzip']);
            try { printResult(await uploadRequest(config, '/openApi/v1/space/page/upload', params, opts.file)); }
            catch (err) { handleError(err); }
        });

    cmd.command('detail')
        .description('获取文档内容和详情')
        .option('--id <id>', '文档ID（必填）', Number)
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.id) { console.log('--id 不能为空'); return; }
            const params = buildParams(opts, ['id']);
            try { printResult(await request(config, '/openApi/v1/space/page/detail', params)); }
            catch (err) { handleError(err); }
        });

    cmd.command('delete')
        .description('删除文档')
        .option('--pageId <pageId>', '文档ID（必填）', Number)
        .option('--spaceId <spaceId>', '空间ID（必填）', Number)
        .option('--delFlag <delFlag>', '删除标记 1=移至回收站 2=从回收站删除（必填）', Number)
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.pageId || !opts.spaceId) { console.log('--pageId 和 --spaceId 不能为空'); return; }
            const params = buildParams(opts, ['pageId', 'spaceId', 'delFlag']);
            try { printResult(await request(config, '/openApi/v1/space/page/delete', params)); }
            catch (err) { handleError(err); }
        });

    cmd.command('share')
        .description('分享文档')
        .option('--id <id>', '文档ID（必填）', Number)
        .option('--shareFlag <shareFlag>', '是否公开分享 0=否 1=是（必填）', Number)
        .option('--shareIncludeChildren <v>', '分享包含子页面 0=否 1=是', Number)
        .option('--sharePassword <sharePassword>', '分享访问密码')
        .option('--shareExpirationDate <date>', '分享有效期，格式：yyyy-MM-dd HH:mm:ss，不填则永久有效')
        .option('--uuid <uuid>', '文件唯一ID，用于指定分享的链接路径')
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.id) { console.log('--id 不能为空'); return; }
            const params = buildParams(opts, ['id', 'shareFlag', 'shareIncludeChildren', 'sharePassword', 'shareExpirationDate', 'uuid']);
            try {
                const result = await request(config, '/openApi/v1/space/page/share', params);
                if (!opts.shareFlag) { printResult(result); return; }
                const uuid = result && result.data;
                if (!uuid) { console.log('分享失败，未获取到 uuid'); return; }
                const urlPath = opts.shareIncludeChildren ? '/#/docs/' + uuid : '/#/doc/' + uuid;
                console.log(config.url + urlPath);
            }
            catch (err) { handleError(err); }
        });

    cmd.command('search')
        .description('搜索文档')
        .option('--keywords <keywords>', '搜索关键词（必填）')
        .option('--spaceId <spaceId>', '空间ID（可选，不填则搜索所有有权限的空间）', Number)
        .option('--pageNum <pageNum>', '页码（默认值：1）', Number)
        .option('--fromName <v>', '是否搜索文档名 0=否 1=是（默认1）', Number)
        .option('--fromContent <v>', '是否搜索文档内容 0=否 1=是（默认1）', Number)
        .action(async (opts) => {
            const config = getConfig();
            const fields = [
                'pageId', 'pageTitle', 'previewContent', 'spaceId', 'spaceName', 'paragraphList'
            ];
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.keywords) { console.log('--keywords 不能为空'); return; }
            const params = buildParams(opts, ['spaceId', 'keywords', 'pageNum', 'fromName', 'fromContent']);
            params.markRed = false;
            let res = await request(config, '/openApi/v1/space/page/search', params);
            // 过滤 paragraphList 中每条记录的字段
            if (res && res.data && Array.isArray(res.data)) {
                // , 'startLine', 'endLine', 'startPos', 'endPos'
                const paraFields = ['content', 'keyword'];
                res.data = res.data.map(function(item) {
                    if (item.paragraphList && Array.isArray(item.paragraphList) && item.paragraphList.length > 0) {
                        item.previewContent = undefined;
                        item.paragraphList = item.paragraphList.map(function(p) {
                            let filtered = {};
                            paraFields.forEach(function(f) { if (p[f] !== undefined) filtered[f] = p[f]; });
                            return filtered;
                        });
                    }
                    return item;
                });
            }
            try { printResult(res, fields); }
            catch (err) { handleError(err); }
        });

    cmd.command('copy')
        .description('复制文档到指定目录或空间')
        .option('--pageId <pageId>', '源文档ID（必填）', Number)
        .option('--spaceId <spaceId>', '目标空间ID（必填）', Number)
        .option('--parentId <parentId>', '目标父文档ID', Number)
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.pageId || !opts.spaceId) { console.log('--pageId 和 --spaceId 不能为空'); return; }
            const params = buildParams(opts, ['pageId', 'spaceId', 'parentId']);
            params.copyType = 1;
            try { printResult(await request(config, '/openApi/v1/space/page/copyOrMove', params)); }
            catch (err) { handleError(err); }
        });

    cmd.command('move')
        .description('迁移文档到指定目录或空间')
        .option('--pageId <pageId>', '源文档ID（必填）', Number)
        .option('--spaceId <spaceId>', '目标空间ID（必填）', Number)
        .option('--parentId <parentId>', '目标父文档ID', Number)
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.pageId || !opts.spaceId) { console.log('--pageId 和 --spaceId 不能为空'); return; }
            const params = buildParams(opts, ['pageId', 'spaceId', 'parentId']);
            params.copyType = 2;
            try { printResult(await request(config, '/openApi/v1/space/page/copyOrMove', params)); }
            catch (err) { handleError(err); }
        });

    cmd.command('member-list')
        .description('查看文档成员列表')
        .option('--pageId <pageId>', '文档ID（必填）', Number)
        .option('--spaceId <spaceId>', '空间ID（必填）', Number)
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.pageId || !opts.spaceId) { console.log('--pageId 和 --spaceId 不能为空'); return; }
            const params = buildParams(opts, ['spaceId'], { moduleId: 'pageId' });
            params.moduleType = 2;
            try { printResult(await request(config, '/openApi/v1/spaceAuth/list', params)); }
            catch (err) { handleError(err); }
        });

    cmd.command('member-add')
        .description('添加文档成员')
        .option('--pageId <pageId>', '文档ID（必填）', Number)
        .option('--userIds <userIds>', '用户ID，多个逗号分隔')
        .option('--departmentIds <ids>', '部门ID，多个逗号分隔')
        .option('--roleType <roleType>', '角色 5=协作者 6=查看者（必填）', Number)
        .option('--includeChildren <v>', '是否包含子部门 0=否 1=是', Number)
        .option('--includeChildrenPage <v>', '是否包含子文档 0=否 1=是', Number)
        .option('--expirationTime <expirationTime>', '有效期限，格式：yyyy-MM-dd HH:mm:ss，不填则永久有效')
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.pageId || !opts.roleType) { console.log('--pageId 和 --roleType 不能为空'); return; }
            const params = buildParams(opts, ['userIds', 'departmentIds', 'pageId', 'roleType', 'includeChildren', 'includeChildrenPage', 'expirationTime']);
            try { printResult(await request(config, '/openApi/v1/spaceAuth/addPageAuth', params)); }
            catch (err) { handleError(err); }
        });

    cmd.command('member-remove')
        .description('移除文档成员')
        .option('--authId <authId>', '授权记录ID（必填，取 member-list 响应中的 id）', Number)
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.authId) { console.log('--authId 不能为空'); return; }
            const params = buildParams(opts, ['authId']);
            try { printResult(await request(config, '/openApi/v1/spaceAuth/delPageAuth', params)); }
            catch (err) { handleError(err); }
        });
};
