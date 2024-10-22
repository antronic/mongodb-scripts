const database = 'sample_airbnb_clone'

// Create index for all collection
const indexFieldName = 'name'
const indexDirection = 1

use(database)

db.getCollectionNames().forEach(collection => {
  const targetCollection = db.getCollection(collection)

  print(`Creating index for collection ${collection}...`)

  targetCollection.createIndex({ [indexFieldName]: indexDirection })
})