const { getConfig, request, uploadRequest, buildParams, printResult, handleError, stripHtml, extractImages, resolveImagePath, downloadRemoteImage, decodeDataUri, extractFileKey, batchCheckFiles, concurrentMap } = require('../utils/helpers');
const fs = require('fs');
const path = require('path');

/**
 * zy-cli page —— 文档管理
 */
module.exports = function(program) {
    const cmd = program.command('page').description('空间文档管理');

    cmd.command('list')
        .description('查看文档列表（树形展示）')
        .option('--spaceId <spaceId>', '空间ID（必填）', Number)
        .action(async (opts) => {
            const config = getConfig();
            const fields = [
                'id', 'name', 'spaceId', 'parentId', 'editorType', 'children'
            ];
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.spaceId) { console.log('--spaceId 不能为空'); return; }
            const params = buildParams(opts, ['spaceId']);
            try {
                const result = await request(config, '/openApi/v1/space/page/list', params);
                // 递归精简 children 字段
                result.data = filterChildren(result.data, fields);
                printResult(result, fields);
            }
            catch (err) { handleError(err); }
        });

    cmd.command('update')
        .description('新增或修改文档（适用于 HTML/Markdown/文件夹/引用文档等，内容中包含的图片将自动上传替换）')
        .option('--id <id>', '文档ID，有值为修改，无值为新增', Number)
        .option('--spaceId <spaceId>', '空间ID（必填）', Number)
        .option('--name <name>', '文档名（必填）')
        .option('--parentId <parentId>', '父文档ID', Number)
        // 给cli用的这几种类型就够用了
        // 0=文件夹 1=HTML 2=Markdown 3=表格 4=大纲 5=原始文件 6=API 7=思维导图 8=drawio 9=univer表格 10=引用 11=Excalidraw 12=页面搭建
        .option('--editorType <editorType>', '编辑类型（必填） 0=文件夹 1=HTML 2=Markdown 10=引用文档', Number)
        .option('--editVersion <editVersion>', '编辑版本号（修改时必填，需通过 zy-cli page detail 获取）', Number)
        .option('--file <file>', '文档内容的文件路径，为空则会清除文档原有内容（必填）')
        .option('--quotePageId <quotePageId>', '引用源文档ID，创建引用文档（editorType=10）时使用', Number)
        .option('--quoteSpaceId <quoteSpaceId>', '引用源文档所在空间ID（与quotePageId配合使用）', Number)
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.spaceId || !opts.name) { console.log('--spaceId 和 --name 不能为空'); return; }
            // 读取内容：--file 优先
            let content = '';
            let fileDir = null;
            if (opts.file) {
                try {
                    content = fs.readFileSync(opts.file, 'utf-8');
                    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
                    fileDir = path.dirname(path.resolve(opts.file));
                }
                catch (e) { console.log('读取文件失败: ' + e.message); return; }
            }
            // 如果有id参数且内容为空，则创建空文档用于后续上传图片
            if (opts.id && !content) {
                console.log('--file 参数或文件中的内容不能为空');
                return;
            }
            // 提取所有图片引用并批量检测已存在的
            const images = extractImages(content, opts.editorType);
            if (images.length > 0) {
                let pageId = opts.id;
                // 批量检测：提取远程+本地图片的文件标识（data URI 跳过）
                const fileKeys = images.filter(img => img.type !== 'data').map(img => extractFileKey(img.originalSrc));
                let existedSet = new Set();
                try { existedSet = await batchCheckFiles(config, fileKeys); }
                catch (err) { console.log('批量检测文件失败，将全部重新上传: ' + err.message); }
                // 过滤出需要上传的图片（已存在的跳过）
                const newImages = images.filter(img => {
                    const key = extractFileKey(img.originalSrc);
                    if (key && existedSet.has(key)) {
                        console.log('图片已存在，跳过上传: ' + img.originalSrc);
                        return false;
                    }
                    return true;
                });
                if (newImages.length > 0) {
                    // 没有文档ID时先新建空白文档获取ID
                    if (!pageId) {
                        console.log('内容包含新图片，先创建文档以获取上传目标...');
                        const createParams = buildParams(opts, ['name', 'spaceId', 'parentId', 'editorType', 'quotePageId', 'quoteSpaceId']);
                        createParams.content = '';
                        createParams.preview = '';
                        let createResult;
                        try { createResult = await request(config, '/openApi/v1/space/page/update', createParams); }
                        catch (err) { handleError(err); return; }
                        if (!createResult || createResult.errCode !== 200 || !createResult.data) {
                            console.log(createResult);
                            console.log('创建文档失败: ' + (createResult && createResult.errMsg || '未知错误'));
                            return;
                        }
                        pageId = createResult.data.id;
                        opts.editVersion = createResult.data.editVersion;
                        console.log('文档已创建, ID: ' + pageId);
                    }
                    // 第一步：本地+data 同步处理（不占并发位），远程图片并行下载
                    const localPrepared = [];
                    const dataPrepared = [];
                    for (const img of newImages) {
                        if (img.type === 'local') {
                            const fp = resolveImagePath(img.originalSrc, fileDir);
                            if (!fs.existsSync(fp)) {
                                console.log('本地图片不存在，跳过: ' + img.originalSrc);
                                continue;
                            }
                            localPrepared.push({ originalSrc: img.originalSrc, filePath: fp, isTemp: false });
                        } else if (img.type === 'data') {
                            try {
                                const fp = decodeDataUri(img.originalSrc);
                                dataPrepared.push({ originalSrc: img.originalSrc, filePath: fp, isTemp: true });
                            } catch (err) {
                                console.log('data URI 解码失败: ' + err.message);
                            }
                        }
                    }
                    const remotePrepared = (await concurrentMap(
                        newImages.filter(img => img.type === 'remote'),
                        async (img) => {
                            try {
                                const fp = await downloadRemoteImage(img.originalSrc);
                                return { originalSrc: img.originalSrc, filePath: fp, isTemp: true };
                            } catch (err) {
                                console.log('远程图片下载失败: ' + img.originalSrc + ' ' + err.message);
                                return null;
                            }
                        }, 5
                    )).filter(Boolean);
                    const prepared = [...localPrepared, ...dataPrepared, ...remotePrepared];
                    // 第二步：并行上传
                    const uploaded = (await concurrentMap(prepared, async (img) => {
                        const uploadParams = {pageId: pageId};
                        if (opts.spaceId) uploadParams.spaceId = opts.spaceId;
                        try {
                            const uploadResult = await uploadRequest(config, '/openApi/v1/space/page/file/upload', uploadParams, img.filePath);
                            if (uploadResult && uploadResult.errCode === 200 && uploadResult.data && uploadResult.data.errno === 0 && uploadResult.data.data) {
                                console.log('图片上传成功: ' + path.basename(img.filePath));
                                return {...img, newUrl: uploadResult.data.data.url};
                            }
                            const errMsg = (uploadResult && uploadResult.data && uploadResult.data.message) || (uploadResult && uploadResult.errMsg) || '';
                            console.log('图片上传失败: ' + path.basename(img.filePath) + ' ' + errMsg);
                        } catch (err) {
                            console.log('图片上传异常: ' + path.basename(img.filePath) + ' ' + err.message);
                        }
                        // 上传失败时清理远程下载的临时文件
                        if (img.isTemp) {
                            try { fs.unlinkSync(img.filePath); } catch (e) { /* 忽略清理错误 */ }
                        }
                        return null;
                    }, 5)).filter(Boolean);
                    // 第三步：替换内容中的地址并清理临时文件
                    for (const img of uploaded) {
                        content = content.split(img.originalSrc).join(img.newUrl);
                        if (img.isTemp) {
                            try { fs.unlinkSync(img.filePath); } catch (e) { /* 忽略清理错误 */ }
                        }
                    }
                    opts.id = pageId;
                }
            }
            // 自动生成预览内容
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
        .description('上传文件的方式新建文档（适用于 doc/docx/pdf/xlsx/zip 等文件导入为在线文档或原始文件，其他类型推荐用 update 命令）')
        .option('--spaceId <spaceId>', '空间ID（必填）', Number)
        .option('--file <file>', '文件路径（必填）')
        // 给cli用的这几种类型就够用了
        // 0=文件夹 1=HTML 2=Markdown 3=表格 4=大纲 5=原始文件 6=API 7=思维导图 8=drawio 9=univer表格 10=引用 11=Excalidraw 12=页面搭建
        .option('--editorType <editorType>', '文档类型（必填） 1=HTML 2=Markdown 5=原始文件 9=在线表格', Number)
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

    cmd.command('update-title')
        .description('修改文档标题')
        .option('--id <id>', '文档ID（必填）', Number)
        .option('--name <name>', '新标题（必填）')
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.id || !opts.name) { console.log('--id 和 --name 不能为空'); return; }
            const params = buildParams(opts, ['id', 'name']);
            try { printResult(await request(config, '/openApi/v1/space/page/updateTitle', params)); }
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

// 递归精简树形 children 字段，只保留指定字段
function filterChildren(data, fields) {
    if (!Array.isArray(data)) return data;
    return data.map(function(item) {
        var filtered = {};
        fields.forEach(function(f) {
            if (f === 'children') {
                if (Array.isArray(item.children) && item.children.length > 0) {
                    filtered.children = filterChildren(item.children, fields);
                }
            } else if (item[f] !== undefined) {
                filtered[f] = item[f];
            }
        });
        return filtered;
    });
}
