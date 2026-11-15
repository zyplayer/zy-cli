const labels = {
    yes: '是',
    no: '否',
    paramName: '参数名',
    paramType: '参数类型',
    whetherRequired: '是否必填',
    paramDesc: '参数说明',
    exampleValue: '示例值',
    param: '参数',
    responseExample: '响应示例',
};

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateObjectList(value, field) {
    if (!Array.isArray(value) || !value.every(isObject)) {
        throw new Error(field + ' 必须是对象数组');
    }
}

function validateSchema(node, field) {
    if (!isObject(node) || typeof node.type !== 'string') {
        throw new Error(field + ' 必须包含有效的结构树节点');
    }
    if (node.type === 'object' || node.type === 'array') {
        const childrenField = field + '.children';
        validateObjectList(node.children, childrenField);
        for (const [index, child] of node.children.entries()) {
            validateSchema(child, childrenField + '[' + index + ']');
        }
    }
}

function validateApiDocument(api) {
    if (!isObject(api) || typeof api.method !== 'string' || !api.method.trim()
        || typeof api.apiUrl !== 'string' || !api.apiUrl.trim()) {
        throw new Error('正文必须是包含 method 和 apiUrl 的 API 编辑器 JSON 对象');
    }

    for (const field of ['urlParams', 'headerParams', 'cookieParams', 'formParams', 'formEncodeParams', 'response']) {
        validateObjectList(api[field], field);
    }
    // 兼容旧版编辑器未保存的字段
    for (const field of ['pathParams', 'beforeActions', 'afterActions']) {
        validateObjectList(api[field] ?? [], field);
    }
    if (api.bodyParamType === 'row' && ['json', 'xml'].includes(api.bodyConsumesType)) {
        validateSchema(api.bodyParamObj, 'bodyParamObj');
    }
    for (const [index, response] of api.response.entries()) {
        if (['json', 'xml'].includes(response.contentType)) {
            validateSchema(response.data, 'response[' + index + '].data');
        }
    }
}

function buildApiDocumentPreview(content) {
    const api = JSON.parse(content);
    validateApiDocument(api);
    return apiObjToMarkdown(api, key => labels[key] ?? key);
}

// 同步自 doc-ui/src/assets/js/apiDocUtil.js，供独立发布的 CLI 包使用。
// 递归展开JSON树结构为扁平表格行
function flattenJsonTree(node, path, rows) {
    if (!node) return;
    if (!node.name && !node.type) return;
    let fullPath = path ? (path + '.' + node.name) : node.name;
    if (node.readonly && node.children && node.children.length > 0) {
        node.children.forEach(child => flattenJsonTree(child, '', rows));
        return;
    }
    if (node.type === 'object') {
        if (node.name) rows.push([fullPath, 'object', node.desc || '']);
        if (node.children) node.children.forEach(child => flattenJsonTree(child, fullPath, rows));
    } else if (node.type === 'array') {
        if (node.name) rows.push([fullPath + '[]', 'array', node.desc || '']);
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => flattenJsonTree(child, fullPath + '[]', rows));
        }
    } else {
        if (node.name) rows.push([fullPath, node.type || 'string', node.desc || '']);
    }
}

// 参数表格转Markdown section
function escapeMarkdownTableCell(value) {
    return (value === undefined || value === null) ? '' : (value + '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br/>');
}

function buildMarkdownTableRow(row) {
    return '| ' + row.map(escapeMarkdownTableCell).join(' | ') + ' |';
}

function appendParamMd(lines, title, paramList, _t) {
    if (!paramList || paramList.length === 0) return;
    let rows = [];
    paramList.forEach(item => {
        if (!item.name) return;
        let required = item.required ? _t('yes') : _t('no');
        rows.push(buildMarkdownTableRow([item.name, item.type || '', required, item.desc || '', item.value || '']));
    });
    if (rows.length === 0) return;
    lines.push('');
    lines.push('## ' + title);
    lines.push('');
    lines.push('| ' + [_t('paramName'), _t('paramType'), _t('whetherRequired'), _t('paramDesc'), _t('exampleValue')].join(' | ') + ' |');
    lines.push('|--------|------|------|------|--------|');
    rows.forEach(row => lines.push(row));
}

