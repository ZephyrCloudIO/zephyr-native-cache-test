'use strict';

module.exports = function inlineZephyrE2E({types: t}) {
  return {
    name: 'inline-zephyr-e2e',
    visitor: {
      MemberExpression(path) {
        const node = path.node;
        if (
          node.computed ||
          !t.isIdentifier(node.property, {name: 'ZEPHYR_E2E'}) ||
          !t.isMemberExpression(node.object) ||
          node.object.computed ||
          !t.isIdentifier(node.object.property, {name: 'env'}) ||
          !t.isIdentifier(node.object.object, {name: 'process'})
        ) {
          return;
        }

        path.replaceWith(
          t.stringLiteral(process.env.ZEPHYR_E2E === '1' ? '1' : '0'),
        );
      },
    },
  };
};
