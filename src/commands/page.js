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
        .option('--parentId <parentId>', '只查看指定父文档下的文档', Number)
        .option('--depth <depth>', '控制树深度，0=只看当前层', Number)
        .option('--flat', '输出扁平列表，方便脚本 grep')
        .action(async (opts) => {
            const config = getConfig();
            const fields = [
                'id', 'name', 'spaceId', 'parentId', 'editorType', 'level', 'path', 'children'
            ];
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.spaceId) { console.log('--spaceId 不能为空'); return; }
            const params = buildParams(opts, ['spaceId']);
            try {
                const result = await request(config, '/openApi/v1/space/page/list', params);
                let data = filterChildren(result.data, fields);
                if (opts.parentId !== undefined) {
                    data = findChildrenByParentId(data, opts.parentId);
                }
                if (opts.depth !== undefined) {
                    data = limitTreeDepth(data, opts.depth);
                }
                if (opts.flat) {
                    data = flattenTree(data);
                }
                result.data = data;
                const outputFields = opts.flat
                    ? ['id', 'name', 'spaceId', 'parentId', 'editorType', 'level', 'path']
                    : fields;
                printResult(result, outputFields);
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
        .option('--file <file>', '文档内容的文件路径，为空则会清除文档原有内容（必填）')
        .option('--quotePageId <quotePageId>', '引用源文档ID，创建引用文档（editorType=10）时使用', Number)
        .option('--quoteSpaceId <quoteSpaceId>', '引用源文档所在空间ID（与quotePageId配合使用）', Number)
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.spaceId || !opts.name) { console.log('--spaceId 和 --name 不能为空'); return; }
            const result = await updatePage(config, opts);
            if (result) printResult(result);
        });

    cmd.command('sync-dir')
        .description('批量同步目录中的 Markdown/HTML 文档，自动按目录创建文件夹')
        .option('--spaceId <spaceId>', '空间ID（必填）', Number)
        .option('--parentId <parentId>', '父文档ID', Number)
        .option('--dir <dir>', '本地目录（必填）')
        .option('--pattern <pattern>', '文件匹配规则，默认 *.md', '*.md')
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.spaceId || !opts.dir) { console.log('--spaceId 和 --dir 不能为空'); return; }

            const rootDir = path.resolve(opts.dir);
            if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
                console.log('--dir 必须是已存在的目录');
                return;
            }

            let files = [];
            try {
                files = listMatchedFiles(rootDir, opts.pattern || '*.md');
            } catch (err) {
                console.log('扫描目录失败: ' + err.message);
                return;
            }
            if (files.length === 0) {
                printResult({ errCode: 200, data: { total: 0, success: [], failures: [] } });
                return;
            }

            let treeResult;
            try {
                treeResult = await request(config, '/openApi/v1/space/page/list', { spaceId: opts.spaceId });
            } catch (err) {
                handleError(err);
                return;
            }
            if (!treeResult || treeResult.errCode !== 200 || !Array.isArray(treeResult.data)) {
                printResult(treeResult);
                return;
            }

            const childrenMap = buildChildrenMap(treeResult.data);
            const parentId = opts.parentId || 0;
            const success = [];
            const failures = [];

            for (const file of files) {
                const relPath = normalizePath(path.relative(rootDir, file));
                try {
                    const editorType = getEditorTypeByFile(file);
                    if (editorType === undefined) {
                        failures.push({ file: relPath, error: '不支持的文件类型，当前仅支持 .md/.markdown/.html/.htm' });
                        continue;
                    }
                    const targetParentId = await ensureDirPath(config, opts.spaceId, parentId, path.dirname(relPath), childrenMap);
                    const name = path.basename(file, path.extname(file));
                    const existedPage = findChild(childrenMap, targetParentId, name, function(item) {
                        return item.editorType !== 0;
                    });
                    const pageOpts = {
                        id: existedPage && existedPage.id,
                        spaceId: opts.spaceId,
                        parentId: targetParentId,
                        name: name,
                        editorType: editorType,
                        file: file,
                    };
                    const result = await updatePage(config, pageOpts);
                    if (!result || result.errCode !== 200 || !result.data) {
                        failures.push({ file: relPath, error: (result && result.errMsg) || '同步失败' });
                        continue;
                    }
                    const pageId = result.data.id || pageOpts.id;
                    upsertChild(childrenMap, targetParentId, {
                        id: pageId,
                        name: name,
                        spaceId: opts.spaceId,
                        parentId: targetParentId,
                        editorType: editorType,
                    });
                    success.push({ file: relPath, pageId: pageId, action: pageOpts.id ? 'update' : 'create' });
                } catch (err) {
                    failures.push({ file: relPath, error: err.message });
                }
            }

            if (failures.length > 0) process.exitCode = 1;
            printResult({
                errCode: failures.length > 0 ? 500 : 200,
                errMsg: failures.length > 0 ? '部分文件同步失败' : undefined,
                data: {
                    total: files.length,
                    successCount: success.length,
                    failureCount: failures.length,
                    success: success,
                    failures: failures,
                },
            });
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
        .option('--pageSize <pageSize>', '每页数量（默认值：15，最大100）', Number)
        .option('--fromName <v>', '是否搜索文档名 0=否 1=是（默认1）', Number)
        .option('--fromContent <v>', '是否搜索文档内容 0=否 1=是（默认1）', Number)
        .action(async (opts) => {
            const config = getConfig();
            const fields = [
                'pageId', 'pageTitle', 'previewContent', 'spaceId', 'spaceName', 'paragraphList'
            ];
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.keywords) { console.log('--keywords 不能为空'); return; }
            const params = buildParams(opts, ['spaceId', 'keywords', 'pageNum', 'pageSize', 'fromName', 'fromContent']);
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

// 新增或修改文档的共用实现，page update 和 sync-dir 都走这里
async function updatePage(config, opts) {
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
    if (opts.id) {
        opts.editVersion = await fetchEditVersion(config, opts.id);
        if (opts.editVersion === undefined) {
            console.log('获取文档版本号失败，无法更新文档');
            return;
        }
    }
    const params = buildParams(opts, ['id', 'name', 'spaceId', 'parentId', 'editorType', 'editVersion', 'quotePageId', 'quoteSpaceId']);
    params.content = content;
    params.preview = preview;
    try { return await request(config, '/openApi/v1/space/page/update', params); }
    catch (err) { handleError(err); return null; }
}

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

function findChildrenByParentId(data, parentId) {
    if (!Array.isArray(data)) return data;
    const normalizedParentId = Number(parentId || 0);
    if (normalizedParentId === 0) return data;
    const node = findNodeById(data, normalizedParentId);
    return node && Array.isArray(node.children) ? node.children : [];
}

function findNodeById(data, id) {
    for (const item of data || []) {
        if (Number(item.id) === Number(id)) return item;
        const found = findNodeById(item.children, id);
        if (found) return found;
    }
    return null;
}

function limitTreeDepth(data, depth) {
    const maxDepth = Math.max(Number(depth), 0);
    function walk(items, level) {
        if (!Array.isArray(items)) return items;
        return items.map(function(item) {
            const next = Object.assign({}, item);
            if (level >= maxDepth) {
                delete next.children;
            } else if (Array.isArray(next.children)) {
                next.children = walk(next.children, level + 1);
            }
            return next;
        });
    }
    return walk(data, 0);
}

function flattenTree(data) {
    const list = [];
    function walk(items, level, parentPath) {
        for (const item of items || []) {
            const currentPath = parentPath ? parentPath + '/' + item.name : item.name;
            const flatItem = Object.assign({}, item, {
                level: level,
                path: currentPath,
            });
            delete flatItem.children;
            list.push(flatItem);
            walk(item.children, level + 1, currentPath);
        }
    }
    walk(data, 0, '');
    return list;
}

async function fetchEditVersion(config, pageId) {
    let detailResult;
    try {
        detailResult = await request(config, '/openApi/v1/space/page/detail', { id: pageId });
    } catch (err) {
        handleError(err);
        return undefined;
    }
    return detailResult && detailResult.data && detailResult.data.wikiPage
        ? detailResult.data.wikiPage.editVersion
        : undefined;
}

function listMatchedFiles(rootDir, pattern) {
    const matcher = createPatternMatcher(pattern);
    const files = [];
    walkDir(rootDir, function(file) {
        const relPath = normalizePath(path.relative(rootDir, file));
        if (matcher(relPath, path.basename(file))) {
            files.push(file);
        }
    });
    return files.sort(function(a, b) {
        return normalizePath(a).localeCompare(normalizePath(b));
    });
}

function getEditorTypeByFile(file) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.md' || ext === '.markdown') return 2;
    if (ext === '.html' || ext === '.htm') return 1;
    return undefined;
}