// 构建请求体Markdown
function buildBodyMd(apiObj, _t) {
    if (apiObj.bodyParamType === 'none') return '';
    let headerLine = '| ' + [_t('paramName'), _t('paramType'), _t('paramDesc')].join(' | ') + ' |';
    let separatorLine = '|--------|------|------|';
    if (apiObj.bodyParamType === 'form') {
        let rows = [];
        (apiObj.formParams || []).forEach(item => {
            if (!item.name) return;
            rows.push([item.name, item.type || '', item.desc || '']);
        });
        if (rows.length === 0) return '';
        let lines = ['', headerLine, separatorLine];
        rows.forEach(row => lines.push(buildMarkdownTableRow(row)));
        return lines.join('\n');
    }
    if (apiObj.bodyParamType === 'formEncode') {
        let rows = [];
        (apiObj.formEncodeParams || []).forEach(item => {
            if (!item.name) return;
            rows.push([item.name, item.type || '', item.desc || '']);
        });
        if (rows.length === 0) return '';
        let lines = ['', headerLine, separatorLine];
        rows.forEach(row => lines.push(buildMarkdownTableRow(row)));
        return lines.join('\n');
    }
    if (apiObj.bodyParamType === 'row') {
        if (['json', 'xml'].includes(apiObj.bodyConsumesType)) {
            let rows = [];
            flattenJsonTree(apiObj.bodyParamObj, '', rows);
            if (rows.length === 0) return '';
            let lines = ['', headerLine, separatorLine];
            rows.forEach(row => lines.push(buildMarkdownTableRow(row)));
            return lines.join('\n');
        } else if (apiObj.bodyParamRow) {
            return '\n```\n' + apiObj.bodyParamRow + '\n```';
        }
    }
    return '';
}

/**
 * 将API接口文档对象转换为Markdown格式
 * @param {Object} apiObj API文档对象
 * @param {Function} t 可选，i18n翻译函数，不传则使用中文兜底
 * @returns {string} Markdown内容
 */
function apiObjToMarkdown(apiObj, t) {
    const _t = (key) => t ? t(key) : key;
    let lines = [];
    lines.push('`' + apiObj.method.toUpperCase() + '` `' + apiObj.apiUrl + '`');
    if (apiObj.description) {
        lines.push('');
        lines.push(apiObj.description);
    }
    appendParamMd(lines, 'Query ' + _t('param'), apiObj.urlParams, _t);
    appendParamMd(lines, 'Path ' + _t('param'), apiObj.pathParams, _t);
    appendParamMd(lines, 'Header ' + _t('param'), apiObj.headerParams, _t);
    appendParamMd(lines, 'Cookie ' + _t('param'), apiObj.cookieParams, _t);
    let bodyMd = buildBodyMd(apiObj, _t);
    if (bodyMd) {
        lines.push('');
        lines.push('## ' + 'Body ' + _t('param'));
        lines.push(bodyMd);
    }
    if (apiObj.response && apiObj.response.length > 0) {
        lines.push('');
        lines.push('## ' + _t('responseExample'));
        apiObj.response.forEach(response => {
            lines.push('');
            let respTitle = response.statusCode ? (response.statusCode + '') : '';
            if (response.name) respTitle += ' ' + response.name;
            lines.push('### ' + respTitle);
            if (['json', 'xml'].includes(response.contentType)) {
                let rows = [];
                flattenJsonTree(response.data, '', rows);
                if (rows.length > 0) {
                    lines.push('');
                    lines.push('| ' + [_t('paramName'), _t('paramType'), _t('paramDesc')].join(' | ') + ' |');
                    lines.push('|--------|------|------|');
                    rows.forEach(row => lines.push(buildMarkdownTableRow(row)));
                }
            } else if (response.dataContent) {
                lines.push('');
                lines.push('```');
                lines.push(response.dataContent);
                lines.push('```');
            }
        });
    }
    return lines.join('\n');
}

module.exports = {buildApiDocumentPreview};
