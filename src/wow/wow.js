const {
    VALID_CLASSES,
    CLASS_ALIAS_MAP,
    VALID_SPECS,
    SPEC_ALIAS_MAP,
    PATHS,
    PATH_MAP,
    SPEC_ROLE_MAP,
    SPEC_CLASS_MAP,
} = require('./constants.js');

const TEMPLATE = 'https://www.wowhead.com/guide/classes/{class}/{spec}/{path}';

function resolveClass(classToken) {
    if (VALID_CLASSES.has(classToken)) {
        return classToken;
    }

    if (CLASS_ALIAS_MAP.has(classToken)) {
        return CLASS_ALIAS_MAP.get(classToken);
    }

    return null;
}

function resolveSpec(specToken) {
    if (VALID_SPECS.has(specToken)) {
        return specToken;
    }

    if (SPEC_ALIAS_MAP.has(specToken)) {
        return SPEC_ALIAS_MAP.get(specToken);
    }

    return null;
}

function resolvePath(pathToken) {
    if (PATH_MAP.has(pathToken)) {
        return PATH_MAP.get(pathToken);
    }

    return null;
}

function resolveRole(resolvedSpec) {
    return SPEC_ROLE_MAP.get(resolvedSpec);
}

function isValidSpecForClass(resolvedSpec, resolvedClass) {
    return SPEC_CLASS_MAP.get(resolvedClass).has(resolvedSpec);
}

module.exports = function buildResponse(message) {
    const tokens = message.split(' ');
    if (tokens[0].trim() === 'tierlist') {
        return 'https://www.wowhead.com/guide/classes/tier-lists/dps-rankings-raids';
    }
    
    if (tokens.length < 2) {
        return 'Invalid command -- use zz {class} {spec} {path: optional}';
    }

    console.log(tokens);

    const classToken = tokens[0];
    const specToken = tokens[1];
    const pathToken = tokens.length > 2 ? tokens[2] : PATHS.Builds;

    const resolvedClass = resolveClass(classToken);
    if (resolvedClass == null) {
        return 'Class not found';
    }

    const resolvedSpec = resolveSpec(specToken);
    if (resolvedSpec == null) {
        return 'Spec not found';
    }

    if (!isValidSpecForClass(resolvedSpec, resolvedClass)) {
        return 'Invalid class/spec combination';
    }

    const resolvedPath = resolvePath(pathToken);
    if (resolvedPath == null) {
        return 'Path not found';
    }

    const resolvedRole = resolveRole(resolvedSpec);

    const url = TEMPLATE
        .replace('{class}', resolvedClass)
        .replace('{spec}', resolvedSpec)
        .replace('{path}', resolvedPath)
        .replace('{role}', resolvedRole);

    return url;
}