function walkDir(dir, visitor) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.sort(function(a, b) { return a.name.localeCompare(b.name); });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkDir(fullPath, visitor);
        } else if (entry.isFile()) {
            visitor(fullPath);
        }
    }
}

function createPatternMatcher(pattern) {
    const normalizedPattern = normalizePath(pattern || '*.md');
    const regex = wildcardToRegExp(normalizedPattern);
    const matchRelPath = normalizedPattern.indexOf('/') >= 0;
    return function(relPath, basename) {
        const target = matchRelPath ? normalizePath(relPath) : basename;
        return regex.test(target);
    };
}

function wildcardToRegExp(pattern) {
    let source = '';
    for (const ch of pattern) {
        if (ch === '*') {
            source += '.*';
        } else if (ch === '?') {
            source += '.';
        } else {
            source += ch.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
        }
    }
    return new RegExp('^' + source + '$', 'i');
}

function normalizePath(filePath) {
    return filePath.replace(/\\/g, '/');
}

function buildChildrenMap(tree) {
    const childrenMap = new Map();
    function addChild(parentId, item) {
        const key = normalizeParentId(parentId);
        if (!childrenMap.has(key)) childrenMap.set(key, []);
        childrenMap.get(key).push(item);
    }
    function walk(items, fallbackParentId) {
        for (const item of items) {
            const itemParentId = item.parentId !== undefined && item.parentId !== null ? item.parentId : fallbackParentId;
            addChild(itemParentId || 0, item);
            if (Array.isArray(item.children) && item.children.length > 0) {
                walk(item.children, item.id);
            }
        }
    }
    walk(tree || [], 0);
    return childrenMap;
}

