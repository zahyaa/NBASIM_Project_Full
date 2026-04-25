const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async () => {
  const mongod = await MongoMemoryServer.create();
  global.__MONGOD__ = mongod;
  process.env.MONGO_URI_TEST = mongod.getUri();
  // Stash on a known global so teardown can stop it
  globalThis.__MONGOD__ = mongod;
};
