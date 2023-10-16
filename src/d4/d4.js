const {
    VALID_CLASSES,
    CLASS_ALIAS_MAP,
    VALID_BUILDS,
    BUILD_ALIAS_MAP,
    BUILD_CLASS_MAP,
} = require('./constants.js');

const TEMPLATE = 'https://maxroll.gg/d4/build-guides/{build}-{class}-guide';

function resolveClass(classToken) {
    if (VALID_CLASSES.has(classToken)) {
        return classToken;
    }

    if (CLASS_ALIAS_MAP.has(classToken)) {
        return CLASS_ALIAS_MAP.get(classToken);
    }

    return null;
}

function resolveBuild(buildToken) {
    if (VALID_BUILDS.has(buildToken)) {
        return buildToken;
    }

    if (BUILD_ALIAS_MAP.has(buildToken)) {
        return BUILD_ALIAS_MAP.get(buildToken);
    }

    return null;
}

function isValidBuildForClass(resolvedBuild, resolvedClass) {
    return BUILD_CLASS_MAP.get(resolvedClass).has(resolvedBuild);
}

module.exports = function buildResponse(message) {
    const tokens = message.split(' ');
    if (tokens[0].trim() === 'tierlist') {
        return 'https://maxroll.gg/d4/tierlists/endgame-tier-list';
    }
    
    if (tokens.length < 2) {
        return 'Invalid command -- use zz d4 {class} {build}';
    }

    console.log(tokens);

    const classToken = tokens[0];
    const buildToken = tokens[1];

    const resolvedClass = resolveClass(classToken);
    if (resolvedClass == null) {
        return 'Class not found';
    }

    const resolvedBuild = resolveBuild(buildToken);
    if (resolvedBuild == null) {
        return 'Build not found';
    }

    if (!isValidBuildForClass(resolvedBuild, resolvedClass)) {
        return 'Invalid class/build combination' + ' ' + resolvedBuild + ' ' + resolvedClass;
    }

    const url = TEMPLATE
        .replace('{class}', resolvedClass)
        .replace('{build}', resolvedBuild);

    return url;
}