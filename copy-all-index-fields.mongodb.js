const sourceDatabase = 'sample_airbnb'
const targetDatabase = 'sample_airbnb_clone'

// Options
const excludeCollections = ['system.profile']
const forceUseSameName = false

use(sourceDatabase)

// Clone all indexes
db.getCollectionNames().forEach(collection => {
  if (excludeCollections.includes(collection)) {
    return
  }

  const sourceCollection = db.getCollection(collection)
  const targetCollection = db.getSiblingDB(targetDatabase).getCollection(collection)

  print(`Cloning indexes for collection ${collection}...`)

  console.log(sourceCollection.getIndexes())

  const clonedIndexes = []

  sourceCollection.getIndexes().forEach((index) => {
    if (index.name === '_id_') {
      return
    }

    console.log(`Cloneing index ${index.name}...`)
    console.log(`>> ${JSON.stringify(index.key)}`)

    const allowedOptions = ['unique', 'background', 'sparse', 'expireAfterSeconds']
    if (forceUseSameName) {
      indexOptions.push('name')
    }

    const indexOptions = allowedOptions.reduce((acc, option) => {
      if (index[option]) {
        acc.push({ [option]: index[option] })
      }

      return acc
    }, [])


    console.log(indexOptions)
    // targetCollection.createIndex(index.key, indexOptions)

    clonedIndexes.push(index.name)
  })

  console.log('Indexes cloned successfully.')
  return clonedIndexes
})