async function ensureDirPath(config, spaceId, parentId, relDir, childrenMap) {
    if (!relDir || relDir === '.') return parentId;
    const parts = normalizePath(relDir).split('/').filter(Boolean);
    let currentParentId = parentId;
    for (const part of parts) {
        let folder = findChild(childrenMap, currentParentId, part, function(item) {
            return item.editorType === 0;
        });
        if (!folder) {
            const result = await request(config, '/openApi/v1/space/page/update', {
                spaceId: spaceId,
                parentId: currentParentId,
                name: part,
                editorType: 0,
                content: '',
                preview: '',
            });
            if (!result || result.errCode !== 200 || !result.data || !result.data.id) {
                throw new Error('创建目录失败: ' + part + ' ' + ((result && result.errMsg) || ''));
            }
            folder = {
                id: result.data.id,
                name: part,
                spaceId: spaceId,
                parentId: currentParentId,
                editorType: 0,
            };
            upsertChild(childrenMap, currentParentId, folder);
        }
        currentParentId = folder.id;
    }
    return currentParentId;
}

function findChild(childrenMap, parentId, name, predicate) {
    const children = childrenMap.get(normalizeParentId(parentId)) || [];
    return children.find(function(item) {
        return item.name === name && (!predicate || predicate(item));
    });
}

function upsertChild(childrenMap, parentId, child) {
    const key = normalizeParentId(parentId);
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    const children = childrenMap.get(key);
    const index = children.findIndex(function(item) {
        return item.id === child.id || (item.name === child.name && item.editorType === child.editorType);
    });
    if (index >= 0) {
        children[index] = Object.assign({}, children[index], child);
    } else {
        children.push(child);
    }
}

function normalizeParentId(parentId) {
    return Number(parentId || 0);
}
