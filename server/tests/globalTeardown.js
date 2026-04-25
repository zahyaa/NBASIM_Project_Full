module.exports = async () => {
  const mongod = globalThis.__MONGOD__;
  if (mongod) await mongod.stop();
};
