const sourceDatabase = ''
const targetDatabase = ''

const excludeCollections = ['system.profile']

use(sourceDatabase)

db.getCollectionNames().forEach(collection => {
  if (excludeCollections.includes(collection)) {
    return
  }

  const sourceCollection = db.getCollection(collection)
  const targetCollection = db.getSiblingDB(targetDatabase).getCollection(collection)

  print(`Cloning collection ${collection}...`)

  sourceCollection.aggregate([
    { $match: {} },
    {
      $out: {
        db: targetDatabase,
        coll: collection,
      }
    }
  ])
})