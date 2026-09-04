module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [require.resolve('./babel-plugin-inline-zephyr-e2e')],
};
