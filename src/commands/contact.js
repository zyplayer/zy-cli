const { getConfig, request, buildParams, printResult, handleError } = require('../utils/helpers');

/**
 * zy-cli contact —— 通讯录（用户/部门搜索）
 */
module.exports = function(program) {
    const cmd = program.command('contact').description('通讯录管理（用户/部门搜索）');

    cmd.command('search-user')
        .description('搜索用户（通过 名字/手机号/邮箱/账号 搜索）')
        .option('--userName <userName>', '用户名（模糊搜索）')
        .option('--userNo <userNo>', '用户账号')
        .option('--email <email>', '邮箱')
        .option('--phone <phone>', '手机号')
        .action(async (opts) => {
            const config = getConfig();
            const fields = ['id', 'userNo', 'userName', 'email', 'phone'];
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            const params = buildParams(opts, ['userName', 'userNos', 'emails', 'phones'], { userNos: 'userNo', emails: 'email', phones: 'phone' });
            if (params.userNos) params.userNos = [params.userNos];
            if (params.emails) params.emails = [params.emails];
            if (params.phones) params.phones = [params.phones];
            try { printResult(await request(config, '/openApi/v1/user/search', params), fields); }
            catch (err) { handleError(err); }
        });

    cmd.command('search-dept')
        .description('搜索部门（通过部门名模糊搜索）')
        .option('--name <name>', '部门名（必填）')
        .action(async (opts) => {
            const config = getConfig();
            const fields = ['deptId', 'deptName', 'parentId', 'deptDesc'];
            if (!config.url) { console.log('未配置知识库连接信息，请先执行 zy-cli config init'); return; }
            if (!opts.name) { console.log('--name 不能为空'); return; }
            const params = buildParams(opts, ['deptName'], { deptName: 'name' });
            try { printResult(await request(config, '/openApi/v1/dept/search', params), fields); }
            catch (err) { handleError(err); }
        });
};
