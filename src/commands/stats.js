const { InvalidArgumentError, Option } = require('commander');
const { getConfig, request, printResult, handleError } = require('../utils/helpers');

function parseDate(value) {
    if (!/^[1-9]\d{7}$/.test(value)) {
        throw new InvalidArgumentError('日期格式须为 yyyyMMdd');
    }
    const iso = value.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
        throw new InvalidArgumentError('请输入有效的日期');
    }
    return Number(value);
}

function parsePositiveInteger(value) {
    const number = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1) {
        throw new InvalidArgumentError('请输入正整数');
    }
    return number;
}

function parseId(value) {
    if (!/^\d{1,19}$/.test(value) || BigInt(value) > 9223372036854775807n) {
        throw new InvalidArgumentError('请输入有效的 ID');
    }
    return value;
}

async function queryStatistics(path, opts, command) {
    if (opts.startDt > opts.endDt) {
        command.error('--startDt 不能晚于 --endDt');
        return;
    }
    const config = getConfig();
    if (!config.url) {
        command.error('未配置知识库连接信息，请先执行 zy-cli config init');
        return;
    }
    const params = { ...opts };
    if (params.dimension !== undefined) {
        params.dimension = Number(params.dimension);
    }
    try {
        const result = await request(config, path, params);
        printResult(result);
        if (result.errCode !== 200) process.exitCode = 1;
    } catch (err) {
        handleError(err);
        process.exitCode = 1;
    }
}

module.exports = function(program) {
    const cmd = program.command('stats').description('数据统计');

    cmd.command('page-list')
        .description('查看文档统计列表')
        .requiredOption('--spaceId <id>', '空间ID', parseId)
        .option('--pageId <id>', '只查看指定文档', parseId)
        .requiredOption('--startDt <date>', '起始日期，格式 yyyyMMdd', parseDate)
        .requiredOption('--endDt <date>', '结束日期，格式 yyyyMMdd', parseDate)
        .addOption(new Option('--dimension <dimension>', '统计维度 1=日 2=周 3=月，默认按日')
            .choices(['1', '2', '3']))
        .option('--pageNum <number>', '页码，默认 1', parsePositiveInteger)
        .option('--pageSize <number>', '每页条数，默认 10', parsePositiveInteger)
        .option('--sortColumn <field>', '排序字段，例如 visitCount')
        .addOption(new Option('--sortOrder <order>', '排序方向').choices(['ascending', 'descending']))
        .action((opts, command) => queryStatistics('/openApi/v1/statistics/page/list', opts, command));

    cmd.command('page-trend')
        .description('查看指定文档的统计趋势')
        .requiredOption('--spaceId <id>', '空间ID', parseId)
        .requiredOption('--pageId <id>', '文档ID', parseId)
        .requiredOption('--startDt <date>', '起始日期，格式 yyyyMMdd', parseDate)
        .requiredOption('--endDt <date>', '结束日期，格式 yyyyMMdd', parseDate)
        .addOption(new Option('--dimension <dimension>', '统计维度 1=日 2=周 3=月，默认按日')
            .choices(['1', '2', '3']))
        .action((opts, command) => queryStatistics('/openApi/v1/statistics/page/listTrend', opts, command));

    cmd.command('space-yesterday')
        .description('查看空间昨日汇总统计')
        .requiredOption('--spaceId <id>', '空间ID', parseId)
        .action((opts, command) => queryStatistics('/openApi/v1/statistics/space/yesterday', opts, command));

    cmd.command('space-trend')
        .description('查看空间汇总统计趋势，每页最多 365 条')
        .requiredOption('--spaceId <id>', '空间ID', parseId)
        .requiredOption('--startDt <date>', '起始日期，格式 yyyyMMdd', parseDate)
        .requiredOption('--endDt <date>', '结束日期，格式 yyyyMMdd', parseDate)
        .addOption(new Option('--dimension <dimension>', '统计维度 1=日 2=周 3=月，默认按日')
            .choices(['1', '2', '3']))
        .option('--pageNum <number>', '页码，默认 1', parsePositiveInteger)
        .option('--sortColumn <field>', '排序字段，例如 visitCount')
        .addOption(new Option('--sortOrder <order>', '排序方向').choices(['ascending', 'descending']))
        .action((opts, command) => queryStatistics('/openApi/v1/statistics/space/list', opts, command));

    cmd.command('user-list')
        .description('查看用户统计列表')
        .requiredOption('--spaceId <id>', '空间ID', parseId)
        .requiredOption('--startDt <date>', '起始日期，格式 yyyyMMdd', parseDate)
        .requiredOption('--endDt <date>', '结束日期，格式 yyyyMMdd', parseDate)
        .addOption(new Option('--dimension <dimension>', '统计维度 1=日 2=周 3=月，默认按日')
            .choices(['1', '2', '3']))
        .option('--pageNum <number>', '页码，默认 1', parsePositiveInteger)
        .option('--pageSize <number>', '每页条数，默认 10', parsePositiveInteger)
        .option('--sortColumn <field>', '排序字段，例如 visitCount')
        .addOption(new Option('--sortOrder <order>', '排序方向').choices(['ascending', 'descending']))
        .action((opts, command) => queryStatistics('/openApi/v1/statistics/user/list', opts, command));

    cmd.command('user-trend')
        .description('查看指定用户的统计趋势')
        .requiredOption('--spaceId <id>', '空间ID', parseId)
        .requiredOption('--userId <id>', '用户ID，0 表示开放文档访客', parseId)
        .requiredOption('--startDt <date>', '起始日期，格式 yyyyMMdd', parseDate)
        .requiredOption('--endDt <date>', '结束日期，格式 yyyyMMdd', parseDate)
        .addOption(new Option('--dimension <dimension>', '统计维度 1=日 2=周 3=月，默认按日')
            .choices(['1', '2', '3']))
        .action((opts, command) => queryStatistics('/openApi/v1/statistics/user/listTrend', opts, command));
};
