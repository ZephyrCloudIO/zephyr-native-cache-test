'use strict';

module.exports = function inlineZephyrE2E({types: t}) {
  return {
    name: 'inline-zephyr-e2e',
    visitor: {
      MemberExpression(path) {
        const node = path.node;
        if (
          node.computed ||
          !t.isMemberExpression(node.object) ||
          node.object.computed ||
          !t.isIdentifier(node.object.property, {name: 'env'}) ||
          !t.isIdentifier(node.object.object, {name: 'process'}) ||
          !t.isIdentifier(node.property)
        ) {
          return;
        }
        const flag = node.property.name;
        if (flag === 'ZEPHYR_E2E') {
          path.replaceWith(t.stringLiteral(process.env.ZEPHYR_E2E === '1' ? '1' : '0'));
        } else if (flag === 'ZEPHYR_BUILD_ONCE_DEMO') {
          path.replaceWith(t.stringLiteral(process.env.ZEPHYR_BUILD_ONCE_DEMO === '1' ? '1' : '0'));
        } else if (flag === 'ZEPHYR_BUILD_ONCE_RUN_ID') {
          path.replaceWith(t.stringLiteral(process.env.ZEPHYR_BUILD_ONCE_RUN_ID || ''));
        }
      },
    },
  };
};
