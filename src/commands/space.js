const { getConfig, request, buildParams, printResult, handleError } = require('../utils/helpers');

/**
 * zy-cli space —— 空间管理
 */
module.exports = function(program) {
    const cmd = program.command('space').description('空间管理');

    cmd.command('list')
        .description('查看空间列表')
        .action(async () => {
            const config = getConfig();
            const fields = [
                    'id', 'name', 'type', 'spaceExplain', 'openDoc', 'versionControl', 'releaseControl', 'aiSyncEnable',
                    'uuid', 'favorite', 'isManager', 'isEditor'
            ];
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            try { printResult(await request(config, '/openApi/v1/space/list'), fields); }
            catch (err) { handleError(err); }
        });

    cmd.command('update')
        .description('新增或修改空间')
        .option('--id <id>', '空间ID，有值为修改，无值为新增', Number)
        .option('--name <name>', '空间名（必填）')
        .option('--type <type>', '空间类型 1=公司 2=个人', Number)
        .option('--explain <explain>', '描述')
        .option('--uuid <uuid>', '唯一UUID')
        .option('--seqNo <seqNo>', '排序', Number)
        .option('--versionControl <v>', '是否开启版本控制 0=否 1=是', Number)
        .option('--viewerExport <v>', '查看者是否支持导出 1=是', Number)
        .option('--copyControl <v>', '是否允许复制 0=否 1=是', Number)
        .option('--chargeUserId <uid>', '负责人ID', Number)
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.name) { console.log('--name 不能为空'); return; }
            const params = buildParams(opts, ['id', 'name', 'type', 'spaceExplain', 'uuid', 'seqNo', 'versionControl', 'viewerAllowedExport', 'copyControl', 'chargeUserId'],
                { spaceExplain: 'explain', viewerAllowedExport: 'viewerExport' });
            try { printResult(await request(config, '/openApi/v1/space/update', params)); }
            catch (err) { handleError(err); }
        });

    cmd.command('create-version')
        .description('空间发版')
        .option('--spaceId <spaceId>', '空间ID（必填）', Number)
        .option('--versionName <versionName>', '版本名（必填）')
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.spaceId || !opts.versionName) { console.log('--spaceId 和 --versionName 不能为空'); return; }
            const params = buildParams(opts, ['spaceId', 'versionName']);
            try { printResult(await request(config, '/openApi/v1/space/createVersion', params)); }
            catch (err) { handleError(err); }
        });

    cmd.command('member-list')
        .description('查看空间成员列表')
        .option('--spaceId <spaceId>', '空间ID（必填）', Number)
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.spaceId) { console.log('--spaceId 不能为空'); return; }
            const params = buildParams(opts, ['spaceId'], { moduleId: 'spaceId' });
            params.moduleType = 1;
            try { printResult(await request(config, '/openApi/v1/spaceAuth/list', params)); }
            catch (err) { handleError(err); }
        });

    cmd.command('member-add')
        .description('添加空间成员')
        .option('--spaceId <spaceId>', '空间ID（必填）', Number)
        .option('--userIds <userIds>', '用户ID，多个逗号分隔')
        .option('--departmentIds <ids>', '部门ID，多个逗号分隔')
        .option('--roleType <roleType>', '角色类型 2=管理员 3=编辑者 4=查看者（必填）', Number)
        .option('--includeChildren <v>', '是否包含子部门 0=否 1=是', Number)
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.spaceId || !opts.roleType) { console.log('--spaceId 和 --roleType 不能为空'); return; }
            const params = buildParams(opts, ['spaceId', 'userIds', 'departmentIds', 'roleType', 'includeChildren']);
            try { printResult(await request(config, '/openApi/v1/spaceAuth/addAuth', params)); }
            catch (err) { handleError(err); }
        });

    cmd.command('member-remove')
        .description('移除空间成员')
        .option('--authId <authId>', '授权记录ID（必填，取 member-list 响应中的 id）', Number)
        .action(async (opts) => {
            const config = getConfig();
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.authId) { console.log('--authId 不能为空'); return; }
            const params = buildParams(opts, ['authId']);
            try { printResult(await request(config, '/openApi/v1/spaceAuth/delAuth', params)); }
            catch (err) { handleError(err); }
        });
};
